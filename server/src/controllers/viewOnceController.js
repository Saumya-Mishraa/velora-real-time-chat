import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { blockedEitherWayIds } from "../utils/blocks.js";
import { toPublicUrl } from "../utils/mediaUrl.js";
import { withKeyLock } from "../utils/keyedLock.js";

// POST /api/messages/single/:id/view-once
//
// The ONLY place a view-once media URL leaves the server. Returns it once
// to a recipient (never the sender) who hasn't opened it yet, and records
// the view atomically so two simultaneous taps / devices can't both win.
//
// NOTE (honest limitation): screenshots and screen recordings cannot be
// prevented in a browser, and once the URL has been handed to a recipient's
// browser a determined person could still save it. View-once here means
// "the app shows it once and the server only discloses it once".
export const openViewOnce = async (req, res) => {
  try {
    const userId = String(req.user._id);
    const message = await Message.findById(req.params.id).select(
      "conversation sender viewOnce viewedBy deletedFor deletedForEveryone deleted type attachment"
    );
    if (!message || !message.viewOnce) return res.status(404).json({ message: "Message not found." });

    const conversation = await Conversation.findById(message.conversation).select("members isGroup");
    if (!conversation || !conversation.members.some((m) => String(m) === userId)) {
      return res.status(403).json({ message: "Not a member of this conversation." });
    }
    if (String(message.sender) === userId) {
      return res.status(403).json({ message: "You can't reopen media you sent." });
    }
    if (message.deletedForEveryone || message.deleted || message.deletedFor.some((u) => String(u) === userId)) {
      return res.status(404).json({ message: "Message not found." });
    }
    if (!conversation.isGroup) {
      const blocked = await blockedEitherWayIds(userId);
      if (blocked.has(String(message.sender))) return res.status(403).json({ message: "You can't open this." });
    }
    if (!message.attachment?.url) return res.status(404).json({ message: "This media is no longer available." });

    // Claim: succeeds for exactly one request per (message, user). The
    // conditional update is the real guard (atomic in MongoDB); the in-process
    // lock additionally serialises two taps/devices hitting THIS server at once.
    const claimed = await withKeyLock(`vo:${message._id}:${userId}`, () =>
      Message.findOneAndUpdate(
        { _id: message._id, viewOnce: true, viewedBy: { $ne: req.user._id }, deletedForEveryone: { $ne: true } },
        { $addToSet: { viewedBy: req.user._id } },
        { new: false } // the pre-update document: proves this request did the claiming
      )
    );
    if (!claimed) return res.status(409).json({ message: "You've already opened this.", opened: true });

    req.app.get("io")?.to(`conversation:${message.conversation}`).emit("message:view-once", {
      messageId: String(message._id),
      conversationId: String(message.conversation),
      userId,
    });

    res.set("Cache-Control", "no-store");
    res.json({
      url: toPublicUrl(claimed.attachment.url, req),
      type: claimed.type,
      mimeType: claimed.attachment.mimeType || "",
    });
  } catch (err) {
    console.error("view-once failed:", err.message);
    res.status(500).json({ message: "Couldn't open this media." });
  }
};
