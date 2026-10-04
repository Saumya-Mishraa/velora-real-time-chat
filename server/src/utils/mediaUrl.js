// Persistent media references.
//
// What goes in MongoDB is an origin-independent reference:
//   - Cloudinary mode: the absolute https://res.cloudinary.com/... URL
//   - Local-disk mode: a relative "/uploads/<file>" path
// The origin (http://localhost:5173, :5174, a deployed backend, ...) is
// NEVER persisted, because it changes between runs/environments and
// would leave dead links in the DB. Public URLs are resolved on the way
// out of the API (toPublicUrl) using SERVER_URL or the incoming request.

const UPLOADS_PREFIX = "/uploads/";

export const resolveServerOrigin = (req) => {
  if (process.env.SERVER_URL) return process.env.SERVER_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
};

// Normalizes an incoming/legacy value into what should be stored.
// Returns null for values that must never be persisted (blob:/data: URLs).
export const toStoredRef = (value) => {
  if (value === undefined || value === null) return "";
  const v = String(value).trim();
  if (!v) return "";
  if (/^(blob:|data:)/i.test(v)) return null;
  if (v.startsWith(UPLOADS_PREFIX)) return v;
  try {
    const u = new URL(v);
    // Legacy rows / clients: absolute URL pointing at our own uploads
    // folder on some dev origin -> keep only the path.
    if (u.pathname.startsWith(UPLOADS_PREFIX)) return u.pathname;
    return v; // Cloudinary or other external https URL
  } catch {
    return null;
  }
};

// Turns a stored reference into a URL the browser can load.
export const toPublicUrl = (stored, req) => {
  if (!stored) return "";
  const ref = toStoredRef(stored);
  if (ref === null) return ""; // never hand out unusable blob:/data: values
  if (ref.startsWith(UPLOADS_PREFIX)) return `${resolveServerOrigin(req)}${ref}`;
  return ref;
};

// Normalizes an attachment object coming from a client before it is
// persisted: only a safe, origin-independent reference may be stored.
// Returns null when the attachment is unusable (e.g. a blob: URL).
export const normalizeAttachment = (att) => {
  if (!att || typeof att !== "object") return undefined;
  const ref = toStoredRef(att.path || att.url);
  if (!ref) return null;
  const out = { url: ref };
  if (typeof att.name === "string") out.name = att.name.slice(0, 200);
  if (Number.isFinite(Number(att.size))) out.size = Number(att.size);
  if (typeof att.mimeType === "string") out.mimeType = att.mimeType.slice(0, 120);
  if (Number.isFinite(Number(att.duration))) out.duration = Math.round(Number(att.duration));
  return out;
};
