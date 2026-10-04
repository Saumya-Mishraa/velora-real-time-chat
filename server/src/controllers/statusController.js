import Status, { STATUS_TTL_MS } from "../models/Status.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { toStoredRef } from "../utils/mediaUrl.js";
import { emitToUsers, joinUsersToConversation } from "../socket/registry.js";
import { populateOpts, toClientShape } from "./conversationController.js";

const BG_COLORS = ["#FF6B4A", "#B58CFF", "#3AA0FF", "#5FE2B8", "#FF6FA5", "#FFB86B", "#2B2F3A"];

const brief = (u) => ({ id: String(u._id), name: u.name, username: u.username, avatar: u.avatar || "" });

// Everyone this user has a one-to-one chat with ("chats" audience).
const privateChatPartners = async (userId) => {
  const convs = await Conversation.find({ isGroup: false, members: userId }).select("members");
  const ids = new Set();
  convs.forEach((c) => c.members.forEach((m) => String(m) !== String(userId) && ids.add(String(m))));
  return ids;
};

const blockedEitherWay = async (userId) => {
  const me = await User.findById(userId).select("blockedUsers");
  const blockedMe = await User.find({ blockedUsers: userId }).select("_id");
  return new Set([...(me?.blockedUsers || []).map(String), ...blockedMe.map((u) => String(u._id))]);
};

// Pure rule: may `viewerId` see this status (ignoring blocks)?
const audienceAllows = (status, viewerId, authorPartners) => {
  const v = String(viewerId);
  const listed = status.audienceUsers.some((u) => String(u) === v);
  if (status.audience === "selected") return listed;
  if (!authorPartners.has(v)) return false;
  if (status.audience === "except") return !listed;
  return true; // "chats"
};

const canView = async (status, viewerId) => {
  if (String(status.author) === String(viewerId)) return true;
  if (status.expiresAt <= new Date()) return false;
  const blocked = await blockedEitherWay(viewerId);
  if (blocked.has(String(status.author))) return false;
  const partners = await privateChatPartners(status.author);
  return audienceAllows(status, viewerId, partners);
};

const audienceUserIds = async (status) => {
  const partners = await privateChatPartners(status.author);
  const blocked = await blockedEitherWay(status.author);
  const candidates =
    status.audience === "selected"
      ? status.audienceUsers.map(String)
      : Array.from(partners);
  return candidates.filter((id) => !blocked.has(id) && audienceAllows(status, id, partners));
};

const shapeStatus = (status, author, viewerId) => {
  const isOwner = String(status.author?._id || status.author) === String(viewerId);
  const out = {
    _id: String(status._id),
    author: brief(author),
    type: status.type,
    text: status.text,
    bgColor: status.bgColor,
    mediaUrl: status.mediaUrl,
    mimeType: status.mimeType,
    caption: status.caption,
    createdAt: status.createdAt,
    expiresAt: status.expiresAt,
    viewed: isOwner ? true : status.viewers.some((v) => String(v.user?._id || v.user) === String(viewerId)),
    viewerCount: isOwner ? status.viewers.length : undefined,
  };
  if (isOwner) {
    out.audience = status.audience;
    out.audienceUsers = status.audienceUsers.map(String);
    out.viewers = status.viewers.map((v) => ({
      user: v.user?.name ? brief(v.user) : { id: String(v.user) },
      viewedAt: v.viewedAt,
    }));
  }
  return out;
};

export const createStatus = async (req, res) => {
  try {
    const { type, text = "", bgColor = "", mediaPath, mimeType = "", caption = "", audience = "chats", audienceUsers = [] } =
      req.body || {};
    if (!["text", "image", "video"].includes(type)) return res.status(400).json({ message: "Invalid status type." });
    if (!["chats", "selected", "except"].includes(audience)) {
      return res.status(400).json({ message: "Invalid audience." });
    }

    const doc = {
      author: req.user._id,
      type,
      audience,
      audienceUsers: Array.isArray(audienceUsers) ? audienceUsers.filter(Boolean).slice(0, 500) : [],
      expiresAt: new Date(Date.now() + STATUS_TTL_MS),
    };
    if (audience === "selected" && doc.audienceUsers.length === 0) {
      return res.status(400).json({ message: "Choose at least one person to share with." });
    }

    if (type === "text") {
      if (!String(text).trim()) return res.status(400).json({ message: "Write something first." });
      doc.text = String(text).trim().slice(0, 700);
      doc.bgColor = BG_COLORS.includes(bgColor) ? bgColor : BG_COLORS[0];
    } else {
      const ref = toStoredRef(mediaPath);
      if (!ref) return res.status(400).json({ message: "Upload the media first." });
      if (type === "image" && !String(mimeType).startsWith("image/")) return res.status(400).json({ message: "Not an image." });
      if (type === "video" && !String(mimeType).startsWith("video/")) return res.status(400).json({ message: "Not a video." });
      doc.mediaUrl = ref;
      doc.mimeType = String(mimeType).slice(0, 120);
      doc.caption = String(caption || "").slice(0, 300);
    }

    const status = await Status.create(doc);
    const io = req.app.get("io");
    const mine = shapeStatus(status, req.user, req.user._id);
    const audienceIds = await audienceUserIds(status);

    emitToUsers(io, [req.user._id], "status:mine", { status: mine });
    audienceIds.forEach((id) =>
      emitToUsers(io, [id], "status:new", { status: shapeStatus(status, req.user, id) })
    );

    res.status(201).json({ status: mine });
  } catch (err) {
    res.status(500).json({ message: "Failed to post status.", error: err.message });
  }
};

