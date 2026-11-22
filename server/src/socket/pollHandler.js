import crypto from "crypto";
import mongoose from "mongoose";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { emitToUser } from "./registry.js";
import { withKeyLock } from "../utils/keyedLock.js";
import { shapeMessageForBroadcast, shapePoll, pollIsClosed, pollIsExpired } from "../utils/messageView.js";

// Live polls (group chats only).
//   poll:create  { conversationId, question, options[], multiple, anonymous, expiresInMinutes }
//   poll:vote    { messageId, optionIds[] }   ([] retracts the vote)
//   poll:close   { messageId }                (creator or group admin)
// Broadcast: poll:updated { messageId, conversationId, poll } - sent to each
// member individually so `myVotes` is correct and anonymous polls never
// leak who voted what.

const MAX_QUESTION = 300;
const MAX_OPTION = 100;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const MIN_EXPIRY_MIN = 1;
const MAX_EXPIRY_MIN = 60 * 24 * 30;

const isMember = (c, userId) => !!c && c.members.some((m) => String(m) === String(userId));
const isAdmin = (c, userId) => !!c?.isGroup && c.admins.some((a) => String(a) === String(userId));

const pushPollUpdate = (io, conversation, message) => {
  const plain = message.toObject ? message.toObject() : message;
  conversation.members.forEach((memberId) => {
    emitToUser(io, memberId, "poll:updated", {
      messageId: String(message._id),
      conversationId: String(message.conversation),
      poll: shapePoll(plain.poll, memberId),
    });
  });
};

export const registerPollHandlers = (io, socket) => {
  const userId = socket.userId;
  // Tiny per-socket limiter so a script can't hammer votes.
  let tokens = 10;
  let last = Date.now();
  const allow = () => {
    const now = Date.now();
    tokens = Math.min(10, tokens + ((now - last) / 1000) * 5);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  socket.on("poll:create", async (payload, ack) => {
    try {
      const { conversationId, question, options, multiple, anonymous, expiresInMinutes } = payload || {};
      const q = String(question || "").trim();
      if (!q) return ack?.({ error: "Add a question for your poll." });
      if (q.length > MAX_QUESTION) return ack?.({ error: `Question can be at most ${MAX_QUESTION} characters.` });

      if (!Array.isArray(options)) return ack?.({ error: "Add at least two options." });
      const texts = options.map((o) => String(o?.text ?? o ?? "").trim()).filter(Boolean);
      if (texts.length < MIN_OPTIONS) return ack?.({ error: "Add at least two options." });
      if (texts.length > MAX_OPTIONS) return ack?.({ error: `A poll can have at most ${MAX_OPTIONS} options.` });
      if (texts.some((t) => t.length > MAX_OPTION)) return ack?.({ error: `Options can be at most ${MAX_OPTION} characters.` });
      if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) {
        return ack?.({ error: "Options must be different from each other." });
      }

      let expiresAt;
      if (expiresInMinutes !== undefined && expiresInMinutes !== null && expiresInMinutes !== "") {
        const mins = Number(expiresInMinutes);
        if (!Number.isFinite(mins) || mins < MIN_EXPIRY_MIN || mins > MAX_EXPIRY_MIN) {
          return ack?.({ error: "Poll duration must be between 1 minute and 30 days." });
        }
        expiresAt = new Date(Date.now() + mins * 60 * 1000);
      }

      const conversation = await Conversation.findById(conversationId);
      if (!isMember(conversation, userId)) return ack?.({ error: "Not a member of this conversation." });
      if (!conversation.isGroup) return ack?.({ error: "Polls are only available in group chats." });

      const message = await Message.create({
        conversation: conversationId,
        sender: userId,
        type: "poll",
        text: q, // keeps search + chat-list previews working
        poll: {
          question: q,
          options: texts.map((text) => ({ id: crypto.randomBytes(4).toString("hex"), text, voters: [] })),
          multiple: multiple === true,
          anonymous: anonymous === true,
          ...(expiresAt ? { expiresAt } : {}),
        },
        deliveredTo: [userId],
        readBy: [userId],
      });
      conversation.lastMessage = message._id;
      await conversation.save();

      const populated = await message.populate([{ path: "sender", select: "name username avatar" }]);
      const shaped = shapeMessageForBroadcast(populated);
      io.to(`conversation:${conversationId}`).emit("message:new", shaped);
      ack?.({ message: shaped });
    } catch (err) {
      ack?.({ error: "Couldn't create the poll." });
    }
  });

  socket.on("poll:vote", async (payload, ack) => {
    try {
      if (!allow()) return ack?.({ error: "Slow down a little." });
      const { messageId } = payload || {};
      const optionIds = payload?.optionIds;
      if (!Array.isArray(optionIds)) return ack?.({ error: "Invalid vote." });
      const chosen = Array.from(new Set(optionIds.map(String)));

      // Optimistic concurrency: two people voting at the same instant can't
      // overwrite each other - the loser's write misses (stale __v) and retries.
      const outcome = await withKeyLock(`poll:${messageId}`, async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const message = await Message.findById(messageId);
        if (!message || message.type !== "poll" || !message.poll) return { error: "Poll not found." };
        const conversation = await Conversation.findById(message.conversation);
        if (!isMember(conversation, userId)) return { error: "Not a member of this conversation." };
        if (message.deletedForEveryone || message.deleted || message.deletedFor.some((u) => String(u) === userId)) {
          return { error: "Poll not found." };
        }
        if (pollIsClosed(message.poll)) {
          return { error: pollIsExpired(message.poll) ? "This poll has ended." : "This poll is closed." };
        }
        const valid = new Set(message.poll.options.map((o) => o.id));
        if (chosen.some((id) => !valid.has(id))) return { error: "That option doesn't exist." };
        if (!message.poll.multiple && chosen.length > 1) return { error: "Choose only one option." };

        // One vote set per user: replace whatever they had before.
        const uid = new mongoose.Types.ObjectId(userId);
        const options = message.toObject().poll.options.map((o) => ({
          ...o,
          voters: [...(o.voters || []).filter((v) => String(v) !== userId), ...(chosen.includes(o.id) ? [uid] : [])],
        }));
        const updated = await Message.findOneAndUpdate(
          { _id: message._id, __v: message.__v },
          { $set: { "poll.options": options }, $inc: { __v: 1 } },
          { new: true }
        );
        if (!updated) continue; // someone else voted in between: retry on fresh data
        pushPollUpdate(io, conversation, updated);
        return { ok: true, poll: shapePoll(updated.toObject().poll, userId) };
      }
      return { error: "The poll is busy right now. Please try again." };
      });
      ack?.(outcome);
    } catch (err) {
      ack?.({ error: "Couldn't record your vote." });
    }
  });

  socket.on("poll:close", async (payload, ack) => {
    try {
      const message = await Message.findById(payload?.messageId);
      if (!message || message.type !== "poll" || !message.poll) return ack?.({ error: "Poll not found." });
      const conversation = await Conversation.findById(message.conversation);
      if (!isMember(conversation, userId)) return ack?.({ error: "Not a member of this conversation." });
      if (String(message.sender) !== userId && !isAdmin(conversation, userId)) {
        return ack?.({ error: "Only the poll creator or a group admin can close it." });
      }
      if (!message.poll.closed) {
        message.poll.closed = true;
        message.poll.closedAt = new Date();
        message.poll.closedBy = userId;
        await message.save();
      }
      pushPollUpdate(io, conversation, message);
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ error: "Couldn't close the poll." });
    }
  });
};
