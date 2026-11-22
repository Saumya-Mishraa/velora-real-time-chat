import Conversation from "../models/Conversation.js";
import { emitToUsers, getSocketIds } from "./registry.js";
import { parseYouTubeId } from "../utils/youtube.js";

// Watch Together: a synced YouTube session per conversation.
//   watch:start   { conversationId, url }                       -> ack { session }
//   watch:join    { conversationId }                            -> ack { session|null, serverNow }
//   watch:leave   { conversationId }
//   watch:control { conversationId, action, time, videoId?/url? } controller only:
//                   play | pause | seek | heartbeat | load
//   watch:pass    { conversationId, userId }   host hands playback control to a member
//   watch:end     { conversationId }           host only
//   watch:sync    ()                           -> ack { serverNow } (clock offset)
// Server -> clients: watch:state { conversationId, videoId, playing, time, sentAt,
//   serverNow, hostId, controllerId, active } and watch:ended { conversationId }.
//
// `time` is the video position (seconds) at server instant `sentAt`; clients
// add (serverClock - sentAt) while playing, so latency is compensated and
// late joiners land on the right frame. Sessions are in-memory only.

const sessions = new Map(); // conversationId -> session
const HOST_GRACE_MS = 60 * 1000;
const AUDIENCE_TTL_MS = 60 * 1000;
const MAX_TIME = 60 * 60 * 24; // 24h cap on seek positions

const isMember = (c, userId) => !!c && c.members.some((m) => String(m) === String(userId));

const publicState = (s) => ({
  conversationId: s.conversationId,
  videoId: s.videoId,
  playing: s.playing,
  time: s.time,
  sentAt: s.sentAt,
  serverNow: Date.now(),
  hostId: s.hostId,
  controllerId: s.controllerId,
  active: true,
});

// Members who may take part: everyone in the chat except people blocked
// either way with the host (they never get the host's session).
const audience = async (s, blockedEitherWayIds) => {
  const now = Date.now();
  if (s.audience && s.audienceAt > now - AUDIENCE_TTL_MS) return s.audience;
  const conversation = await Conversation.findById(s.conversationId).select("members");
  const blocked = await blockedEitherWayIds(s.hostId);
  s.audience = (conversation?.members || []).map(String).filter((m) => m === s.hostId || !blocked.has(m));
  s.audienceAt = now;
  return s.audience;
};

const endSession = (io, s, reason = "ended") => {
  if (sessions.get(s.conversationId) !== s) return;
  clearTimeout(s.hostTimer);
  sessions.delete(s.conversationId);
  emitToUsers(io, s.audience || [s.hostId], "watch:ended", { conversationId: s.conversationId, reason });
};

const clampTime = (t) => (Number.isFinite(Number(t)) ? Math.max(0, Math.min(Number(t), MAX_TIME)) : 0);

