import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

// Load environment variables
dotenv.config();

import { connectDB } from "./config/db.js";
import mimeTypes from "mime-types";
import { INLINE_MIME_PREFIXES, INLINE_MIME_EXACT } from "./middleware/upload.js";
import { resolveMedia } from "./middleware/resolveMedia.js";
import Status from "./models/Status.js";
import { initSocket } from "./socket/socketHandler.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import callRoutes from "./routes/callRoutes.js";
import statusRoutes from "./routes/statusRoutes.js";
import momentRoutes from "./routes/momentRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:5173",
  "https://nuvora-client.onrender.com",
];
if (process.env.CLIENT_URL && !allowedOrigins.includes(process.env.CLIENT_URL)) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

// Socket.IO configuration
const io = new Server(server, {
  cors: corsOptions,
});


app.set("io", io);

// Express CORS
app.use(cors(corsOptions));

// Parse JSON
app.use(express.json({ limit: "10mb" }));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    index: false,
    dotfiles: "deny",
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      const type = String(mimeTypes.lookup(filePath) || "").toLowerCase();
      const inlineSafe =
        INLINE_MIME_PREFIXES.some((p) => type.startsWith(p)) ||
        INLINE_MIME_EXACT.some((p) => type.startsWith(p));
      const q = res.req?.query || {};
      if (q.download || !inlineSafe || type.includes("svg")) {
        const rawName = typeof q.name === "string" && q.name ? q.name : path.basename(filePath);
        const safeName = rawName.replace(/[^\w.\- ()]/g, "_").slice(0, 150);
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      }
    },
  })
);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Velora server is running",
  });
});

// Resolve stored media references (avatars/wallpapers) to absolute URLs.
app.use("/api", resolveMedia);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/status", statusRoutes);
app.use("/api/moments", momentRoutes);

// Central error handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(err.status || 500).json({
    message: err.message || "Server error.",
  });
});

// Initialize Socket.IO
initSocket(io);

// Server port
const PORT = process.env.PORT || 5000;

// Connect to MongoDB first, then start server
connectDB()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Velora server running on port ${PORT}`);
    });
    
    const sweep = () => Status.deleteMany({ expiresAt: { $lte: new Date() } }).catch(() => {});
    sweep();
    setInterval(sweep, 10 * 60 * 1000).unref();
  })
  .catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });