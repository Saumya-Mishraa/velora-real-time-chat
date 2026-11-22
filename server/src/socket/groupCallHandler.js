import crypto from "crypto";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Call from "../models/Call.js";
import { emitToUser, emitToUsers, getSocketIds } from "./registry.js";
import { getUserCallId, publicCall } from "./callHandler.js";
import { setUserGroupCall, clearUserGroupCall, getUserGroupCallId } from "./callPresence.js";

// ---------------------------------------------------------------------
// Group calls (voice + video), mesh WebRTC, max 4 participants.
//
// Separate from the one-to-one path in callHandler.js, which is untouched
// apart from a "busy" check against this module (see callPresence.js).
// As with 1:1 calls, media never touches the server: this module tracks
// who is in which call, enforces the participant cap and block rules,
// relays SDP/ICE to exactly ONE target peer, and persists the history.
//
// Client -> server (all take an optional ack):
//   group-call:start        { conversationId, mode }        -> { callId, ... }
//   group-call:join         { callId }                      -> { participants, ... }
//   group-call:leave        { callId }
//   group-call:decline      { callId }
//   group-call:signal       { callId, to, data }            (SDP / ICE for one peer)
//   group-call:media-state  { callId, muted, cameraOff, sharing }
//   group-call:resume       { callId }                      (after a socket reconnect)
//   group-call:status       { conversationId }              -> { active, ... } (join banner)
// Server -> client:
//   group-call:ring / :ring-ended / :handled / :state / :participant-joined /
//   :participant-left / :signal / :media-state / :peer-reconnecting /
//   :peer-resumed / :ended
// ---------------------------------------------------------------------

export const GROUP_CALL_MAX_PARTICIPANTS = 4;
const RING_TIMEOUT_MS = Number(process.env.GROUP_CALL_RING_TIMEOUT_MS || process.env.CALL_RING_TIMEOUT_MS) || 35000;
const RECONNECT_GRACE_MS = Number(process.env.CALL_RECONNECT_GRACE_MS) || 15000;
const MAX_SIGNAL_BYTES = 64 * 1024;

const groupCalls = new Map(); // callId -> state
const conversationCalls = new Map(); // conversationId -> callId (one live call per group)

const userBrief = (u) => ({ id: String(u._id), name: u.name, username: u.username, avatar: u.avatar || "" });

const participantView = (userDoc, p) => ({
  userId: String(userDoc._id || userDoc.id),
  name: userDoc.name,
  username: userDoc.username,
  avatar: userDoc.avatar || "",
  muted: !!p.muted,
  cameraOff: !!p.cameraOff,
  sharing: !!p.sharing,
  hand: !!p.hand,
});

const isUserBusy = (userId) => !!getUserCallId(userId) || !!getUserGroupCallId(userId);

const publicState = (s) => ({
  conversationId: s.conversationId,
  active: true,
  callId: s.callId,
  mode: s.mode,
  startedBy: s.startedBy,
  startedAt: s.startedAt,
  participantIds: Array.from(s.participants.keys()),
  max: GROUP_CALL_MAX_PARTICIPANTS,
});

const broadcastState = (io, s) => {
  emitToUsers(io, s.audience, "group-call:state", publicState(s));
};

const allDoneRinging = (s) => Array.from(s.invited.values()).every((i) => i.status !== "ringing");

// Everyone who should see/hear about this call: members not blocked
// either way with whoever started it.
const computeAudience = async (conversation, starterId, blockedEitherWayIds) => {
  const blocked = await blockedEitherWayIds(starterId);
  return conversation.members.map(String).filter((m) => m === String(starterId) || !blocked.has(m));
};

