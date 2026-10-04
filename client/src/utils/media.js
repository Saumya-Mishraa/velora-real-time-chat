import api from "../services/api.js";

// Stored media references are either absolute (Cloudinary) or relative
// ("/uploads/<file>", local-disk mode). Relative ones are resolved against
// the backend origin: same-origin in dev (Vite proxies /uploads), and
// VITE_SERVER_URL / the deployed backend otherwise.
const SERVER_ORIGIN =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? "" : (import.meta.env.VITE_SOCKET_URL || "https://nuvora-5171.onrender.com"));

export const mediaUrl = (ref) => {
  if (!ref) return "";
  if (/^(https?:|blob:|data:)/i.test(ref)) return ref;
  if (ref.startsWith("/uploads/")) return `${SERVER_ORIGIN.replace(/\/$/, "")}${ref}`;
  return ref;
};

// Link that forces a download with the original file name (local-disk
// mode honours ?download=1&name=; Cloudinary URLs open directly).
export const downloadUrl = (ref, name) => {
  const url = mediaUrl(ref);
  if (!url) return "";
  if (url.includes("/uploads/")) {
    return `${url}${url.includes("?") ? "&" : "?"}download=1&name=${encodeURIComponent(name || "file")}`;
  }
  return url;
};

export const fmtBytes = (bytes = 0) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
};

export const fmtDuration = (seconds = 0) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
};

export const fileKind = (mimeType = "", name = "") => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
};

export const fileTypeLabel = (mimeType = "", name = "") => {
  const ext = (name.split(".").pop() || "").toUpperCase();
  if (mimeType === "application/pdf") return "PDF";
  if (/zip|compressed|tar|rar|7z/.test(mimeType) || ["ZIP", "RAR", "7Z", "TAR", "GZ"].includes(ext)) return "ZIP";
  if (ext && ext.length <= 5 && ext !== name.toUpperCase()) return ext;
  return (mimeType.split("/")[1] || "FILE").toUpperCase().slice(0, 5);
};

export const errorMessage = (err, fallback = "Something went wrong.") =>
  err?.response?.data?.message || err?.message || fallback;

// Uploads one file through the existing /api/upload endpoint (local disk
// or Cloudinary, as configured server-side). Returns
// { path, url, name, size, mimeType } where `path` is the permanent
// reference to persist.
export const uploadFile = async (file, { onProgress, signal } = {}) => {
  const form = new FormData();
  form.append("file", file, file.name || "upload");
  const { data } = await api.post("/upload", form, {
    signal,
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
};

const URL_RE = /(https?:\/\/[^\s<>"')]+)/gi;
export const extractLinks = (text = "") => text.match(URL_RE) || [];
