import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { normalizeAttachment } from "../utils/mediaUrl.js";
import { emitToUsers } from "../socket/registry.js";

const isMember = (conversation, userId) =>
  conversation.members.some((m) => String(m) === String(userId));

const isGroupAdmin = (conversation, userId) =>
  conversation.isGroup && conversation.admins.some((a) => String(a) === String(userId));

// Messages this user has "deleted for me" are excluded entirely from
// anything sent back to them — never just hidden client-side.
const visibleQuery = (conversationId, userId) => ({
  conversation: conversationId,
  deletedFor: { $ne: userId },
});

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { before, limit = 30 } = req.query;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }

    const query = visibleQuery(conversationId, req.user._id);
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate("sender", "name username avatar")
      .populate("replyTo");

    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ message: "Failed to load messages.", error: err.message });
  }
};

// Used by the REST fallback (e.g. attaching a file). Real-time delivery
// still happens over the socket - see socket/socketHandler.js.
export const createMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text: rawText = "", type = "text", replyTo = null, attachment: rawAttachment = null } = req.body;
    if (!["text", "image", "video", "audio", "file", "voice"].includes(type)) {
      return res.status(400).json({ message: "Invalid message type." });
    }
    const text = String(rawText || "").slice(0, 5000);
    let attachment = null;
    if (type !== "text") {
      attachment = normalizeAttachment(rawAttachment);
      if (!attachment) return res.status(400).json({ message: "Invalid attachment." });
    } else if (!text.trim()) {
      return res.status(400).json({ message: "Message is empty." });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: req.user._id,
      type,
      text,
      attachment,
      replyTo,
      deliveredTo: [req.user._id],
      readBy: [req.user._id],
    });

    conversation.lastMessage = message._id;
    await conversation.save();

    const populated = await message.populate("sender", "name username avatar");
    // REST-created messages reach the other members in real time too.
    req.app.get("io")?.to(`conversation:${conversationId}`).emit("message:new", populated);
    res.status(201).json({ message: populated });
  } catch (err) {
    res.status(500).json({ message: "Failed to send message.", error: err.message });
  }
};

// mode=me|everyone — mirrors socket "message:delete" for clients/tests
// that go through REST instead of the socket.
export const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: "Message not found." });

    const mode = req.body?.mode === "everyone" ? "everyone" : "me";

    if (mode === "everyone") {
      if (String(message.sender) !== String(req.user._id)) {
        return res.status(403).json({ message: "Only the sender can delete for everyone." });
      }
      message.deletedForEveryone = true;
      message.deleted = true;
      message.text = "";
      message.attachment = undefined;
      message.pinned = false;
      await message.save();
      req.app.get("io")?.to(`conversation:${message.conversation}`).emit("message:delete", {
        messageId: message._id,
        mode: "everyone",
      });
    } else {
      if (!message.deletedFor.some((u) => String(u) === String(req.user._id))) {
        message.deletedFor.push(req.user._id);
        await message.save();
      }
    }

    res.json({ message });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete message.", error: err.message });
  }
};

export const editMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: "Message not found." });
    if (String(message.sender) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only edit your own messages." });
    }
    if (message.deletedForEveryone || message.deleted) {
      return res.status(400).json({ message: "Can't edit a deleted message." });
    }
    if (message.type !== "text") {
      return res.status(400).json({ message: "Only text messages can be edited." });
    }

    message.text = (req.body.text || "").trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    req.app.get("io")?.to(`conversation:${message.conversation}`).emit("message:edit", {
      messageId: message._id,
      text: message.text,
      editedAt: message.editedAt,
    });

    res.json({ message });
  } catch (err) {
    res.status(500).json({ message: "Failed to edit message.", error: err.message });
  }
};

export const pinMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: "Message not found." });
    const conversation = await Conversation.findById(message.conversation);
    if (!isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    if (conversation.isGroup && !isGroupAdmin(conversation, req.user._id)) {
      return res.status(403).json({ message: "Only group admins can pin messages." });
    }

    const pin = req.params.action !== "unpin";
    message.pinned = pin;
    message.pinnedAt = pin ? new Date() : undefined;
    message.pinnedBy = pin ? req.user._id : undefined;
    await message.save();

    req.app.get("io")?.to(`conversation:${message.conversation}`).emit("message:pin", {
      messageId: message._id,
      pinned: pin,
    });

    res.json({ message });
  } catch (err) {
    res.status(500).json({ message: "Failed to update pin.", error: err.message });
  }
};

export const getPinnedMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    const messages = await Message.find({
      conversation: conversationId,
      pinned: true,
      deletedFor: { $ne: req.user._id },
    })
      .sort({ pinnedAt: -1 })
      .populate("sender", "name username avatar")
      .populate("pinnedBy", "name username");
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: "Failed to load pinned messages.", error: err.message });
  }
};

export const reactToMessage = async (req, res) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: "Message not found." });

    const existingIdx = message.reactions.findIndex(
      (r) => String(r.user) === String(req.user._id)
    );
    if (existingIdx >= 0) {
      if (message.reactions[existingIdx].emoji === emoji) {
        message.reactions.splice(existingIdx, 1); // toggle off
      } else {
        message.reactions[existingIdx].emoji = emoji;
      }
    } else {
      message.reactions.push({ user: req.user._id, emoji });
    }

    await message.save();
    res.json({ message });
  } catch (err) {
    res.status(500).json({ message: "Failed to react.", error: err.message });
  }
};

export const markRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    await Message.updateMany(
      { conversation: conversationId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id, deliveredTo: req.user._id } }
    );
    res.json({ message: "Marked as read." });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark as read.", error: err.message });
  }
};

// Sent/Delivered/Seen timestamps for a single message (section 13 —
// "Message Info"). Only the sender may see this level of detail; for a
// group, "seen by" lists which members have it in their readBy.
export const getMessageInfo = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id)
      .populate("readBy", "name username avatar")
      .populate("deliveredTo", "name username avatar");
    if (!message) return res.status(404).json({ message: "Message not found." });
    if (String(message.sender) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only the sender can view message info." });
    }

    const conversation = await Conversation.findById(message.conversation);
    const seenBy = message.readBy.filter((u) => String(u._id) !== String(message.sender));
    const deliveredOnly = message.deliveredTo.filter(
      (u) =>
        String(u._id) !== String(message.sender) &&
        !seenBy.some((s) => String(s._id) === String(u._id))
    );

    res.json({
      sentAt: message.createdAt,
      isGroup: conversation?.isGroup || false,
      deliveredTo: deliveredOnly,
      seenBy,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load message info.", error: err.message });
  }
};

// In-conversation search (section 17). Uses a case-insensitive regex
// rather than the $text index so short/partial queries ("hel" matching
// "hello") still work — $text only matches whole indexed words.
export const searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const q = (req.query.q || "").trim();
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    if (!q) return res.json({ messages: [] });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const messages = await Message.find({
      conversation: conversationId,
      $or: [{ text: regex }, { "attachment.name": regex }],
      deletedFor: { $ne: req.user._id },
      deletedForEveryone: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("sender", "name username avatar");

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: "Search failed.", error: err.message });
  }
};

// Media / Files / Links shared in a conversation (section 28 / 37).
export const getSharedContent = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }

    const base = {
      conversation: conversationId,
      deletedFor: { $ne: req.user._id },
      deletedForEveryone: { $ne: true },
    };

    const [media, files, linkMessages] = await Promise.all([
      Message.find({ ...base, type: { $in: ["image", "video"] } }).sort({ createdAt: -1 }).limit(200),
      Message.find({ ...base, type: { $in: ["file", "audio"] } }).sort({ createdAt: -1 }).limit(200),
      Message.find({ ...base, type: "text", text: /https?:\/\//i })
        .sort({ createdAt: -1 })
        .limit(200),
    ]);

    const urlRegex = /https?:\/\/[^\s]+/gi;
    const links = linkMessages.flatMap((m) => {
      const found = m.text.match(urlRegex) || [];
      return found.map((url) => ({ url, messageId: m._id, createdAt: m.createdAt }));
    });

    res.json({ media, files, links });
  } catch (err) {
    res.status(500).json({ message: "Failed to load shared content.", error: err.message });
  }
};
