import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { emitToUsers } from "./registry.js";
import { shapeMessageForBroadcast } from "../utils/messageView.js";
import { startShare, getShare, updateShare, stopShare, expiredShares } from "./locationStore.js";

// Live location sharing.
//   location:start   { conversationId, durationMinutes: 15|60|480, consent: true }
//   location:update  { messageId, lat, lng, accuracy }          (sender only)
//   location:stop    { messageId }                              (sender only)
// Server -> clients:
//   location:update  { messageId, conversationId, lat, lng, accuracy, updatedAt }
//   location:ended   { messageId, conversationId }
//
// Rules enforced here: only conversation members are ever addressed; anyone
// blocked either way with the sharer never receives coordinates; coordinates
// live only in memory (locationStore) and are dropped at expiry/stop, so the
// server cannot keep or return a location after the share ends.

const ALLOWED_MINUTES = [15, 60, 480];
const MIN_UPDATE_GAP_MS = 2000; // server-side floor; clients send every 5-10s
const AUDIENCE_TTL_MS = 60 * 1000;
const SWEEP_MS = Number(process.env.LOCATION_SWEEP_MS) || 15 * 1000;

let sweeper = null;

const validCoords = (lat, lng) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const endShare = async (io, messageId, conversationId) => {
  stopShare(messageId);
  try {
    await Message.updateOne(
      { _id: messageId, "location.live": true },
      { $set: { "location.live": false, "location.endedAt": new Date() } }
    );
  } catch (err) {
    console.error("Failed to end live location:", err.message);
  }
  io.to(`conversation:${conversationId}`).emit("location:ended", { messageId: String(messageId), conversationId: String(conversationId) });
};

const sweep = async (io) => {
  try {
    for (const s of expiredShares()) await endShare(io, s.messageId, s.conversationId);
    // Shares whose in-memory entry was lost (server restart): close them in the DB too.
    const orphans = await Message.find({ "location.live": true, "location.expiresAt": { $lte: new Date() } }).select("_id conversation");
    for (const m of orphans) await endShare(io, m._id, m.conversation);
  } catch (err) {
    console.error("Live location sweep failed:", err.message);
  }
};

// Who may receive this sharer's coordinates: conversation members minus
// anyone blocked either way, minus the sharer.
const audienceFor = async (share, blockedEitherWayIds) => {
  const now = Date.now();
  if (share.audience && share.audienceAt > now - AUDIENCE_TTL_MS) return share.audience;
  const conversation = await Conversation.findById(share.conversationId).select("members");
  const blocked = await blockedEitherWayIds(share.userId);
  share.audience = (conversation?.members || []).map(String).filter((m) => m !== share.userId && !blocked.has(m));
  share.audienceAt = now;
  return share.audience;
};

export const registerLocationHandlers = (io, socket, { blockedEitherWayIds }) => {
  const userId = socket.userId;
  if (!sweeper) {
    sweeper = setInterval(() => sweep(io), SWEEP_MS);
    sweeper.unref?.();
  }

  socket.on("location:start", async (payload, ack) => {
    try {
      const { conversationId, durationMinutes, consent } = payload || {};
      if (consent !== true) return ack?.({ error: "Please confirm that you want to share your live location." });
      const minutes = Number(durationMinutes);
      if (!ALLOWED_MINUTES.includes(minutes)) return ack?.({ error: "Choose 15 minutes, 1 hour or 8 hours." });

      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.members.some((m) => String(m) === userId)) {
        return ack?.({ error: "Not a member of this conversation." });
      }
      const blocked = await blockedEitherWayIds(userId);
      if (!conversation.isGroup) {
        const otherId = conversation.members.map(String).find((m) => m !== userId);
        if (otherId && blocked.has(otherId)) return ack?.({ error: "You can't share your location in this chat." });
      }

      // One live share per person per chat: starting a new one ends the old one.
      const previous = await Message.find({
        conversation: conversationId, sender: userId, type: "location", "location.live": true,
      }).select("_id");
      for (const m of previous) await endShare(io, m._id, conversationId);

      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + minutes * 60 * 1000);
      const message = await Message.create({
        conversation: conversationId,
        sender: userId,
        type: "location",
        text: "",
        location: { live: true, startedAt, expiresAt },
        deliveredTo: [userId],
        readBy: [userId],
      });
      conversation.lastMessage = message._id;
      await conversation.save();

      startShare(message._id, {
        userId, conversationId: String(conversationId), expiresAt: expiresAt.getTime(), lastAt: 0,
      });

      const populated = await message.populate([{ path: "sender", select: "name username avatar" }]);
      const shaped = shapeMessageForBroadcast(populated);
      io.to(`conversation:${conversationId}`).emit("message:new", shaped);
      ack?.({ message: shaped, expiresAt });
    } catch (err) {
      ack?.({ error: "Couldn't start sharing your location." });
    }
  });

  socket.on("location:update", async (payload, ack) => {
    try {
      const { messageId, lat, lng, accuracy } = payload || {};
      if (!validCoords(lat, lng)) return ack?.({ error: "Invalid location." });

      let share = getShare(messageId);
      if (!share) {
        // After a server restart the share is gone from memory but the
        // message may still be live in the DB: re-arm it for its owner.
        const m = await Message.findById(messageId).select("sender conversation type location");
        if (!m || m.type !== "location" || String(m.sender) !== userId || !m.location?.live ||
            !m.location.expiresAt || m.location.expiresAt.getTime() <= Date.now()) {
          return ack?.({ error: "This live location has ended.", ended: true });
        }
        startShare(m._id, { userId, conversationId: String(m.conversation), expiresAt: m.location.expiresAt.getTime(), lastAt: 0 });
        share = getShare(messageId);
      }
      if (share.userId !== userId) return ack?.({ error: "Not your live location." });
      if (share.expiresAt <= Date.now()) {
        await endShare(io, messageId, share.conversationId);
        return ack?.({ error: "This live location has ended.", ended: true });
      }
      const now = Date.now();
      if (now - (share.lastAt || 0) < MIN_UPDATE_GAP_MS) return ack?.({ ok: true, throttled: true });
      share.lastAt = now;

      const acc = Number.isFinite(Number(accuracy)) ? Math.max(0, Math.min(Number(accuracy), 100000)) : null;
      updateShare(messageId, { lat, lng, accuracy: acc });

      const audience = await audienceFor(share, blockedEitherWayIds);
      // The sharer's other tabs see their own marker too.
      emitToUsers(io, [...audience, userId], "location:update", {
        messageId: String(messageId), conversationId: share.conversationId, lat, lng, accuracy: acc, updatedAt: now,
      });
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ error: "Couldn't update your location." });
    }
  });

  socket.on("location:stop", async (payload, ack) => {
    try {
      const m = await Message.findById(payload?.messageId).select("sender conversation type location");
      if (!m || m.type !== "location") return ack?.({ error: "Not found." });
      if (String(m.sender) !== userId) return ack?.({ error: "Only the person sharing can stop it." });
      await endShare(io, m._id, m.conversation);
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ error: "Couldn't stop sharing." });
    }
  });
};
