import { toPublicUrl } from "../utils/mediaUrl.js";

// Rewrites stored media references ("/uploads/<file>") in outgoing JSON into
// absolute URLs the browser can load from any frontend origin. Only the
// `avatar` and `wallpaper` fields are touched; everything else passes
// through unchanged. The DB keeps the origin-independent reference.
const MEDIA_KEYS = new Set(["avatar", "wallpaper", "mediaUrl", "cover"]);

const walk = (node, req, seen) => {
  if (!node || typeof node !== "object" || seen.has(node)) return node;
  seen.add(node);
  if (Array.isArray(node)) return node.map((n) => walk(n, req, seen));
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (MEDIA_KEYS.has(k) && typeof v === "string") out[k] = toPublicUrl(v, req);
    // Attachment-like objects ({ url, mimeType }) — message attachments and
    // Moment items. Plain `url` fields elsewhere (e.g. shared-link lists)
    // are deliberately left alone.
    else if (k === "url" && typeof v === "string" && typeof node.mimeType === "string") {
      out[k] = toPublicUrl(v, req);
    }
    else out[k] = walk(v, req, seen);
  }
  return out;
};

export const resolveMedia = (req, res, next) => {
  const original = res.json.bind(res);
  res.json = (body) => {
    // Round-trip through JSON so Mongoose docs/ObjectIds/Dates serialize
    // exactly as they would have, then rewrite media fields.
    let plain;
    try {
      plain = JSON.parse(JSON.stringify(body));
    } catch {
      return original(body);
    }
    return original(walk(plain, req, new WeakSet()));
  };
  next();
};
