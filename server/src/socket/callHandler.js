import crypto from "crypto";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Call from "../models/Call.js";
import { emitToUser, emitToUsers, getSocketIds } from "./registry.js";

// ---------------------------------------------------------------------
// Call signaling.
//
// Media never touches this server: audio/video flows peer-to-peer over
// WebRTC. This module only (1) tracks who is calling whom so busy /
// ringing / missed logic is authoritative, (2) relays SDP offers/answers
// and ICE candidates between the two browsers, and (3) writes the call
// history + the in-chat call record when a call ends.
//
// Live state is in memory (a call can't outlive the process anyway);
// finished calls are persisted as Call + Message documents.
// ---------------------------------------------------------------------

const RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS) || 35000;
// How long a call survives one side dropping off the signaling socket
// (wifi blip, tab sleep) before it's ended as "connection lost".
const RECONNECT_GRACE_MS = Number(process.env.CALL_RECONNECT_GRACE_MS) || 15000;

const calls = new Map(); // callId -> state
const userCalls = new Map(); // userId -> callId (both caller and callee while ringing/active)

export const getUserCallId = (userId) => userCalls.get(String(userId));

const userBrief = (u) => ({ id: String(u._id), name: u.name, username: u.username, avatar: u.avatar || "" });

const publicCall = (doc, callerDoc, calleeDoc) => ({
  _id: doc._id,
  callId: doc.callId,
  conversation: String(doc.conversation),
  caller: callerDoc ? userBrief(callerDoc) : { id: String(doc.caller) },
  callee: calleeDoc ? userBrief(calleeDoc) : { id: String(doc.callee) },
  mode: doc.mode,
  status: doc.status,
  startedAt: doc.startedAt,
  answeredAt: doc.answeredAt,
  endedAt: doc.endedAt,
  duration: doc.duration,
});

