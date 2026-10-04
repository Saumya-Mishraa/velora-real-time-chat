import express from "express";
import {
  getMessages,
  createMessage,
  deleteMessage,
  editMessage,
  pinMessage,
  getPinnedMessages,
  reactToMessage,
  markRead,
  getMessageInfo,
  searchMessages,
  getSharedContent,
} from "../controllers/messageController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/:conversationId", getMessages);
router.post("/:conversationId", createMessage);
router.post("/:conversationId/read", markRead);
router.get("/:conversationId/search", searchMessages);
router.get("/:conversationId/pinned", getPinnedMessages);
router.get("/:conversationId/shared", getSharedContent);
router.delete("/single/:id", deleteMessage);
router.patch("/single/:id", editMessage);
router.post("/single/:id/react", reactToMessage);
router.post("/single/:id/pin", (req, res, next) => {
  req.params.action = "pin";
  next();
}, pinMessage);
router.post("/single/:id/unpin", (req, res, next) => {
  req.params.action = "unpin";
  next();
}, pinMessage);
router.get("/single/:id/info", getMessageInfo);

export default router;
