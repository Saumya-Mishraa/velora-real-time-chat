import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { emitToUsers as emitUsers } from "../socket/registry.js";
import { emitToUser } from "../socket/socketHandler.js";
import { toStoredRef, toPublicUrl } from "../utils/mediaUrl.js";

const isMember = (conversation, userId) =>
  conversation.members.some((m) => String(m) === String(userId));

// Finds (creating if absent) the settings sub-document for this user
// within a conversation, so callers always have a real, saveable entry
// to mutate rather than the read-only default from settingsFor().
const getOrCreateSettings = (conversation, userId) => {
  let entry = conversation.settings.find((s) => String(s.user) === String(userId));
  if (!entry) {
    conversation.settings.push({ user: userId });
    entry = conversation.settings[conversation.settings.length - 1];
  }
  return entry;
};

const publicSettings = (conversation, userId, req) => {
  const s = conversation.settingsFor(userId);
  return {
    conversationId: conversation._id,
    pinned: !!s.pinned,
    archived: !!s.archived,
    mutedUntil: s.mutedUntil || null,
    wallpaper: toPublicUrl(s.wallpaper, req),
  };
};

const pushAndNotify = async (req, conversation) => {
  const io = req.app.get("io");
  const payload = publicSettings(conversation, req.user._id, req);
  // Per-user setting — only this user's other tabs/devices need to know.
  emitToUser(io, req.user._id, "conversation:settings", payload);
  return payload;
};

export const setPinned = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    const entry = getOrCreateSettings(conversation, req.user._id);
    entry.pinned = !!req.body.pinned;
    entry.pinnedAt = entry.pinned ? new Date() : undefined;
    await conversation.save();
    res.json({ settings: await pushAndNotify(req, conversation) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update pinned chat.", error: err.message });
  }
};

export const setArchived = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    const entry = getOrCreateSettings(conversation, req.user._id);
    entry.archived = !!req.body.archived;
    await conversation.save();
    res.json({ settings: await pushAndNotify(req, conversation) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update archive state.", error: err.message });
  }
};

// duration: "1h" | "8h" | "1w" | "always" | null (unmute)
const MUTE_DURATIONS = {
  "1h": 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

export const setMuted = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    const entry = getOrCreateSettings(conversation, req.user._id);
    const { duration } = req.body; // "1h" | "8h" | "1w" | "always" | null

    if (!duration) {
      entry.mutedUntil = null;
    } else if (duration === "always") {
      // Represented as a far-future date rather than a separate boolean,
      // so "is muted right now" is always a single comparison.
      entry.mutedUntil = new Date("2999-01-01");
    } else if (MUTE_DURATIONS[duration]) {
      entry.mutedUntil = new Date(Date.now() + MUTE_DURATIONS[duration]);
    } else {
      return res.status(400).json({ message: "Invalid mute duration." });
    }

    await conversation.save();
    res.json({ settings: await pushAndNotify(req, conversation) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update mute.", error: err.message });
  }
};

// Accepts a URL previously returned by POST /api/upload (image), or ""
// to remove the wallpaper and fall back to the default background.
export const setWallpaper = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    const entry = getOrCreateSettings(conversation, req.user._id);
    const ref = toStoredRef(req.body.wallpaper);
    if (ref === null) {
      return res.status(400).json({ message: "Invalid image reference. Upload the image first." });
    }
    entry.wallpaper = ref;
    await conversation.save();
    res.json({ settings: await pushAndNotify(req, conversation) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update wallpaper.", error: err.message });
  }
};

// Hides every message currently in the conversation from this user only
// (adds them to each message's deletedFor). Other members' history, and
// the conversation itself, are untouched.
export const clearChat = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !isMember(conversation, req.user._id)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    await Message.updateMany(
      { conversation: conversation._id, deletedFor: { $ne: req.user._id } },
      { $addToSet: { deletedFor: req.user._id } }
    );
    res.json({ message: "Chat cleared." });
  } catch (err) {
    res.status(500).json({ message: "Failed to clear chat.", error: err.message });
  }
};

export const blockUser = async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (targetId === String(req.user._id)) {
      return res.status(400).json({ message: "You can't block yourself." });
    }
    if (!req.user.blockedUsers.some((id) => String(id) === targetId)) {
      req.user.blockedUsers.push(targetId);
      await req.user.save();
    }
    // Both sides' open tabs refresh immediately (input disabled / enabled,
    // presence hidden) without waiting for a reload.
    emitUsers(req.app.get("io"), [req.user._id], "me:blocked", { blockedUsers: req.user.blockedUsers });
    emitUsers(req.app.get("io"), [targetId], "block:changed", { by: String(req.user._id), blocked: true });
    res.json({ blockedUsers: req.user.blockedUsers });
  } catch (err) {
    res.status(500).json({ message: "Failed to block user.", error: err.message });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const targetId = req.params.userId;
    req.user.blockedUsers = req.user.blockedUsers.filter((id) => String(id) !== targetId);
    await req.user.save();
    emitUsers(req.app.get("io"), [req.user._id], "me:blocked", { blockedUsers: req.user.blockedUsers });
    emitUsers(req.app.get("io"), [targetId], "block:changed", { by: String(req.user._id), blocked: false });
    res.json({ blockedUsers: req.user.blockedUsers });
  } catch (err) {
    res.status(500).json({ message: "Failed to unblock user.", error: err.message });
  }
};

export const getBlockedUsers = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).populate(
      "blockedUsers",
      "name username avatar"
    );
    res.json({ blockedUsers: me.blockedUsers });
  } catch (err) {
    res.status(500).json({ message: "Failed to load blocked users.", error: err.message });
  }
};
