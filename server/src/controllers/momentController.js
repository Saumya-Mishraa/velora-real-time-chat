import Moment from "../models/Moment.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { toStoredRef } from "../utils/mediaUrl.js";
import { emitToUsers } from "../socket/registry.js";

const brief = (u) => ({ id: String(u._id), name: u.name, username: u.username, avatar: u.avatar || "" });
const idOf = (x) => String(x?._id || x);

const canAccess = (moment, userId) =>
  idOf(moment.owner) === String(userId) || moment.members.some((m) => idOf(m) === String(userId));

const counts = (moment) => ({
  photos: moment.items.filter((i) => i.kind === "photo").length,
  videos: moment.items.filter((i) => i.kind === "video").length,
  memories: moment.items.filter((i) => i.kind === "memory").length,
});

const coverOf = (moment) => {
  const chosen = moment.coverItem && moment.items.find((i) => String(i._id) === String(moment.coverItem));
  const first = chosen || moment.items.find((i) => i.kind === "photo");
  return first?.kind === "photo" ? first.url : "";
};

const shapeMoment = (moment, viewerId, { withItems = false } = {}) => {
  const out = {
    _id: String(moment._id),
    owner: moment.owner?.name ? brief(moment.owner) : { id: idOf(moment.owner) },
    title: moment.title,
    description: moment.description,
    date: moment.date,
    cover: coverOf(moment),
    coverItem: moment.coverItem ? String(moment.coverItem) : null,
    counts: counts(moment),
    members: moment.members.map((m) => (m?.name ? brief(m) : { id: idOf(m) })),
    isOwner: idOf(moment.owner) === String(viewerId),
    createdAt: moment.createdAt,
    updatedAt: moment.updatedAt,
  };
  if (withItems) {
    out.items = moment.items
      .map((i) => ({
        _id: String(i._id),
        kind: i.kind,
        url: i.url,
        name: i.name,
        mimeType: i.mimeType,
        size: i.size,
        text: i.text,
        date: i.date,
        addedBy: idOf(i.addedBy),
        createdAt: i.createdAt,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return out;
};

const populateMoment = (q) => q.populate("owner", "name username avatar").populate("members", "name username avatar");

const broadcast = async (req, moment, extraRecipients = []) => {
  const io = req.app.get("io");
  const fresh = await populateMoment(Moment.findById(moment._id));
  if (!fresh) return;
  const recipients = new Set([idOf(fresh.owner), ...fresh.members.map(idOf), ...extraRecipients.map(String)]);
  recipients.forEach((id) => {
    if (canAccess(fresh, id)) emitToUsers(io, [id], "moment:updated", { moment: shapeMoment(fresh, id) });
  });
};

// Only people the requester already shares a conversation with can be added.
const sanitizeMembers = async (userId, memberIds) => {
  const ids = Array.from(new Set((Array.isArray(memberIds) ? memberIds : []).map(String))).filter(
    (id) => id && id !== String(userId)
  );
  if (ids.length === 0) return [];
  const convs = await Conversation.find({ members: userId }).select("members");
  const known = new Set();
  convs.forEach((c) => c.members.forEach((m) => known.add(String(m))));
  return ids.filter((id) => known.has(id)).slice(0, 50);
};

export const listMoments = async (req, res) => {
  try {
    const docs = await populateMoment(
      Moment.find({ $or: [{ owner: req.user._id }, { members: req.user._id }] }).sort({ date: -1, createdAt: -1 })
    );
    res.json({ moments: docs.map((m) => shapeMoment(m, req.user._id)) });
  } catch (err) {
    res.status(500).json({ message: "Failed to load Moments.", error: err.message });
  }
};

export const createMoment = async (req, res) => {
  try {
    const { title, description = "", date, memberIds = [] } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ message: "Give your Moment a title." });
    const members = await sanitizeMembers(req.user._id, memberIds);
    const moment = await Moment.create({
      owner: req.user._id,
      title: String(title).trim().slice(0, 80),
      description: String(description || "").slice(0, 500),
      date: date ? new Date(date) : new Date(),
      members,
    });
    const fresh = await populateMoment(Moment.findById(moment._id));
    await broadcast(req, fresh);
    res.status(201).json({ moment: shapeMoment(fresh, req.user._id, { withItems: true }) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create Moment.", error: err.message });
  }
};

export const getMoment = async (req, res) => {
  try {
    const moment = await populateMoment(Moment.findById(req.params.id));
    if (!moment || !canAccess(moment, req.user._id)) return res.status(404).json({ message: "Moment not found." });
    res.json({ moment: shapeMoment(moment, req.user._id, { withItems: true }) });
  } catch (err) {
    res.status(500).json({ message: "Failed to load Moment.", error: err.message });
  }
};

export const updateMoment = async (req, res) => {
  try {
    const moment = await Moment.findById(req.params.id);
    if (!moment || idOf(moment.owner) !== String(req.user._id)) {
      return res.status(404).json({ message: "Moment not found." });
    }
    const { title, description, date, memberIds, coverItem } = req.body || {};
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ message: "Title can't be empty." });
      moment.title = String(title).trim().slice(0, 80);
    }
    if (description !== undefined) moment.description = String(description).slice(0, 500);
    if (date) moment.date = new Date(date);
    if (coverItem !== undefined) {
      moment.coverItem = moment.items.some((i) => String(i._id) === String(coverItem)) ? coverItem : undefined;
    }
    const before = moment.members.map(String);
    if (memberIds !== undefined) moment.members = await sanitizeMembers(req.user._id, memberIds);
    await moment.save();

    const removed = before.filter((id) => !moment.members.some((m) => String(m) === id));
    emitToUsers(req.app.get("io"), removed, "moment:deleted", { momentId: String(moment._id) });
    await broadcast(req, moment);
    const fresh = await populateMoment(Moment.findById(moment._id));
    res.json({ moment: shapeMoment(fresh, req.user._id, { withItems: true }) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update Moment.", error: err.message });
  }
};

export const deleteMoment = async (req, res) => {
  try {
    const moment = await Moment.findById(req.params.id);
    if (!moment || idOf(moment.owner) !== String(req.user._id)) {
      return res.status(404).json({ message: "Moment not found." });
    }
    const recipients = [req.user._id, ...moment.members];
    await moment.deleteOne();
    emitToUsers(req.app.get("io"), recipients, "moment:deleted", { momentId: String(moment._id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete Moment.", error: err.message });
  }
};

const kindFromMime = (mimeType = "") => (mimeType.startsWith("video/") ? "video" : "photo");

export const addItems = async (req, res) => {
  try {
    const moment = await Moment.findById(req.params.id);
    if (!moment || !canAccess(moment, req.user._id)) return res.status(404).json({ message: "Moment not found." });

    const input = Array.isArray(req.body?.items) ? req.body.items : [req.body];
    if (input.length === 0 || input.length > 50) return res.status(400).json({ message: "Add between 1 and 50 items at a time." });

    for (const raw of input) {
      const text = String(raw?.text || "").slice(0, 2000);
      const date = raw?.date ? new Date(raw.date) : new Date();
      if (raw?.kind === "memory") {
        if (!text.trim()) return res.status(400).json({ message: "Write the memory first." });
        moment.items.push({ kind: "memory", text, date, addedBy: req.user._id });
        continue;
      }
      const ref = toStoredRef(raw?.url || raw?.path);
      if (!ref) return res.status(400).json({ message: "Upload the file first." });
      const mimeType = String(raw?.mimeType || "");
      if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
        return res.status(400).json({ message: "Moments hold photos, videos and memories." });
      }
      moment.items.push({
        kind: kindFromMime(mimeType),
        url: ref,
        name: String(raw?.name || "").slice(0, 200),
        mimeType,
        size: Number(raw?.size) || 0,
        text,
        date,
        addedBy: req.user._id,
      });
    }
    await moment.save();
    await broadcast(req, moment);
    const fresh = await populateMoment(Moment.findById(moment._id));
    res.status(201).json({ moment: shapeMoment(fresh, req.user._id, { withItems: true }) });
  } catch (err) {
    res.status(500).json({ message: "Failed to add to Moment.", error: err.message });
  }
};

export const updateItem = async (req, res) => {
  try {
    const moment = await Moment.findById(req.params.id);
    if (!moment || !canAccess(moment, req.user._id)) return res.status(404).json({ message: "Moment not found." });
    const item = moment.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: "Item not found." });
    const mine = idOf(item.addedBy) === String(req.user._id);
    if (!mine && idOf(moment.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only edit your own items." });
    }
    if (req.body.text !== undefined) {
      const text = String(req.body.text).slice(0, 2000);
      if (item.kind === "memory" && !text.trim()) return res.status(400).json({ message: "A memory can't be empty." });
      item.text = text;
    }
    if (req.body.date) item.date = new Date(req.body.date);
    await moment.save();
    await broadcast(req, moment);
    const fresh = await populateMoment(Moment.findById(moment._id));
    res.json({ moment: shapeMoment(fresh, req.user._id, { withItems: true }) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update item.", error: err.message });
  }
};

export const deleteItem = async (req, res) => {
  try {
    const moment = await Moment.findById(req.params.id);
    if (!moment || !canAccess(moment, req.user._id)) return res.status(404).json({ message: "Moment not found." });
    const item = moment.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: "Item not found." });
    const mine = idOf(item.addedBy) === String(req.user._id);
    if (!mine && idOf(moment.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only remove your own items." });
    }
    if (String(moment.coverItem) === String(item._id)) moment.coverItem = undefined;
    item.deleteOne();
    await moment.save();
    await broadcast(req, moment);
    const fresh = await populateMoment(Moment.findById(moment._id));
    res.json({ moment: shapeMoment(fresh, req.user._id, { withItems: true }) });
  } catch (err) {
    res.status(500).json({ message: "Failed to remove item.", error: err.message });
  }
};

// Share a Moment into a chat: everyone in that chat gets access to it
// (as members) and the chat receives a card that opens it.
export const shareMoment = async (req, res) => {
  try {
    const moment = await Moment.findById(req.params.id);
    if (!moment || idOf(moment.owner) !== String(req.user._id)) {
      return res.status(404).json({ message: "Only the owner can share a Moment." });
    }
    const conversation = await Conversation.findById(req.body?.conversationId);
    if (!conversation || !conversation.members.some((m) => String(m) === String(req.user._id))) {
      return res.status(403).json({ message: "Not a member of that conversation." });
    }

    const newMembers = conversation.members.filter(
      (m) => String(m) !== String(req.user._id) && !moment.members.some((x) => String(x) === String(m))
    );
    moment.members.push(...newMembers);
    await moment.save();

    const c = counts(moment);
    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      type: "text",
      text: `Shared a Moment: ${moment.title}`,
      shared: {
        kind: "moment",
        refId: String(moment._id),
        title: moment.title,
        cover: coverOf(moment),
        counts: `${c.photos} Photos · ${c.videos} Videos · ${c.memories} Memories`,
      },
      deliveredTo: [req.user._id],
      readBy: [req.user._id],
    });
    conversation.lastMessage = message._id;
    await conversation.save();
    const populated = await message.populate([{ path: "sender", select: "name username avatar" }]);
    req.app.get("io").to(`conversation:${conversation._id}`).emit("message:new", populated);

    await broadcast(req, moment, newMembers);
    const fresh = await populateMoment(Moment.findById(moment._id));
    res.json({ moment: shapeMoment(fresh, req.user._id, { withItems: true }), message: populated });
  } catch (err) {
    res.status(500).json({ message: "Failed to share Moment.", error: err.message });
  }
};