export const registerWatchHandlers = (io, socket, { blockedEitherWayIds }) => {
  const userId = socket.userId;
  let tokens = 20;
  let last = Date.now();
  const allow = () => {
    const now = Date.now();
    tokens = Math.min(20, tokens + ((now - last) / 1000) * 10);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  const loadMemberConversation = async (conversationId) => {
    const conversation = await Conversation.findById(conversationId).select("members isGroup");
    return isMember(conversation, userId) ? conversation : null;
  };

  const broadcast = async (s, { skipSelf = false } = {}) => {
    const to = await audience(s, blockedEitherWayIds);
    const ids = skipSelf ? to.filter((id) => id !== userId) : to;
    emitToUsers(io, ids, "watch:state", publicState(s));
  };

  socket.on("watch:sync", (ack) => {
    if (typeof ack === "function") ack({ serverNow: Date.now() });
  });

  socket.on("watch:start", async (payload, ack) => {
    try {
      const { conversationId, url } = payload || {};
      const videoId = parseYouTubeId(url);
      if (!videoId) return ack?.({ error: "Paste a valid YouTube link (youtube.com or youtu.be)." });
      const conversation = await loadMemberConversation(conversationId);
      if (!conversation) return ack?.({ error: "Not a member of this conversation." });
      const blocked = await blockedEitherWayIds(userId);
      if (!conversation.isGroup) {
        const otherId = conversation.members.map(String).find((m) => m !== userId);
        if (otherId && blocked.has(otherId)) return ack?.({ error: "You can't start a watch party in this chat." });
      }
      const key = String(conversation._id);
      const existing = sessions.get(key);
      if (existing && existing.hostId !== userId) {
        return ack?.({ error: "A watch party is already running here. Ask the host to change the video.", session: publicState(existing) });
      }
      if (existing) clearTimeout(existing.hostTimer);

      const s = {
        conversationId: key, videoId, hostId: userId, controllerId: userId,
        playing: false, time: 0, sentAt: Date.now(), participants: new Set([userId]),
      };
      sessions.set(key, s);
      await broadcast(s);
      ack?.({ session: publicState(s) });
    } catch (err) {
      ack?.({ error: "Couldn't start the watch party." });
    }
  });

  socket.on("watch:join", async (payload, ack) => {
    try {
      const conversationId = payload?.conversationId;
      const conversation = await loadMemberConversation(conversationId);
      if (!conversation) return ack?.({ error: "Not a member of this conversation." });
      const s = sessions.get(String(conversation._id));
      if (!s) return ack?.({ session: null, serverNow: Date.now() });
      const blocked = await blockedEitherWayIds(userId);
      if (userId !== s.hostId && blocked.has(s.hostId)) return ack?.({ session: null, serverNow: Date.now() });
      s.participants.add(userId);
      clearTimeout(s.hostTimer);
      // Authoritative position for a late joiner (extrapolated while playing).
      ack?.({ session: publicState(s), serverNow: Date.now() });
    } catch (err) {
      ack?.({ error: "Couldn't join the watch party." });
    }
  });

  socket.on("watch:leave", (payload) => {
    const s = sessions.get(String(payload?.conversationId));
    if (s) s.participants.delete(userId);
  });

  socket.on("watch:control", async (payload, ack) => {
    try {
      if (!allow()) return ack?.({ error: "Slow down a little." });
      const { conversationId, action } = payload || {};
      const s = sessions.get(String(conversationId));
      if (!s) return ack?.({ error: "No watch party is running." });
      if (s.controllerId !== userId) return ack?.({ error: "Only the host (or whoever they pass control to) can control playback." });
      if (!(await loadMemberConversation(conversationId))) return ack?.({ error: "Not a member of this conversation." });

      const time = clampTime(payload.time);
      if (action === "play") { s.playing = true; s.time = time; }
      else if (action === "pause") { s.playing = false; s.time = time; }
      else if (action === "seek") { s.time = time; }
      else if (action === "heartbeat") { s.playing = payload.playing === true; s.time = time; }
      else if (action === "load") {
        if (s.hostId !== userId) return ack?.({ error: "Only the host can change the video." });
        const videoId = parseYouTubeId(payload.url);
        if (!videoId) return ack?.({ error: "Paste a valid YouTube link (youtube.com or youtu.be)." });
        s.videoId = videoId; s.playing = false; s.time = 0;
      } else return ack?.({ error: "Unknown action." });
      s.sentAt = Date.now();

      await broadcast(s, { skipSelf: true });
      ack?.({ ok: true, session: publicState(s) });
    } catch (err) {
      ack?.({ error: "Couldn't update playback." });
    }
  });

  socket.on("watch:pass", async (payload, ack) => {
    try {
      const { conversationId, userId: targetId } = payload || {};
      const s = sessions.get(String(conversationId));
      if (!s) return ack?.({ error: "No watch party is running." });
      if (s.hostId !== userId) return ack?.({ error: "Only the host can pass control." });
      const to = await audience(s, blockedEitherWayIds);
      if (!to.includes(String(targetId))) return ack?.({ error: "That person can't take control." });
      s.controllerId = String(targetId);
      await broadcast(s);
      ack?.({ ok: true, session: publicState(s) });
    } catch (err) {
      ack?.({ error: "Couldn't pass control." });
    }
  });

  socket.on("watch:end", (payload, ack) => {
    const s = sessions.get(String(payload?.conversationId));
    if (!s) return ack?.({ ok: true });
    if (s.hostId !== userId) return ack?.({ error: "Only the host can end the watch party." });
    endSession(io, s);
    ack?.({ ok: true });
  });
};

// If the host goes fully offline, give them a minute to come back before
// closing the party for everyone.
export const handleWatchDisconnect = (io, userId, socketId) => {
  for (const s of sessions.values()) {
    if (s.hostId !== String(userId)) continue;
    const remaining = getSocketIds(userId).filter((sid) => sid !== socketId);
    if (remaining.length) continue;
    clearTimeout(s.hostTimer);
    s.hostTimer = setTimeout(() => endSession(io, s, "host-left"), HOST_GRACE_MS);
    s.hostTimer.unref?.();
  }
};

export const getWatchSession = (conversationId) => sessions.get(String(conversationId)) || null;
