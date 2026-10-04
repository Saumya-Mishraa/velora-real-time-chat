import express from "express";
import { protect } from "../middleware/auth.js";
import { createStatus, getStatuses, viewStatus, deleteStatus, replyToStatus } from "../controllers/statusController.js";

const router = express.Router();
router.use(protect);
router.get("/", getStatuses);
router.post("/", createStatus);
router.post("/:id/view", viewStatus);
router.post("/:id/reply", replyToStatus);
router.delete("/:id", deleteStatus);
export default router;
