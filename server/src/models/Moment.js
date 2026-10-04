import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["photo", "video", "memory"], required: true },
    url: { type: String, default: "" },
    name: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    // Caption for photo/video, body text for a memory.
    text: { type: String, default: "", maxlength: 2000 },
    date: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const momentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", maxlength: 500 },
    date: { type: Date, default: Date.now },
    // Optional explicit cover item; falls back to the first photo.
    coverItem: { type: mongoose.Schema.Types.ObjectId },
    // People the owner shared this Moment with. Members can view and add
    // to it; only the owner can edit its details, remove people or delete it.
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    items: [itemSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Moment", momentSchema);
