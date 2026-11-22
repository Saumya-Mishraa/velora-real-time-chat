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
      enum: ["text", "image", "video", "audio", "file", "voice", "call", "poll", "location"],
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
      // Group calls (additive: old documents simply don't have these).
      isGroup: { type: Boolean, default: false },
      participantCount: { type: Number, default: 0 },
    },

    // View-once media (image/video only). The media URL stays in
    // attachment.url but is NEVER sent to clients - see utils/messageView.js.
    // Recipients get it once from POST /api/messages/single/:id/view-once.
    viewOnce: { type: Boolean, default: false },
    viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Group polls (type === "poll").
    poll: {
      question: { type: String },
      options: [
        {
          id: { type: String },
          text: { type: String },
          voters: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        },
      ],
      multiple: { type: Boolean, default: false },
      anonymous: { type: Boolean, default: false },
      expiresAt: { type: Date },
      closed: { type: Boolean, default: false },
      closedAt: { type: Date },
      closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    // Live location (type === "location"). Coordinates are deliberately NOT
    // stored here: they live only in memory (socket/locationStore.js) while
    // the share is active, so nothing location-related survives expiry.
    location: {
      live: { type: Boolean, default: false },
      startedAt: { type: Date },
      expiresAt: { type: Date },
      endedAt: { type: Date },
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

    // Starred messages are private to each person. Never sent to the
    // client as a list: the API exposes a per-viewer `starred` boolean.
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Forwarded copy of another message.
    forwarded: { type: Boolean, default: false },

    // @mentions (group chats): ids of the members mentioned in `text`.
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // GIFs / stickers are stored as plain "image" messages (attachment
    // points at the external GIPHY URL) with an explicit flag.
    gif: { type: Boolean, default: false },
    sticker: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, pinned: 1 });
messageSchema.index({ "location.live": 1, "location.expiresAt": 1 }, { sparse: true });
messageSchema.index({ starredBy: 1, createdAt: -1 });
// Full-text search within a conversation's messages (see
// messageController.searchMessages).
messageSchema.index({ text: "text" });

const Message = mongoose.model("Message", messageSchema);
export default Message;
