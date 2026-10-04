import express from "express";
import { searchUsers, updateProfile, getUserById } from "../controllers/userController.js";
import { blockUser, unblockUser, getBlockedUsers } from "../controllers/chatSettingsController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/search", searchUsers);
router.get("/blocked", getBlockedUsers);
router.patch("/me", updateProfile);
router.post("/:userId/block", blockUser);
router.post("/:userId/unblock", unblockUser);
router.get("/:id", getUserById);

export default router;