export const getStatuses = async (req, res) => {
  try {
    const me = req.user._id;
    const now = new Date();

    const mineDocs = await Status.find({ author: me, expiresAt: { $gt: now } })
      .sort({ createdAt: 1 })
      .populate("viewers.user", "name username avatar");
    const mine = mineDocs.map((s) => shapeStatus(s, req.user, me));

    const [partners, blocked] = await Promise.all([privateChatPartners(me), blockedEitherWay(me)]);
    // "selected" statuses can come from people I don't chat with, so
    // authors = partners ∪ anyone who listed me explicitly.
    const docs = await Status.find({
      expiresAt: { $gt: now },
      author: { $ne: me },
      $or: [{ author: { $in: Array.from(partners) } }, { audience: "selected", audienceUsers: me }],
    })
      .sort({ createdAt: 1 })
      .populate("author", "name username avatar");

    const groups = new Map();
    for (const s of docs) {
      const authorId = String(s.author._id);
      if (blocked.has(authorId)) continue;
      const authorPartners = await privateChatPartners(s.author._id);
      if (!audienceAllows(s, me, authorPartners)) continue;
      if (!groups.has(authorId)) groups.set(authorId, { user: brief(s.author), statuses: [] });
      groups.get(authorId).statuses.push(shapeStatus(s, s.author, me));
    }

    const feed = Array.from(groups.values())
      .map((g) => ({
        ...g,
        allViewed: g.statuses.every((s) => s.viewed),
        latestAt: g.statuses[g.statuses.length - 1].createdAt,
      }))
      .sort((a, b) => {
        if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
        return new Date(b.latestAt) - new Date(a.latestAt);
      });

    res.json({ mine, feed });
  } catch (err) {
    res.status(500).json({ message: "Failed to load statuses.", error: err.message });
  }
};

export const viewStatus = async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);
    if (!status || status.expiresAt <= new Date()) return res.status(404).json({ message: "Status not found." });
    if (!(await canView(status, req.user._id))) return res.status(403).json({ message: "You can't view this status." });
    if (String(status.author) === String(req.user._id)) return res.json({ ok: true });

    const already = status.viewers.some((v) => String(v.user) === String(req.user._id));
    if (!already) {
      status.viewers.push({ user: req.user._id, viewedAt: new Date() });
      await status.save();
      emitToUsers(req.app.get("io"), [status.author], "status:viewed", {
        statusId: String(status._id),
        viewer: brief(req.user),
        viewedAt: status.viewers[status.viewers.length - 1].viewedAt,
        viewerCount: status.viewers.length,
      });
      // The viewer's own other tabs mark it seen too.
      emitToUsers(req.app.get("io"), [req.user._id], "status:seen", { statusId: String(status._id) });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to record view.", error: err.message });
  }
};

export const deleteStatus = async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);
    if (!status) return res.status(404).json({ message: "Status not found." });
    if (String(status.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only delete your own status." });
    }
    const audienceIds = await audienceUserIds(status);
    await status.deleteOne();
    const payload = { statusId: String(status._id), authorId: String(req.user._id) };
    emitToUsers(req.app.get("io"), [req.user._id, ...audienceIds], "status:removed", payload);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete status.", error: err.message });
  }
};

// Replying to a status lands in the author's 1:1 chat with the viewer
// (created on demand) as a normal message carrying a preview of the status.
export const replyToStatus = async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: "Reply is empty." });

    const status = await Status.findById(req.params.id);
    if (!status || status.expiresAt <= new Date()) return res.status(404).json({ message: "Status not found." });
    if (String(status.author) === String(req.user._id)) {
      return res.status(400).json({ message: "You can't reply to your own status." });
    }
    if (!(await canView(status, req.user._id))) return res.status(403).json({ message: "You can't view this status." });

    const io = req.app.get("io");
    let conversation = await Conversation.findOne({
      isGroup: false,
      members: { $all: [req.user._id, status.author], $size: 2 },
    });
    let isNew = false;
    if (!conversation) {
      conversation = await Conversation.create({ isGroup: false, members: [req.user._id, status.author] });
      isNew = true;
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      type: "text",
      text,
      statusReply: {
        statusId: String(status._id),
        type: status.type,
        text: status.type === "text" ? status.text : status.caption,
        mediaUrl: status.type === "image" ? status.mediaUrl : "",
        bgColor: status.bgColor,
      },
      deliveredTo: [req.user._id],
      readBy: [req.user._id],
    });
    conversation.lastMessage = message._id;
    await conversation.save();

    const populatedConv = await conversation.populate(populateOpts);
    const memberIds = [req.user._id, status.author];
    joinUsersToConversation(io, memberIds, conversation._id);
    if (isNew) {
      memberIds.forEach((id) => emitToUsers(io, [id], "conversation:new", toClientShape(populatedConv, id, req)));
    }
    const populated = await message.populate([{ path: "sender", select: "name username avatar" }]);
    io.to(`conversation:${conversation._id}`).emit("message:new", populated);

    res.status(201).json({ conversation: toClientShape(populatedConv, req.user._id, req), message: populated });
  } catch (err) {
    res.status(500).json({ message: "Failed to send reply.", error: err.message });
  }
};
