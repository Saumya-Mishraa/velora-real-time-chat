import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 50;

// General files are welcome, but anything a browser or server could
// *execute* when opened is not: HTML/SVG/JS (stored XSS when served from

const BLOCKED_EXTENSIONS = new Set([
  "html", "htm", "xhtml", "shtml", "svg", "svgz", "xml", "xsl", "js", "mjs", "cjs", "jsx",
  "php", "php3", "php4", "php5", "phtml", "jsp", "jspx", "asp", "aspx", "cgi", "pl", "py",
  "rb", "exe", "msi", "bat", "cmd", "com", "scr", "pif", "vbs", "vbe", "wsf", "ps1",
  "sh", "bash", "jar", "dll", "so", "apk", "app", "dmg", "lnk", "reg", "hta",
]);

export const safeExtension = (originalName = "") => {
  const ext = path.extname(originalName).replace(".", "").toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "";
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Random, unguessable name; only a sanitized extension is kept from
    // the client-supplied filename (never the name itself, so no path
    // tricks or odd characters reach the filesystem).
    const ext = safeExtension(file.originalname);
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext ? `.${ext}` : ""}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = safeExtension(file.originalname);
  // Double extensions like "report.pdf.exe" resolve to the last one, which
  // is the one the OS honours, so checking the final extension suffices.
  if (BLOCKED_EXTENSIONS.has(ext)) {
    const err = new Error(
      `".${ext}" files can't be shared for security reasons. Put it in a .zip to send it.`
    );
    err.status = 400;
    return cb(err, false);
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

// Types that are safe to render inline from our origin. Everything else
// is served as a forced download (see server.js static handler).
export const INLINE_MIME_PREFIXES = ["image/", "video/", "audio/"];
export const INLINE_MIME_EXACT = ["application/pdf", "text/plain"];
