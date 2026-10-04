import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    avatar: { type: String, default: "" },
    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
    lastSeen: { type: Date, default: Date.now },

    // --- Profile ---
    bio: { type: String, trim: true, default: "", maxlength: 160 },
    // Free-form custom status text (e.g. "Studying", "Away", or anything
    // the user types). Kept separate from `status` (online/offline
    // presence, a real-time connection state) which the user can't set.
    statusMessage: { type: String, trim: true, default: "", maxlength: 60 },

    // --- Privacy ---
    // "everyone" | "nobody" for each visibility control. Kept simple
    // (no "contacts only" tier, since this app has no contacts list)
    // but every value here actually gates backend/frontend behavior —
    // see userController.js / conversationController.js / socketHandler.js.
    privacy: {
      lastSeen: { type: String, enum: ["everyone", "nobody"], default: "everyone" },
      onlineStatus: { type: String, enum: ["everyone", "nobody"], default: "everyone" },
      profilePicture: { type: String, enum: ["everyone", "nobody"], default: "everyone" },
      messaging: { type: String, enum: ["everyone", "nobody"], default: "everyone" },
    },

    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

userSchema.index({ username: "text", name: "text", email: "text" });

const User = mongoose.model("User", userSchema);
export default User;
