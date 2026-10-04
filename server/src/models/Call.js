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
    callee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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

export default mongoose.model("Call", callSchema);