// Terminal transition. Idempotent (races between the last leave, ring
// timeouts and disconnect grace timers are harmless).
const finalize = async (io, s, status, reason) => {
  if (s.finalized) return;
  s.finalized = true;
  groupCalls.delete(s.callId);
  if (conversationCalls.get(s.conversationId) === s.callId) conversationCalls.delete(s.conversationId);
  s.invited.forEach((i) => clearTimeout(i.timer));
  s.participants.forEach((p, uid) => {
    clearTimeout(p.graceTimer);
    clearUserGroupCall(uid, s.callId);
  });

  const endedAt = new Date();
  const duration = s.answeredAt ? Math.max(0, Math.round((endedAt - s.answeredAt) / 1000)) : 0;
  const payload = { callId: s.callId, conversationId: s.conversationId, status, reason, duration };
  emitToUsers(io, [...s.audience, ...s.everJoined.keys()], "group-call:ended", payload);
  emitToUsers(io, s.audience, "group-call:state", { conversationId: s.conversationId, active: false, callId: s.callId });

  try {
    const roster = [];
    const seen = new Set();
    s.everJoined.forEach((j, uid) => {
      seen.add(uid);
      roster.push({ user: uid, joinedAt: j.joinedAt, leftAt: j.leftAt || endedAt, status: "joined" });
    });
    s.invited.forEach((i, uid) => {
      if (!seen.has(uid)) roster.push({ user: uid, status: i.status === "declined" ? "declined" : "missed" });
    });

    const doc = await Call.create({
      callId: s.callId,
      conversation: s.conversationId,
      caller: s.startedBy,
      isGroup: true,
      mode: s.mode,
      status,
      startedAt: s.startedAt,
      answeredAt: s.answeredAt || undefined,
      endedAt,
      duration,
      participants: roster,
    });

    const message = await Message.create({
      conversation: s.conversationId,
      sender: s.startedBy,
      type: "call",
      text: "",
      call: { callId: s.callId, mode: s.mode, status, duration, isGroup: true, participantCount: s.everJoined.size },
      deliveredTo: [s.startedBy],
      readBy: [s.startedBy],
    });
    doc.message = message._id;
    await doc.save();
    await Conversation.findByIdAndUpdate(s.conversationId, { lastMessage: message._id });

    const populated = await message.populate([{ path: "sender", select: "name username avatar" }]);
    io.to(`conversation:${s.conversationId}`).emit("message:new", populated);

    // Calls tab: tell everyone who joined or was rung.
    const [conversation, starter, users] = await Promise.all([
      Conversation.findById(s.conversationId).select("name avatar"),
      User.findById(s.startedBy).select("name username avatar"),
      User.find({ _id: { $in: roster.map((r) => r.user) } }).select("name username avatar"),
    ]);
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const record = publicCall(doc, starter, null, {
      groupName: conversation?.name || "Group call",
      groupAvatar: conversation?.avatar || "",
      participants: roster.map((r) => ({
        user: byId.get(String(r.user)) ? userBrief(byId.get(String(r.user))) : { id: String(r.user) },
        status: r.status, joinedAt: r.joinedAt, leftAt: r.leftAt,
      })),
    });
    emitToUsers(io, roster.map((r) => r.user), "call:record", record);
  } catch (err) {
    console.error("Failed to persist group call record:", err.message);
  }
};

// Removes a participant; ends the call when the last one leaves.
const removeParticipant = (io, s, userId, reason = "left") => {
  const p = s.participants.get(userId);
  if (!p) return;
  clearTimeout(p.graceTimer);
  s.participants.delete(userId);
  clearUserGroupCall(userId, s.callId);
  const j = s.everJoined.get(userId);
  if (j) j.leftAt = new Date();

  if (s.participants.size === 0) {
    // Connected at some point -> "ended"; the starter gave up / nobody
    // ever picked up -> "canceled" / "missed".
    const status = s.answeredAt ? "ended" : reason === "no-answer" ? "missed" : "canceled";
    finalize(io, s, status, reason === "connection-lost" ? "connection-lost" : reason === "no-answer" ? "no-answer" : "hangup");
    return;
  }
  s.participants.forEach((q) => io.to(q.socketId).emit("group-call:participant-left", { callId: s.callId, userId, reason }));
  broadcastState(io, s);
};

