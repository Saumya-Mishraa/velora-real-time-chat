import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";

import { onlineUsers, addSocket, removeSocket, emitToUser, emitToUsers, joinUsersToConversation, leaveUsersFromConversation, isUserOnline } from "./registry.js";
import { registerCallHandlers, handleCallDisconnect } from "./callHandler.js";
import { normalizeAttachment } from "../utils/mediaUrl.js";

export { emitToUser, emitToUsers, joinUsersToConversation, leaveUsersFromConversation, isUserOnline };

// Users who should never see each other's real-time presence: anyone
// blocked in either direction. Computed on demand rather than cached,
// since blocks change rarely relative to how often presence updates fire.
const blockedEitherWayIds = async (userId) => {
  const me = await User.findById(userId).select("blockedUsers");
  const blockedByMe = (me?.blockedUsers || []).map(String);
  const blockedMe = await User.find({ blockedUsers: userId }).select("_id");
  return new Set([...blockedByMe, ...blockedMe.map((u) => String(u._id))]);
};

// Broadcasts presence to every connected socket except: the user's own
// other tabs (they don't need their own presence pushed back) and
// anyone blocked either way. Also fully suppressed when the user has
// set onlineStatus privacy to "nobody" — in that case nobody ever
// receives a presence:update for them, so every other client simply
// keeps whatever presence it last knew (defaulting to "offline"/unknown).
const broadcastPresence = async (io, userId, payload) => {
  const user = await User.findById(userId).select("privacy");
  if (user?.privacy?.onlineStatus === "nobody") return;

  const exclude = await blockedEitherWayIds(userId);
  for (const [otherId, socketIds] of onlineUsers.entries()) {
    if (otherId === String(userId)) continue;
    if (exclude.has(otherId)) continue;
    socketIds.forEach((sid) => io.to(sid).emit("presence:update", payload));
  }
};

// Snapshot of who's currently online, from this viewer's point of view
// (anyone blocked either way, or who has set onlineStatus privacy to
// "nobody", is left out — mirrors broadcastPresence's own filtering so
// a freshly-connected client's initial state matches what later
// presence:update events would show it anyway).
//
// Root cause this exists to fix: broadcastPresence() only ever pushes a
// user's status to sockets that are *already* connected at the moment
// they come online/offline. A client that connects *after* someone else
// is already online never received that original broadcast, so it had
// no way to know they were online short of refreshing (which opens a
// new socket and re-triggers the other user's own connect/disconnect).
// This snapshot is sent once, right after a socket connects, to close
// that gap without touching the existing broadcast-on-change behavior.
const getVisibleOnlineIds = async (viewerId) => {
  const exclude = await blockedEitherWayIds(viewerId);
  const candidateIds = Array.from(onlineUsers.keys()).filter(
    (id) => id !== String(viewerId) && !exclude.has(id)
  );
  if (candidateIds.length === 0) return [];

  const users = await User.find({ _id: { $in: candidateIds } }).select("privacy");
  return users.filter((u) => u.privacy?.onlineStatus !== "nobody").map((u) => String(u._id));
};

const isMemberOfConversation = (conversation, userId) =>
  conversation && conversation.members.some((m) => String(m) === String(userId));

const isGroupAdmin = (conversation, userId) =>
  conversation.isGroup && conversation.admins.some((a) => String(a) === String(userId));

