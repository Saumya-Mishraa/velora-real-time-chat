import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "file", "voice", "call"],
      default: "text",
    },
    text: { type: String, trim: true, default: "" },
    attachment: {
      url: { type: String },
      name: { type: String },
      size: { type: Number },
      mimeType: { type: String },
      // Voice messages only — playback duration in whole seconds.
      duration: { type: Number },
    },

    // Call records (type === "call"): written once when a call reaches a
    // terminal state, so the chat shows "Voice call · 2:13" / "Missed
    // video call" in the conversation timeline.
    call: {
      callId: { type: String },
      mode: { type: String, enum: ["audio", "video"] },
      status: {
        type: String,
        enum: ["ended", "missed", "declined", "busy", "failed", "canceled"],
      },
      duration: { type: Number, default: 0 },
    },

    // Replies to a Status, and Moments shared into a chat.
    statusReply: {
      statusId: { type: String },
      type: { type: String },
      text: { type: String },
      mediaUrl: { type: String },
      bgColor: { type: String },
    },
    shared: {
      kind: { type: String, enum: ["moment"] },
      refId: { type: String },
      title: { type: String },
      cover: { type: String },
      counts: { type: String },
    },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: { type: String },
      },
    ],

    // Per-recipient delivery/read tracking. `readBy` doubles as the
    // authoritative "seen" list (kept under its original name so it
    // doesn't require a data migration); `deliveredTo` is the new
    // "message reached the recipient's device" tier in between sent and
    // seen. The sender is added to both on creation, since a sender has
    // trivially delivered/seen their own message.
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    edited: { type: Boolean, default: false },
    editedAt: { type: Date },

    // Delete for me: users who have hidden this message from their own
    // view. Delete for everyone: the message is tombstoned for all
    // members but the document (and any reply chain pointing to it)
    // is preserved rather than removed.
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deletedForEveryone: { type: Boolean, default: false },
    // Legacy flag, kept so any existing "delete for everyone" data from
    // before this change still renders as deleted.
    deleted: { type: Boolean, default: false },

    pinned: { type: Boolean, default: false },
    pinnedAt: { type: Date },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, pinned: 1 });
// Full-text search within a conversation's messages (see
// messageController.searchMessages).
messageSchema.index({ text: "text" });

const Message = mongoose.model("Message", messageSchema);
export default Message;
