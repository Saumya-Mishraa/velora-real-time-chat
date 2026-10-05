import express from "express";
import { protect } from "../middleware/auth.js";
import { buildIceServers, callHistoryFor, getUserCallId } from "../socket/callHandler.js";

const router = express.Router();
router.use(protect);

router.get("/ice", (req, res) => {
  res.json({ iceServers: buildIceServers(String(req.user._id)) });
});

router.get("/", async (req, res) => {
  try {
    res.json({ calls: await callHistoryFor(req.user._id), activeCallId: getUserCallId(req.user._id) || null });
  } catch (err) {
    res.status(500).json({ message: "Failed to load call history.", error: err.message });
  }
});

export default router;
