import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, Loader2, X, AlertCircle } from "lucide-react";
import { fetchGiphy, giphyEnabled } from "../services/giphy.js";

const TABS = [
  { id: "gifs", label: "GIFs" },
  { id: "stickers", label: "Stickers" },
];
const PAGE = 24;

// GIF / sticker picker shown above the composer. `onPick(item, kind)`.
const GifPicker = ({ onPick, onClose }) => {
  const [tab, setTab] = useState("gifs");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const seq = useRef(0);
  const rootRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (offset) => {
      const id = ++seq.current;
      setLoading(true);
      setError("");
      try {
        const res = await fetchGiphy({ kind: tab, q: debounced, offset, limit: PAGE });
        if (id !== seq.current) return;
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
        setHasMore(res.count >= PAGE && offset + res.count < res.total);
      } catch {
        if (id !== seq.current) return;
        setError("Couldn't load. Check your connection and try again.");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [tab, debounced]
  );

  useEffect(() => {
    if (!giphyEnabled) return;
    setItems([]);
    setHasMore(false);
    load(0);
  }, [load]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target) && !e.target.closest?.("[data-gif-toggle]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="GIFs and stickers"
      className="absolute bottom-full left-2 right-2 mb-2 sm:left-auto sm:right-4 sm:w-[380px] z-50 bg-sidebar border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[min(420px,55dvh)]"
    >
      <div className="flex items-center gap-1 px-3 pt-2.5 border-b border-white/5 flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-3 py-2 text-sm transition-colors ${tab === t.id ? "text-ember" : "text-muted hover:text-ink"}`}
          >
            {t.label}
            {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ember rounded-full" />}
          </button>
        ))}
        <button onClick={onClose} aria-label="Close" className="ml-auto w-9 h-9 flex items-center justify-center text-muted hover:text-ink">
          <X size={16} />
        </button>
      </div>

      {!giphyEnabled ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="max-w-[260px]">
            <AlertCircle size={22} className="mx-auto mb-2 text-amber" />
            <p className="text-sm font-medium mb-1">GIF search isn't set up</p>
            <p className="text-xs text-muted">
              Add a free GIPHY key as <code className="text-ink">VITE_GIPHY_API_KEY</code> in <code className="text-ink">client/.env</code> and restart the dev server.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 py-2 flex-shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "gifs" ? "Search GIFs" : "Search stickers"}
                aria-label="Search"
                className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-full pl-9 pr-3 py-2 text-base sm:text-sm placeholder:text-muted"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
            {error && (
              <div className="text-center text-sm text-muted py-6">
                {error}{" "}
                <button className="text-ember underline" onClick={() => load(0)}>Retry</button>
              </div>
            )}
            {!error && !loading && items.length === 0 && (
              <p className="text-center text-sm text-muted py-8">Nothing found for “{debounced}”.</p>
            )}
            <div className="columns-2 sm:columns-3 gap-1.5">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onPick(it, tab)}
                  title={it.title}
                  className="mb-1.5 w-full block rounded-lg overflow-hidden bg-chat hover:ring-2 hover:ring-ember/60 break-inside-avoid"
                  style={{ aspectRatio: `${it.previewW} / ${it.previewH}` }}
                >
                  <img src={it.preview} alt={it.title || "GIF"} loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            {loading && (
              <div className="flex justify-center py-4 text-muted"><Loader2 size={18} className="animate-spin" /></div>
            )}
            {!loading && hasMore && (
              <button onClick={() => load(items.length)} className="w-full text-xs text-ember py-2">Load more</button>
            )}
            <p className="text-[10px] text-muted text-center pt-2">Powered by GIPHY</p>
          </div>
        </>
      )}
    </div>
  );
};

export default GifPicker;
