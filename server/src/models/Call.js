import mongoose from "mongoose";

// One document per call attempt. The live signaling state (who's ringing,
// sockets, WebRTC offers) lives in memory in socket/callHandler.js; this
// collection is the durable history that powers the Calls tab and the
// call records shown inside chats.
const callSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true, unique: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    caller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Group calls have no single callee (see `participants`); the field stays
    // required-free so old one-to-one documents and new group ones coexist.
    callee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isGroup: { type: Boolean, default: false },
    // Group calls: everyone who was rung or joined.
    participants: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        joinedAt: { type: Date },
        leftAt: { type: Date },
        status: { type: String, enum: ["joined", "missed", "declined"], default: "missed" },
      },
    ],
    mode: { type: String, enum: ["audio", "video"], required: true },
    status: {
      type: String,
      enum: ["ended", "missed", "declined", "busy", "failed", "canceled"],
      required: true,
    },
    startedAt: { type: Date, required: true },
    answeredAt: { type: Date },
    endedAt: { type: Date },
    duration: { type: Number, default: 0 },
    message: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true }
);

callSchema.index({ caller: 1, startedAt: -1 });
callSchema.index({ callee: 1, startedAt: -1 });
callSchema.index({ "participants.user": 1, startedAt: -1 });

export default mongoose.model("Call", callSchema);
