import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { toStoredRef, toPublicUrl } from "../utils/mediaUrl.js";
import { joinUsersToConversation, leaveUsersFromConversation, emitToUsers } from "../socket/socketHandler.js";

export const populateOpts = [
  { path: "members", select: "name username avatar status lastSeen bio statusMessage privacy" },
  { path: "admins", select: "name username avatar" },
  { path: "lastMessage" },
];

// Attaches the requesting user's own per-chat settings (pinned/archived/
// muted/wallpaper) to the JSON sent back, and strips the raw `settings`
// array (every other member's preferences are theirs, not this user's
// business) and blockedUsers before anything reaches the wire.
export const toClientShape = (conversation, userId, req = null) => {
  const obj = conversation.toObject ? conversation.toObject() : conversation;
  const mySettings = conversation.settingsFor
    ? conversation.settingsFor(userId)
    : (obj.settings || []).find((s) => String(s.user) === String(userId));
  obj.mySettings = {
    pinned: !!mySettings?.pinned,
    archived: !!mySettings?.archived,
    mutedUntil: mySettings?.mutedUntil || null,
    wallpaper: req ? toPublicUrl(mySettings?.wallpaper, req) : mySettings?.wallpaper || "",
  };
  delete obj.settings;
  if (req) {
    obj.avatar = toPublicUrl(obj.avatar, req);
    obj.admins = (obj.admins || []).map((a) => (a && a.avatar ? { ...a, avatar: toPublicUrl(a.avatar, req) } : a));
  }
  obj.members = (obj.members || []).map((m) => {
    if (!m || !m.privacy) return m;
    const copy = { ...m };
    if (m.privacy.lastSeen === "nobody") delete copy.lastSeen;
    if (m.privacy.onlineStatus === "nobody") delete copy.status;
    if (req && copy.avatar) copy.avatar = toPublicUrl(copy.avatar, req);
    if (m.privacy.profilePicture === "nobody") copy.avatar = "";
    delete copy.privacy;
    return copy;
  });
  return obj;
};

export const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ members: req.user._id })
      .populate(populateOpts)
      .sort({ updatedAt: -1 });

    // Unread count per conversation, for the sidebar badge (section 14).
    // A message counts as unread if this user hasn't read it and hasn't
    // hidden it for themselves, and they aren't its own sender.
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          conversation: { $in: conversations.map((c) => c._id) },
          readBy: { $ne: req.user._id },
          deletedFor: { $ne: req.user._id },
          sender: { $ne: req.user._id },
        },
      },
      { $group: { _id: "$conversation", count: { $sum: 1 } } },
    ]);
    const unreadMap = new Map(unreadCounts.map((u) => [String(u._id), u.count]));

    res.json({
      conversations: conversations.map((c) => ({
        ...toClientShape(c, req.user._id, req),
        unreadCount: unreadMap.get(String(c._id)) || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load conversations.", error: err.message });
  }
};

// Get or create a 1:1 conversation with another user.
export const startPrivateConversation = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required." });
    if (userId === String(req.user._id)) {
      return res.status(400).json({ message: "Cannot start a conversation with yourself." });
    }

    const target = await User.findById(userId).select("blockedUsers");
    if (!target) return res.status(404).json({ message: "User not found." });
    const blockedEitherWay =
      req.user.blockedUsers.some((id) => String(id) === userId) ||
      target.blockedUsers.some((id) => String(id) === String(req.user._id));
    if (blockedEitherWay) {
      return res.status(403).json({ message: "You can't message this user." });
    }

    let conversation = await Conversation.findOne({
      isGroup: false,
      members: { $all: [req.user._id, userId], $size: 2 },
    }).populate(populateOpts);

    let isNew = false;
    if (!conversation) {
      conversation = await Conversation.create({
        isGroup: false,
        members: [req.user._id, userId],
      });
      conversation = await conversation.populate(populateOpts);
      isNew = true;
    }

    if (isNew) {
      const io = req.app.get("io");
      const memberIds = conversation.members.map((m) => m.id || m._id);
      // Join every member's already-connected sockets to the room, then
      // push the new conversation to them. The creator gets it here too,
      // but their client already has it from this response and de-dupes
      // by _id, so that's harmless.
      joinUsersToConversation(io, memberIds, conversation._id);
      memberIds.forEach((id) => {
        emitToUsers(io, [id], "conversation:new", toClientShape(conversation, id, req));
      });
    }

    res.status(201).json({ conversation: toClientShape(conversation, req.user._id, req) });
  } catch (err) {
    res.status(500).json({ message: "Failed to start conversation.", error: err.message });
  }
};

export const createGroup = async (req, res) => {
  try {
    const { name, description, memberIds = [], avatar } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required." });
    }

    const members = Array.from(new Set([...memberIds, String(req.user._id)]));

    const conversation = await Conversation.create({
      isGroup: true,
      name: name.trim(),
      description: description || "",
      avatar: toStoredRef(avatar) || "",
      members,
      admins: [req.user._id],
    });

    const populated = await conversation.populate(populateOpts);

    const io = req.app.get("io");
    joinUsersToConversation(io, members, populated._id);
    members.forEach((id) => {
      emitToUsers(io, [id], "conversation:new", toClientShape(populated, id, req));
    });

    res.status(201).json({ conversation: toClientShape(populated, req.user._id, req) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create group.", error: err.message });
  }
};

const requireGroupAdmin = (conversation, userId) => {
  if (!conversation.isGroup) return false;
  return conversation.admins.some((a) => String(a) === String(userId));
};

export const updateGroup = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group not found." });
    }
    if (!requireGroupAdmin(conversation, req.user._id)) {
      return res.status(403).json({ message: "Only group admins can update the group." });
    }

    const { name, description, avatar } = req.body;
    if (name) conversation.name = name;
    if (description !== undefined) conversation.description = description;
    if (avatar !== undefined) conversation.avatar = toStoredRef(avatar) || "";

    await conversation.save();
    const populated = await conversation.populate(populateOpts);

    const io = req.app.get("io");
    populated.members.forEach((m) => {
      const id = m.id || m._id;
      emitToUsers(io, [id], "conversation:updated", toClientShape(populated, id, req));
    });

    res.json({ conversation: toClientShape(populated, req.user._id, req) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update group.", error: err.message });
  }
};

export const addMembers = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group not found." });
    }
    if (!requireGroupAdmin(conversation, req.user._id)) {
      return res.status(403).json({ message: "Only group admins can add members." });
    }
    const { memberIds = [] } = req.body;
    conversation.members = Array.from(new Set([...conversation.members.map(String), ...memberIds]));
    await conversation.save();
    const populated = await conversation.populate(populateOpts);

    const io = req.app.get("io");
    joinUsersToConversation(io, memberIds, populated._id);
    populated.members.forEach((m) => {
      const id = m.id || m._id;
      emitToUsers(io, [id], "conversation:new", toClientShape(populated, id, req));
    });

    res.json({ conversation: toClientShape(populated, req.user._id, req) });
  } catch (err) {
    res.status(500).json({ message: "Failed to add members.", error: err.message });
  }
};

