import express from "express";
import {
  getConversations,
  startPrivateConversation,
  createGroup,
  updateGroup,
  addMembers,
  removeMember,
  setMemberAdmin,
  leaveGroup,
} from "../controllers/conversationController.js";
import {
  setPinned,
  setArchived,
  setMuted,
  setWallpaper,
  clearChat,
} from "../controllers/chatSettingsController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/", getConversations);
router.post("/private", startPrivateConversation);
router.post("/group", createGroup);
router.patch("/group/:id", updateGroup);
router.post("/group/:id/members", addMembers);
router.post("/group/:id/remove-member", removeMember);
router.post("/group/:id/set-admin", setMemberAdmin);
router.post("/group/:id/leave", leaveGroup);

// Per-user chat settings — available for both direct chats and groups.
router.patch("/:id/pin", setPinned);
router.patch("/:id/archive", setArchived);
router.patch("/:id/mute", setMuted);
router.patch("/:id/wallpaper", setWallpaper);
router.delete("/:id/clear", clearChat);

export default router;
