import mongoose from "mongoose";

// Per-user settings for a conversation (pin/archive/mute/wallpaper).
// Embedded as a sub-array keyed by user rather than separate top-level
// arrays so every per-user preference for a chat lives in one place.
const memberSettingsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pinned: { type: Boolean, default: false },
    pinnedAt: { type: Date },
    archived: { type: Boolean, default: false },
    // null/undefined = not muted. A real Date = muted until that time.
    // A far-future date (see chatSettingsController) represents "Always".
    mutedUntil: { type: Date, default: null },
    // Cloudinary URL (or local-disk URL) of the chosen wallpaper image,
    // or "" for none (falls back to the app's default chat background).
    wallpaper: { type: String, default: "" },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    isGroup: { type: Boolean, default: false },
    name: { type: String, trim: true }, // group name, ignored for 1:1
    description: { type: String, trim: true, default: "" },
    avatar: { type: String, default: "" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },

    settings: [memberSettingsSchema],
  },
  { timestamps: true }
);

conversationSchema.methods.settingsFor = function (userId) {
  const uid = String(userId);
  let entry = this.settings.find((s) => String(s.user) === uid);
  if (!entry) {
    entry = { user: userId, pinned: false, archived: false, mutedUntil: null, wallpaper: "" };
  }
  return entry;
};

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