export const removeMember = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group not found." });
    }
    if (!requireGroupAdmin(conversation, req.user._id)) {
      return res.status(403).json({ message: "Only group admins can remove members." });
    }
    const { memberId } = req.body;
    conversation.members = conversation.members.filter((m) => String(m) !== String(memberId));
    conversation.admins = conversation.admins.filter((a) => String(a) !== String(memberId));
    await conversation.save();
    const populated = await conversation.populate(populateOpts);

    const io = req.app.get("io");
    // Stop the removed member's live sockets receiving this room's events.
    leaveUsersFromConversation(io, [memberId], populated._id);
    emitToUsers(io, [memberId], "group:removed", { conversationId: populated._id });
    populated.members.forEach((m) => {
      const id = m.id || m._id;
      emitToUsers(io, [id], "conversation:updated", toClientShape(populated, id, req));
    });

    res.json({ conversation: toClientShape(populated, req.user._id, req) });
  } catch (err) {
    res.status(500).json({ message: "Failed to remove member.", error: err.message });
  }
};

// Grants/revokes group-admin rights on an existing member. Only current
// admins may do this — enforced server-side, never trusting the client.
export const setMemberAdmin = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group not found." });
    }
    if (!requireGroupAdmin(conversation, req.user._id)) {
      return res.status(403).json({ message: "Only group admins can manage admins." });
    }
    const { memberId, isAdmin } = req.body;
    if (!conversation.members.some((m) => String(m) === String(memberId))) {
      return res.status(400).json({ message: "That user isn't a member of this group." });
    }
    const already = conversation.admins.some((a) => String(a) === String(memberId));
    if (isAdmin && !already) conversation.admins.push(memberId);
    if (!isAdmin) conversation.admins = conversation.admins.filter((a) => String(a) !== String(memberId));

    await conversation.save();
    const populated = await conversation.populate(populateOpts);

    const io = req.app.get("io");
    populated.members.forEach((m) => {
      const id = m.id || m._id;
      emitToUsers(io, [id], "conversation:updated", toClientShape(populated, id, req));
    });

    res.json({ conversation: toClientShape(populated, req.user._id, req) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update admin status.", error: err.message });
  }
};

export const leaveGroup = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group not found." });
    }
    conversation.members = conversation.members.filter((m) => String(m) !== String(req.user._id));
    conversation.admins = conversation.admins.filter((a) => String(a) !== String(req.user._id));
    await conversation.save();

    const io = req.app.get("io");
    const populated = await conversation.populate(populateOpts);
    leaveUsersFromConversation(io, [req.user._id], populated._id);
    // The leaver's other tabs/devices drop the chat too.
    emitToUsers(io, [req.user._id], "group:removed", { conversationId: populated._id });
    populated.members.forEach((m) => {
      const id = m.id || m._id;
      emitToUsers(io, [id], "conversation:updated", toClientShape(populated, id, req));
    });

    res.json({ message: "Left group." });
  } catch (err) {
    res.status(500).json({ message: "Failed to leave group.", error: err.message });
  }
};
