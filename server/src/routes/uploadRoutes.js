import express from "express";
import fs from "fs";
import mime from "mime-types";
import { upload, MAX_UPLOAD_MB } from "../middleware/upload.js";
import { protect } from "../middleware/auth.js";
import cloudinary from "../config/cloudinary.js";
import { resolveServerOrigin } from "../utils/mediaUrl.js";

const router = express.Router();

router.get("/limits", protect, (req, res) =>
  res.json({ maxMb: MAX_UPLOAD_MB }),
);

// Cloudinary uses resource_type "image" / "video" (audio too) / "raw".
const cloudinaryResourceType = (mimeType) => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/"))
    return "video";
  return "raw";
};

router.post(
  "/",
  protect,
  (req, res, next) =>
    upload.single("file")(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(413)
          .json({
            message: `File is too large. The limit is ${MAX_UPLOAD_MB}MB.`,
          });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE" || err.name === "MulterError") {
        return res
          .status(400)
          .json({
            message: 'Malformed upload. Send one file in the "file" field.',
          });
      }
      return res
        .status(err.status || 400)
        .json({ message: err.message || "Upload failed." });
    }),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "No file provided." });

      // Content-Type from the multipart part can carry parameters
      // ("audio/webm;codecs=opus") — keep just the base type.
      const declared = (req.file.mimetype || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const mimeType =
        declared && declared !== "application/octet-stream"
          ? declared
          : mime.lookup(req.file.originalname) || "application/octet-stream";
      const name = (req.file.originalname || "file")
        .replace(/[\r\n\0]/g, "")
        .slice(0, 200);

      if (process.env.USE_CLOUDINARY === "true") {
        const result = await cloudinary.uploader.upload(req.file.path, {
  folder: "velora",
  resource_type: cloudinaryResourceType(mimeType),
  use_filename: false,
});

console.log("Cloudinary upload success:", {
  public_id: result.public_id,
  secure_url: result.secure_url,
  resource_type: result.resource_type,
});
        fs.unlink(req.file.path, () => {});
        return res.status(201).json({
          url: result.secure_url,
          path: result.secure_url,
          name,
          size: req.file.size,
          mimeType,
        });
      }

      res.status(201).json({
        url: `${resolveServerOrigin(req)}/uploads/${req.file.filename}`,
        path: `/uploads/${req.file.filename}`,
        name,
        size: req.file.size,
        mimeType,
      });
    } catch (err) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      console.error("Upload failed:", {
        message: err.message,
        http_code: err.http_code,
        name: err.name,
        error: err.error,
        response: err.response?.body,
        headers: err.response?.headers,
      });
      res
        .status(500)
        .json({
          message: "Upload failed. Please try again.",
          error: err.message,
        });
    }
  },
);

export default router;
