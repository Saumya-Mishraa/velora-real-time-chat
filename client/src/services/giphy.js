// GIF + sticker search (GIPHY). Needs VITE_GIPHY_API_KEY in client/.env —
// a free key from https://developers.giphy.com. Calls go straight from the
// browser to GIPHY (not through the Velora API).

const KEY = import.meta.env.VITE_GIPHY_API_KEY || "";
const BASE = "https://api.giphy.com/v1";

export const giphyEnabled = !!KEY;

const pick = (item, kind) => {
  const im = item.images || {};
  const preview = im.fixed_width_small || im.fixed_width || im.fixed_height_small || im.original;
  const full =
    kind === "stickers"
      ? { url: im.fixed_height?.webp || im.fixed_height?.url || im.original?.url, mime: im.fixed_height?.webp ? "image/webp" : "image/gif" }
      : { url: im.downsized_medium?.url || im.downsized?.url || im.original?.url, mime: "image/gif" };
  return {
    id: item.id,
    title: item.title || "",
    preview: preview?.webp || preview?.url,
    previewW: Number(preview?.width) || 100,
    previewH: Number(preview?.height) || 100,
    url: full.url,
    mimeType: full.mime,
  };
};

export const fetchGiphy = async ({ kind = "gifs", q = "", offset = 0, limit = 24, signal }) => {
  if (!KEY) throw new Error("no-key");
  const params = new URLSearchParams({ api_key: KEY, limit: String(limit), offset: String(offset), rating: "pg-13" });
  let path = `${kind}/trending`;
  if (q.trim()) {
    path = `${kind}/search`;
    params.set("q", q.trim());
  }
  const res = await fetch(`${BASE}/${path}?${params}`, { signal });
  if (!res.ok) throw new Error(`giphy ${res.status}`);
  const json = await res.json();
  return {
    items: (json.data || []).map((d) => pick(d, kind)).filter((i) => i.url && i.preview),
    total: json.pagination?.total_count ?? 0,
    count: json.pagination?.count ?? (json.data || []).length,
  };
};
