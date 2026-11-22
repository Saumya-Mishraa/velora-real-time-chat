// Safe YouTube link parsing for Watch Together. Mirrored on the client in
// client/src/utils/youtube.js. Only real YouTube hosts are accepted and
// the result is always an 11-character id, so nothing user-controlled is
// ever interpolated into the player beyond that id.
const HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be", "www.youtu.be",
]);
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const parseYouTubeId = (input) => {
  let raw = String(input ?? "").trim();
  if (!raw || raw.length > 500) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  let id = null;
  if (host.endsWith("youtu.be")) {
    id = url.pathname.split("/").filter(Boolean)[0] || null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1] || null;
  }
  return id && ID_RE.test(id) ? id : null;
};