export const registerGroupCallHandlers = (io, socket, { blockedEitherWayIds }) => {
  const userId = socket.userId;

  const stateFor = (callId) => {
    const s = groupCalls.get(callId);
    return s && !s.finalized ? s : null;
  };

  const ringOne = (s, memberId, starterBrief, conversation) => {
    const sockets = getSocketIds(memberId);
    if (isUserBusy(memberId) || sockets.length === 0) {
      s.invited.set(memberId, { status: "missed", timer: null });
      return;
    }
    const timer = setTimeout(() => {
      const i = s.invited.get(memberId);
      if (!i || i.status !== "ringing") return;
      i.status = "missed";
      emitToUser(io, memberId, "group-call:ring-ended", { callId: s.callId, reason: "timeout" });
      // Nobody picked up and nobody else is coming: end it as a missed call.
      if (!s.finalized && allDoneRinging(s) && s.everJoined.size <= 1) {
        const starter = s.participants.get(s.startedBy);
        if (starter) io.to(starter.socketId).emit("group-call:no-answer", { callId: s.callId });
        removeParticipant(io, s, s.startedBy, "no-answer");
      }
    }, RING_TIMEOUT_MS);
    timer.unref?.();
    s.invited.set(memberId, { status: "ringing", timer });
    sockets.forEach((sid) =>
      io.to(sid).emit("group-call:ring", {
        callId: s.callId,
        conversationId: s.conversationId,
        mode: s.mode,
        groupName: conversation.name || "Group",
        groupAvatar: conversation.avatar || "",
        from: starterBrief,
        ringTimeoutMs: RING_TIMEOUT_MS,
        participantIds: Array.from(s.participants.keys()),
      })
    );
  };

  socket.on("group-call:start", async (payload, ack) => {
    try {
      const { conversationId, mode } = payload || {};
      if (!["audio", "video"].includes(mode)) return ack?.({ error: "Invalid call type." });
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.members.some((m) => String(m) === userId)) {
        return ack?.({ error: "Not a member of this conversation." });
      }
      if (!conversation.isGroup) return ack?.({ error: "Group calls are only available in group chats." });
      if (isUserBusy(userId)) return ack?.({ error: "You're already in a call." });

      const key = String(conversation._id);
      const existingId = conversationCalls.get(key);
      if (existingId && stateFor(existingId)) {
        return ack?.({ error: "A call is already in progress in this group.", activeCallId: existingId });
      }

      const audience = await computeAudience(conversation, userId, blockedEitherWayIds);
      const callId = crypto.randomUUID();
      const s = {
        callId,
        conversationId: key,
        mode,
        startedBy: userId,
        startedAt: new Date(),
        answeredAt: null,
        participants: new Map(),
        everJoined: new Map(),
        invited: new Map(),
        audience,
        finalized: false,
      };
      s.participants.set(userId, {
        socketId: socket.id, joinedAt: new Date(), muted: false, cameraOff: mode !== "video", sharing: false, hand: false,
      });
      s.everJoined.set(userId, { joinedAt: new Date() });
      groupCalls.set(callId, s);
      conversationCalls.set(key, callId);
      setUserGroupCall(userId, callId);

      const starter = await User.findById(userId).select("name username avatar");
      const brief = userBrief(starter);
      audience.filter((m) => m !== userId).forEach((m) => ringOne(s, m, brief, conversation));
      // Block rule: anyone filtered out of the audience is never rung and never told.

      broadcastState(io, s);
      ack?.({
        callId, conversationId: key, mode, startedAt: s.startedAt, max: GROUP_CALL_MAX_PARTICIPANTS,
        ringTimeoutMs: RING_TIMEOUT_MS,
        ringing: Array.from(s.invited.values()).some((i) => i.status === "ringing"),
      });
    } catch (err) {
      console.error("group-call:start failed:", err);
      ack?.({ error: "Couldn't start the call." });
    }
  });

  socket.on("group-call:join", async (payload, ack) => {
    try {
      const s = stateFor(payload?.callId);
      if (!s) return ack?.({ error: "This call has ended." });
      const conversation = await Conversation.findById(s.conversationId).select("members");
      if (!conversation || !conversation.members.some((m) => String(m) === userId)) {
        return ack?.({ error: "Not a member of this conversation." });
      }
      if (s.participants.has(userId)) return ack?.({ error: "You're already in this call (maybe on another device)." });
      if (isUserBusy(userId)) return ack?.({ error: "You're already in another call." });
      if (s.participants.size >= GROUP_CALL_MAX_PARTICIPANTS) {
        return ack?.({ error: `This call is full (maximum ${GROUP_CALL_MAX_PARTICIPANTS} participants).`, full: true });
      }
      // Mesh media connects peers directly, so nobody may join a call
      // that contains someone they have a block with (either way).
      const blocked = await blockedEitherWayIds(userId);
      if (Array.from(s.participants.keys()).some((p) => blocked.has(p))) {
        return ack?.({ error: "You can't join this call." });
      }
      if (!s.audience.includes(userId)) s.audience.push(userId);

      const invite = s.invited.get(userId);
      if (invite) {
        clearTimeout(invite.timer);
        invite.status = "joined";
      }
      const now = new Date();
      const existing = Array.from(s.participants.entries());
      s.participants.set(userId, {
        socketId: socket.id, joinedAt: now, muted: false, cameraOff: s.mode !== "video", sharing: false, hand: false,
      });
      s.everJoined.set(userId, { joinedAt: now });
      setUserGroupCall(userId, s.callId);
      if (!s.answeredAt) s.answeredAt = now; // second person in = the call is connected

      // Dismiss the ring on this user's other tabs/devices.
      getSocketIds(userId).filter((sid) => sid !== socket.id).forEach((sid) =>
        io.to(sid).emit("group-call:handled", { callId: s.callId })
      );

      const users = await User.find({ _id: { $in: [userId, ...existing.map(([id]) => id)] } }).select("name username avatar");
      const byId = new Map(users.map((u) => [String(u._id), u]));
      const me = participantView(byId.get(userId) || { _id: userId }, s.participants.get(userId));
      existing.forEach(([, p]) => io.to(p.socketId).emit("group-call:participant-joined", { callId: s.callId, participant: me }));
      broadcastState(io, s);

      ack?.({
        ok: true,
        callId: s.callId,
        conversationId: s.conversationId,
        mode: s.mode,
        startedAt: s.startedAt,
        answeredAt: s.answeredAt,
        max: GROUP_CALL_MAX_PARTICIPANTS,
        hasWhiteboard: (s.board?.strokes.size || 0) > 0,
        // The joiner sends an offer to each of these peers.
        participants: existing.map(([id, p]) => participantView(byId.get(id) || { _id: id }, p)),
      });
    } catch (err) {
      console.error("group-call:join failed:", err);
      ack?.({ error: "Couldn't join the call." });
    }
  });

  socket.on("group-call:leave", (payload, ack) => {
    const s = stateFor(payload?.callId);
    if (s) removeParticipant(io, s, userId, "left");
    ack?.({ ok: true });
  });

  socket.on("group-call:decline", (payload) => {
    const s = stateFor(payload?.callId);
    const i = s?.invited.get(userId);
    if (!s || !i) return;
    clearTimeout(i.timer);
    if (i.status === "ringing") i.status = "declined";
    getSocketIds(userId).filter((sid) => sid !== socket.id).forEach((sid) =>
      io.to(sid).emit("group-call:handled", { callId: s.callId })
    );
    if (allDoneRinging(s) && s.everJoined.size <= 1) {
      const starter = s.participants.get(s.startedBy);
      if (starter) io.to(starter.socketId).emit("group-call:no-answer", { callId: s.callId });
      removeParticipant(io, s, s.startedBy, "no-answer");
    }
  });

  // Relay SDP / ICE to exactly one peer.
  socket.on("group-call:signal", (payload) => {
    const { callId, to, data } = payload || {};
    const s = stateFor(callId);
    if (!s || !data || typeof data !== "object") return;
    const me = s.participants.get(userId);
    const target = s.participants.get(String(to));
    if (!me || !target || String(to) === userId) return;
    try {
      if (JSON.stringify(data).length > MAX_SIGNAL_BYTES) return;
    } catch {
      return;
    }
    io.to(target.socketId).emit("group-call:signal", { callId, from: userId, data });
  });

  socket.on("group-call:media-state", ({ callId, muted, cameraOff, sharing } = {}) => {
    const s = stateFor(callId);
    const me = s?.participants.get(userId);
    if (!s || !me) return;
    me.muted = !!muted;
    me.cameraOff = !!cameraOff;
    me.sharing = !!sharing;
    s.participants.forEach((p, uid) => {
      if (uid !== userId) io.to(p.socketId).emit("group-call:media-state", { callId, userId, muted: me.muted, cameraOff: me.cameraOff, sharing: me.sharing });
    });
  });

  socket.on("group-call:resume", (payload, ack) => {
    const s = stateFor(payload?.callId);
    const me = s?.participants.get(userId);
    if (!s || !me) {
      socket.emit("group-call:ended", { callId: payload?.callId, status: "failed", reason: "not-found", duration: 0 });
      return ack?.({ error: "Call not found." });
    }
    me.socketId = socket.id;
    clearTimeout(me.graceTimer);
    s.participants.forEach((p, uid) => {
      if (uid !== userId) io.to(p.socketId).emit("group-call:peer-resumed", { callId: s.callId, userId });
    });
    ack?.({ ok: true });
  });

  socket.on("group-call:status", async (payload, ack) => {
    try {
      const conversationId = String(payload?.conversationId || "");
      const callId = conversationCalls.get(conversationId);
      const s = callId && stateFor(callId);
      if (!s) return ack?.({ active: false });
      if (!s.audience.includes(userId)) {
        const member = await Conversation.exists({ _id: conversationId, members: userId });
        if (!member) return ack?.({ active: false });
        const blocked = await blockedEitherWayIds(userId);
        if (blocked.has(s.startedBy)) return ack?.({ active: false });
      }
      ack?.(publicState(s));
    } catch {
      ack?.({ active: false });
    }
  });
};

