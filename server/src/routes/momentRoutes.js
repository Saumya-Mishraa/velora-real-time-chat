import express from "express";
import { protect } from "../middleware/auth.js";
import {
  listMoments, createMoment, getMoment, updateMoment, deleteMoment,
  addItems, updateItem, deleteItem, shareMoment,
} from "../controllers/momentController.js";

const router = express.Router();
router.use(protect);
router.get("/", listMoments);
router.post("/", createMoment);
router.get("/:id", getMoment);
router.patch("/:id", updateMoment);
router.delete("/:id", deleteMoment);
router.post("/:id/items", addItems);
router.patch("/:id/items/:itemId", updateItem);
router.delete("/:id/items/:itemId", deleteItem);
router.post("/:id/share", shareMoment);
export default router;