// Build ICE server list. STUN is always present; TURN is added when
// configured — either static credentials (TURN_USERNAME/TURN_CREDENTIAL)
// or coturn's time-limited REST credentials (TURN_SECRET).
export const buildIceServers = (userId) => {
  const stun = (process.env.STUN_URLS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const servers = [{ urls: stun }];
  const turnUrls = (process.env.TURN_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (turnUrls.length) {
    if (process.env.TURN_SECRET) {
      const expiry = Math.floor(Date.now() / 1000) + 6 * 3600;
      const username = `${expiry}:${userId}`;
      const credential = crypto.createHmac("sha1", process.env.TURN_SECRET).update(username).digest("base64");
      servers.push({ urls: turnUrls, username, credential });
    } else if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      servers.push({
        urls: turnUrls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
  }
  return servers;
};

const otherParty = (state, userId) => (String(state.callerId) === String(userId) ? state.calleeId : state.callerId);
const socketOf = (state, userId) => (String(state.callerId) === String(userId) ? state.callerSocket : state.calleeSocket);
const isParty = (state, userId) => [String(state.callerId), String(state.calleeId)].includes(String(userId));

// Terminal transition. Idempotent: a second call for the same callId is a
// no-op, so races (both sides hanging up at once, timeout vs accept) are
// harmless.
const finalize = async (io, state, status, reason, byUserId = null) => {
  if (state.finalized) return;
  state.finalized = true;
  clearTimeout(state.ringTimer);
  Object.values(state.graceTimers).forEach(clearTimeout);
  calls.delete(state.callId);
  if (userCalls.get(String(state.callerId)) === state.callId) userCalls.delete(String(state.callerId));
  if (userCalls.get(String(state.calleeId)) === state.callId) userCalls.delete(String(state.calleeId));

  const endedAt = new Date();
  const duration = state.answeredAt ? Math.max(0, Math.round((endedAt - state.answeredAt) / 1000)) : 0;

  const payload = { callId: state.callId, conversationId: state.conversationId, status, reason, duration, by: byUserId };
  emitToUsers(io, [state.callerId, state.calleeId], "call:ended", payload);

  try {
    const doc = await Call.create({
      callId: state.callId,
      conversation: state.conversationId,
      caller: state.callerId,
      callee: state.calleeId,
      mode: state.mode,
      status,
      startedAt: state.startedAt,
      answeredAt: state.answeredAt,
      endedAt,
      duration,
    });

    const message = await Message.create({
      conversation: state.conversationId,
      sender: state.callerId,
      type: "call",
      text: "",
      call: { callId: state.callId, mode: state.mode, status, duration },
      deliveredTo: [state.callerId],
      readBy: [state.callerId],
    });
    doc.message = message._id;
    await doc.save();

    await Conversation.findByIdAndUpdate(state.conversationId, { lastMessage: message._id });

    const populated = await message.populate([{ path: "sender", select: "name username avatar" }]);
    io.to(`conversation:${state.conversationId}`).emit("message:new", populated);

    const [callerDoc, calleeDoc] = await Promise.all([
      User.findById(state.callerId).select("name username avatar"),
      User.findById(state.calleeId).select("name username avatar"),
    ]);
    emitToUsers(io, [state.callerId, state.calleeId], "call:record", publicCall(doc, callerDoc, calleeDoc));
  } catch (err) {
    console.error("Failed to persist call record:", err.message);
  }
};

export const registerCallHandlers = (io, socket, { blockedEitherWayIds }) => {
  const userId = socket.userId;

  socket.on("call:invite", async ({ conversationId, mode } = {}, ack) => {
    try {
      if (!["audio", "video"].includes(mode)) return ack?.({ error: "Invalid call type." });
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.members.some((m) => String(m) === userId)) {
        return ack?.({ error: "Not a member of this conversation." });
      }
      if (conversation.isGroup) return ack?.({ error: "Calls are available in one-to-one chats." });

      const calleeId = conversation.members.map(String).find((m) => m !== userId);
      if (!calleeId) return ack?.({ error: "Nobody to call." });

      const blocked = await blockedEitherWayIds(userId);
      if (blocked.has(calleeId)) return ack?.({ error: "You can't call this user." });

      if (userCalls.has(userId)) return ack?.({ error: "You're already in a call." });

      const callId = crypto.randomUUID();
      const state = {
        callId,
        conversationId: String(conversation._id),
        callerId: userId,
        calleeId,
        mode,
        startedAt: new Date(),
        answeredAt: null,
        callerSocket: socket.id,
        calleeSocket: null,
        graceTimers: {},
        finalized: false,
      };

      // Callee already on another call -> busy, immediately.
      if (userCalls.has(calleeId)) {
        calls.set(callId, state);
        await finalize(io, state, "busy", "busy");
        const caller = await User.findById(userId).select("name username avatar");
        emitToUser(io, calleeId, "call:busy-notice", {
          conversationId: state.conversationId,
          mode,
          caller: userBrief(caller),
        });
        return ack?.({ busy: true, callId });
      }

      calls.set(callId, state);
      userCalls.set(userId, callId);
      userCalls.set(calleeId, callId);

      state.ringTimer = setTimeout(() => finalize(io, state, "missed", "no-answer"), RING_TIMEOUT_MS);

      const caller = await User.findById(userId).select("name username avatar");
      const calleeSockets = getSocketIds(calleeId);
      calleeSockets.forEach((sid) =>
        io.to(sid).emit("call:incoming", {
          callId,
          conversationId: state.conversationId,
          mode,
          caller: userBrief(caller),
          ringTimeoutMs: RING_TIMEOUT_MS,
        })
      );
      if (calleeSockets.length > 0) socket.emit("call:ringing", { callId });

      ack?.({ callId, ringing: calleeSockets.length > 0, ringTimeoutMs: RING_TIMEOUT_MS });
    } catch (err) {
      console.error("call:invite failed:", err);
      ack?.({ error: "Couldn't start the call." });
    }
  });

  socket.on("call:accept", ({ callId } = {}, ack) => {
    const state = calls.get(callId);
    if (!state || String(state.calleeId) !== userId || state.status === "active" || state.answeredAt) {
      return ack?.({ error: "This call is no longer available." });
    }
    clearTimeout(state.ringTimer);
    state.answeredAt = new Date();
    state.calleeSocket = socket.id;
    // Dismiss the incoming-call UI on the callee's other tabs/devices.
    getSocketIds(userId)
      .filter((sid) => sid !== socket.id)
      .forEach((sid) => io.to(sid).emit("call:handled", { callId }));
    io.to(state.callerSocket).emit("call:accepted", { callId });
    ack?.({ ok: true });
  });

  socket.on("call:reject", ({ callId } = {}) => {
    const state = calls.get(callId);
    if (!state || String(state.calleeId) !== userId || state.answeredAt) return;
    getSocketIds(userId)
      .filter((sid) => sid !== socket.id)
      .forEach((sid) => io.to(sid).emit("call:handled", { callId }));
    finalize(io, state, "declined", "declined", userId);
  });

  socket.on("call:end", ({ callId } = {}) => {
    const state = calls.get(callId);
    if (!state || !isParty(state, userId)) return;
    if (state.answeredAt) return finalize(io, state, "ended", "hangup", userId);
    if (String(state.callerId) === userId) return finalize(io, state, "canceled", "canceled", userId);
    return finalize(io, state, "declined", "declined", userId);
  });

  // Relay SDP / ICE to the other party's active socket.
  socket.on("call:signal", ({ callId, data } = {}) => {
    const state = calls.get(callId);
    if (!state || !isParty(state, userId) || !data) return;
    const target = socketOf(state, otherParty(state, userId));
    if (target) io.to(target).emit("call:signal", { callId, data });
  });

  socket.on("call:media-state", ({ callId, muted, cameraOff } = {}) => {
    const state = calls.get(callId);
    if (!state || !isParty(state, userId)) return;
    const target = socketOf(state, otherParty(state, userId));
    if (target) io.to(target).emit("call:media-state", { callId, muted: !!muted, cameraOff: !!cameraOff });
  });

  // After a socket reconnect the client re-attaches its new socket to the
  // call it was in, and the peer is told so it can restart ICE.
  socket.on("call:resume", ({ callId } = {}, ack) => {
    const state = calls.get(callId);
    if (!state || !isParty(state, userId)) {
      socket.emit("call:ended", { callId, status: "failed", reason: "not-found", duration: 0 });
      return ack?.({ error: "Call not found." });
    }
    if (String(state.callerId) === userId) state.callerSocket = socket.id;
    else if (state.answeredAt) state.calleeSocket = socket.id;
    clearTimeout(state.graceTimers[userId]);
    delete state.graceTimers[userId];
    const target = socketOf(state, otherParty(state, userId));
    if (target) io.to(target).emit("call:peer-resumed", { callId });
    ack?.({ ok: true, answered: !!state.answeredAt });
  });
};

// Called by the connection handler whenever any socket of a user drops.
export const handleCallDisconnect = (io, userId, socketId) => {
  const callId = userCalls.get(String(userId));
  const state = callId && calls.get(callId);
  if (!state) return;

  if (!state.answeredAt) {
    // Caller vanished while ringing -> treat as canceled.
    if (String(state.callerId) === String(userId) && state.callerSocket === socketId) {
      finalize(io, state, "canceled", "caller-disconnected", userId);
    }
    return;
  }

  if (socketOf(state, userId) !== socketId) return;
  const target = socketOf(state, otherParty(state, userId));
  if (target) io.to(target).emit("call:peer-reconnecting", { callId });
  clearTimeout(state.graceTimers[userId]);
  state.graceTimers[userId] = setTimeout(
    () => finalize(io, state, "ended", "connection-lost", userId),
    RECONNECT_GRACE_MS
  );
};

export const callHistoryFor = async (userId, limit = 100) => {
  const docs = await Call.find({ $or: [{ caller: userId }, { callee: userId }] })
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate("caller", "name username avatar")
    .populate("callee", "name username avatar");
  return docs.map((d) => publicCall(d, d.caller, d.callee));
};