export const handleGroupCallDisconnect = (io, userId, socketId) => {
  const callId = getUserGroupCallId(userId);
  const s = callId && groupCalls.get(callId);
  if (!s) return;
  const me = s.participants.get(String(userId));
  if (!me || me.socketId !== socketId) return;
  s.participants.forEach((p, uid) => {
    if (uid !== String(userId)) io.to(p.socketId).emit("group-call:peer-reconnecting", { callId, userId: String(userId) });
  });
  clearTimeout(me.graceTimer);
  me.graceTimer = setTimeout(() => removeParticipant(io, s, String(userId), "connection-lost"), RECONNECT_GRACE_MS);
  me.graceTimer.unref?.();
};

// For in-call extras (reactions / hand / whiteboard), mirrors
// peersOfOneToOneCall in callHandler.js.
export const peersOfGroupCall = (callId, userId) => {
  const s = groupCalls.get(callId);
  if (!s || s.finalized || !s.participants.has(String(userId))) return null;
  const others = Array.from(s.participants.entries()).filter(([id]) => id !== String(userId));
  return {
    kind: "group",
    state: s,
    memberIds: Array.from(s.participants.keys()),
    peerUserIds: others.map(([id]) => id),
    peerSockets: others.map(([, p]) => p.socketId),
    participant: s.participants.get(String(userId)),
  };
};
