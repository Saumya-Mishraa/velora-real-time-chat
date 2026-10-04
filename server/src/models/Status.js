import mongoose from "mongoose";

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

const statusSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["text", "image", "video"], required: true },
    text: { type: String, default: "", maxlength: 700 },
    bgColor: { type: String, default: "" },
    // Stored media reference (see utils/mediaUrl.js) for image/video.
    mediaUrl: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    caption: { type: String, default: "", maxlength: 300 },

    // Who may see it. "chats" = people I have a 1:1 chat with,
    // "selected" = only `audienceUsers`, "except" = my chats minus
    // `audienceUsers`.
    audience: { type: String, enum: ["chats", "selected", "except"], default: "chats" },
    audienceUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    viewers: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// MongoDB removes the document shortly after expiresAt (TTL monitor runs
// every ~60s). Queries also filter on expiresAt, so an expired status is
// never served even before the monitor has deleted it.
statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Status", statusSchema);
