import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { emitToUsers } from "../socket/registry.js";
import { toStoredRef, toPublicUrl } from "../utils/mediaUrl.js";

const publicUser = (user, viewerId = null, req = null) => {
  const isSelf = viewerId && String(user._id) === String(viewerId);
  const out = {
    id: user._id,
    name: user.name,
    username: user.username,
    email: isSelf ? user.email : undefined,
    avatar: req ? toPublicUrl(user.avatar, req) : user.avatar,
    bio: user.bio,
    statusMessage: user.statusMessage,
    status: user.status,
    lastSeen: user.lastSeen,
    privacy: isSelf ? user.privacy : undefined,
  };
  if (!isSelf && user.privacy) {
    if (user.privacy.lastSeen === "nobody") delete out.lastSeen;
    if (user.privacy.onlineStatus === "nobody") delete out.status;
    if (user.privacy.profilePicture === "nobody") out.avatar = "";
  }
  return out;
};

export const searchUsers = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ users: [] });

    const regex = new RegExp(q, "i");
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ name: regex }, { username: regex }, { email: regex }],
    }).limit(20);

    res.json({ users: users.map((u) => publicUser(u, null, req)) });
  } catch (err) {
    res.status(500).json({ message: "Search failed.", error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, avatar, bio, statusMessage, privacy } = req.body;
    if (name) req.user.name = name;
    if (avatar !== undefined) {
      const ref = toStoredRef(avatar);
      if (ref === null) {
        return res.status(400).json({ message: "Invalid image reference. Upload the image first." });
      }
      req.user.avatar = ref;
    }
    if (bio !== undefined) req.user.bio = bio.slice(0, 160);
    if (statusMessage !== undefined) req.user.statusMessage = statusMessage.slice(0, 60);
    if (privacy && typeof privacy === "object") {
      const allowed = ["everyone", "nobody"];
      for (const key of ["lastSeen", "onlineStatus", "profilePicture", "messaging"]) {
        if (allowed.includes(privacy[key])) req.user.privacy[key] = privacy[key];
      }
    }
    await req.user.save();
    const mine = publicUser(req.user, req.user._id, req);
    res.json({ user: mine });

    // Real-time: this user's own other tabs get the full profile, and
    // everyone they share a conversation with gets the public fields so
    // names / avatars / bios update in sidebars, headers and chat info
    // without a refresh.
    try {
      const io = req.app.get("io");
      const convs = await Conversation.find({ members: req.user._id }).select("members");
      const others = new Set();
      convs.forEach((c) => c.members.forEach((m) => String(m) !== String(req.user._id) && others.add(String(m))));
      const fields = {
        id: String(req.user._id),
        name: req.user.name,
        avatar: req.user.privacy?.profilePicture === "nobody" ? "" : req.user.avatar,
        bio: req.user.bio,
        statusMessage: req.user.statusMessage,
      };
      emitToUsers(io, [req.user._id], "me:updated", { user: mine });
      emitToUsers(io, Array.from(others), "user:updated", { user: fields });
    } catch (err) {
      console.error("Profile broadcast failed:", err.message);
    }
  } catch (err) {
    res.status(500).json({ message: "Update failed.", error: err.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json({ user: publicUser(user, req.user._id, req) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user.", error: err.message });
  }
};