export const initSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error("User not found"));
      socket.userId = String(user._id);
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    addSocket(userId, socket.id);

    // Register every listener synchronously, before any `await` runs.
    // Root-cause note: this used to happen *after* the awaits below
    // (marking the user online, then looking up their conversations),
    // which left a real window right after "connection" where an event
    // the client fires immediately (e.g. "conversation:join" on a fast
    // reconnect) would arrive before a listener existed for it and be
    // silently dropped — no error, just a lost event. Listeners first,
    // async setup second, closes that gap.
    // Only members may join a conversation room — otherwise any signed-in
    // user could subscribe to someone else's chat by guessing its id.
    const memberOf = async (conversationId) => {
      try {
        return !!(await Conversation.exists({ _id: conversationId, members: userId }));
      } catch {
        return false; // malformed id
      }
    };

    socket.on("conversation:join", async (conversationId, ack) => {
      if (await memberOf(conversationId)) {
        socket.join(`conversation:${conversationId}`);
        return ack?.({ ok: true });
      }
      ack?.({ error: "Not a member of this conversation." });
    });

    socket.on("conversation:leave", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("typing:start", ({ conversationId }) => {
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit("typing:start", { conversationId, userId });
    });

    socket.on("typing:stop", ({ conversationId }) => {
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit("typing:stop", { conversationId, userId });
    });

    socket.on("message:send", async (payload, ack) => {
      try {
        const {
          conversationId,
          text: rawText = "",
          type = "text",
          attachment: rawAttachment = null,
          replyTo = null,
        } = payload || {};

        // "call" records are written by the server only.
        if (!["text", "image", "video", "audio", "file", "voice"].includes(type)) {
          return ack?.({ error: "Invalid message type." });
        }
        const text = String(rawText || "").slice(0, 5000);
        let attachment = null;
        if (type !== "text") {
          attachment = normalizeAttachment(rawAttachment);
          if (!attachment) {
            return ack?.({ error: "Invalid attachment. Upload the file first and send its returned path." });
          }
        } else if (!text.trim()) {
          return ack?.({ error: "Message is empty." });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!isMemberOfConversation(conversation, userId)) {
          return ack?.({ error: "Not a member of this conversation." });
        }

        // Block enforcement: in a 1:1 conversation, neither member may
        // message the other while a block exists in either direction.
        // Server-side, never trusting the frontend to have hidden the
        // input — see API SECURITY requirements.
        if (!conversation.isGroup) {
          const otherId = conversation.members.map(String).find((m) => m !== userId);
          const exclude = await blockedEitherWayIds(userId);
          if (otherId && exclude.has(otherId)) {
            return ack?.({ error: "You can't message this user." });
          }
        }

        // Sender has trivially delivered/seen their own message.
        const onlineMemberIds = conversation.members
          .map(String)
          .filter((m) => onlineUsers.has(m));

        const message = await Message.create({
          conversation: conversationId,
          sender: userId,
          type,
          text,
          attachment,
          replyTo,
          deliveredTo: Array.from(new Set([userId, ...onlineMemberIds])),
          readBy: [userId],
        });

        conversation.lastMessage = message._id;
        await conversation.save();

        const populated = await message.populate([
          { path: "sender", select: "name username avatar" },
          { path: "replyTo" },
        ]);

        io.to(`conversation:${conversationId}`).emit("message:new", populated);
        ack?.({ message: populated });
      } catch (err) {
        ack?.({ error: err.message });
      }
    });

    // Client fires this the moment it actually receives "message:new"
    // (i.e. the message reached that device), independent of whether the
    // conversation is open/visible — this is the WhatsApp-style single
    // grey tick -> double grey tick transition, distinct from "seen".
    socket.on("message:delivered", async ({ conversationId, messageIds = [] }) => {
      if (!conversationId || messageIds.length === 0) return;
      if (!(await memberOf(conversationId))) return;
      await Message.updateMany(
        { _id: { $in: messageIds }, deliveredTo: { $ne: userId } },
        { $addToSet: { deliveredTo: userId } }
      );
      io.to(`conversation:${conversationId}`).emit("message:delivered", {
        conversationId,
        userId,
        messageIds,
      });
    });

    // Fired when the recipient actually views the conversation. Marks
    // every not-yet-read message as read (and, implicitly, delivered —
    // you can't have seen a message your device never received).
    socket.on("message:read", async ({ conversationId }) => {
      if (!(await memberOf(conversationId))) return;
      const unread = await Message.find({
        conversation: conversationId,
        readBy: { $ne: userId },
      }).select("_id");
      if (unread.length === 0) return;
      const ids = unread.map((m) => m._id);
      await Message.updateMany(
        { _id: { $in: ids } },
        { $addToSet: { readBy: userId, deliveredTo: userId } }
      );
      io.to(`conversation:${conversationId}`).emit("message:seen", {
        conversationId,
        userId,
        messageIds: ids,
      });
    });

    socket.on("message:react", async ({ messageId, emoji }) => {
      const message = await Message.findById(messageId);
      if (!message) return;
      if (!(await memberOf(message.conversation))) return;
      const idx = message.reactions.findIndex((r) => String(r.user) === userId);
      if (idx >= 0) {
        if (message.reactions[idx].emoji === emoji) message.reactions.splice(idx, 1);
        else message.reactions[idx].emoji = emoji;
      } else {
        message.reactions.push({ user: userId, emoji });
      }
      await message.save();
      io.to(`conversation:${message.conversation}`).emit("message:reaction", {
        messageId,
        reactions: message.reactions,
      });
    });

    socket.on("message:edit", async ({ messageId, text }, ack) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return ack?.({ error: "Message not found." });
        if (String(message.sender) !== userId) {
          return ack?.({ error: "You can only edit your own messages." });
        }
        if (message.deletedForEveryone || message.deleted) {
          return ack?.({ error: "Can't edit a deleted message." });
        }
        if (message.type !== "text") {
          return ack?.({ error: "Only text messages can be edited." });
        }
        message.text = (text || "").trim();
        message.edited = true;
        message.editedAt = new Date();
        await message.save();
        io.to(`conversation:${message.conversation}`).emit("message:edit", {
          messageId,
          text: message.text,
          editedAt: message.editedAt,
        });
        ack?.({ message });
      } catch (err) {
        ack?.({ error: err.message });
      }
    });

    // mode: "me" (hide for this user only, every device they're logged
    // into) or "everyone" (tombstone for the whole conversation).
    socket.on("message:delete", async ({ messageId, mode = "me" }, ack) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return ack?.({ error: "Message not found." });

        if (mode === "everyone") {
          if (String(message.sender) !== userId) {
            return ack?.({ error: "Only the sender can delete for everyone." });
          }
          message.deletedForEveryone = true;
          message.deleted = true; // legacy flag, mirrors the same state
          message.text = "";
          message.attachment = undefined;
          message.pinned = false;
          await message.save();
          io.to(`conversation:${message.conversation}`).emit("message:delete", {
            messageId,
            mode: "everyone",
          });
        } else {
          if (!message.deletedFor.some((u) => String(u) === userId)) {
            message.deletedFor.push(userId);
            await message.save();
          }
          // Only this user's own other sessions need to know — nobody
          // else's view of the conversation changes.
          const mySocketIds = onlineUsers.get(userId);
          mySocketIds?.forEach((sid) =>
            io.to(sid).emit("message:delete", { messageId, mode: "me" })
          );
        }
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ error: err.message });
      }
    });

    socket.on("message:pin", async ({ messageId }, ack) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return ack?.({ error: "Message not found." });
        const conversation = await Conversation.findById(message.conversation);
        if (!isMemberOfConversation(conversation, userId)) {
          return ack?.({ error: "Not a member of this conversation." });
        }
        if (conversation.isGroup && !isGroupAdmin(conversation, userId)) {
          return ack?.({ error: "Only group admins can pin messages." });
        }
        message.pinned = true;
        message.pinnedAt = new Date();
        message.pinnedBy = userId;
        await message.save();
        io.to(`conversation:${message.conversation}`).emit("message:pin", {
          messageId,
          pinned: true,
        });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ error: err.message });
      }
    });

    socket.on("message:unpin", async ({ messageId }, ack) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return ack?.({ error: "Message not found." });
        const conversation = await Conversation.findById(message.conversation);
        if (!isMemberOfConversation(conversation, userId)) {
          return ack?.({ error: "Not a member of this conversation." });
        }
        if (conversation.isGroup && !isGroupAdmin(conversation, userId)) {
          return ack?.({ error: "Only group admins can unpin messages." });
        }
        message.pinned = false;
        await message.save();
        io.to(`conversation:${message.conversation}`).emit("message:pin", {
          messageId,
          pinned: false,
        });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ error: err.message });
      }
    });

    registerCallHandlers(io, socket, { blockedEitherWayIds });

    socket.on("disconnect", async () => {
      try {
        handleCallDisconnect(io, userId, socket.id);
        const fullyOffline = removeSocket(userId, socket.id);
        if (fullyOffline) {
          const lastSeen = new Date();
          await User.updateOne({ _id: userId }, { status: "offline", lastSeen });
          await broadcastPresence(io, userId, { userId, status: "offline", lastSeen });
        }
      } catch (err) {
        // Never let a DB hiccup during disconnect become an unhandled
        // rejection that takes the whole server down.
        console.error("Socket disconnect cleanup failed:", err.message);
      }
    });

    // Async setup, now that listeners are guaranteed to be attached.
    (async () => {
      await User.updateOne({ _id: userId }, { status: "online" });
      await broadcastPresence(io, userId, { userId, status: "online" });

      // Tell this freshly-connected socket who's already online (see
      // getVisibleOnlineIds above) — without this, two users who are
      // both already online only find out about each other if one of
      // them reconnects/disconnects after the fact.
      const alreadyOnline = await getVisibleOnlineIds(userId);
      socket.emit("presence:online-list", { userIds: alreadyOnline });

      // Join a room per conversation the user belongs to, so we can
      // broadcast to exactly the right people. This only covers
      // conversations that already existed when the socket connected —
      // see joinUsersToConversation() below for conversations/groups
      // created or joined *while* a user is already connected.
      const conversations = await Conversation.find({ members: userId }).select("_id");
      conversations.forEach((c) => socket.join(`conversation:${c._id}`));
    })().catch((err) => {
      console.error("Socket post-connection setup failed:", err.message);
    });
  });
};

