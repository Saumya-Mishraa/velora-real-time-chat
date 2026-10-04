import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Play, FileText, Download, Link2, ExternalLink, ImageOff, FileArchive, FileImage, FileVideo, FileAudio } from "lucide-react";
import ImageLightbox from "./ImageLightbox.jsx";
import { mediaUrl, downloadUrl, fmtBytes, fileTypeLabel } from "../utils/media.js";

const TABS = [
  { id: "media", label: "Media" },
  { id: "files", label: "Files" },
  { id: "links", label: "Links" },
];

const iconFor = (mime = "") => {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("audio/")) return FileAudio;
  if (/zip|compressed|tar/.test(mime)) return FileArchive;
  return FileText;
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const fmtDate = (d) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

const Empty = ({ children }) => <p className="text-xs text-muted px-5 py-6 text-center">{children}</p>;

const MediaTile = ({ item, onOpen }) => {
  const [failed, setFailed] = useState(false);
  const isVideo = item.type === "video";
  const src = mediaUrl(item.attachment?.url);
  return (
    <button
      onClick={() => onOpen(item)}
      aria-label={isVideo ? "Play video" : "View photo"}
      className="relative aspect-square rounded-lg overflow-hidden bg-black/30"
    >
      {failed ? (
        <span className="w-full h-full flex items-center justify-center text-muted"><ImageOff size={18} /></span>
      ) : isVideo ? (
        <video src={`${src}#t=0.1`} preload="metadata" muted playsInline onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      )}
      {isVideo && !failed && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center"><Play size={14} fill="white" /></span>
        </span>
      )}
    </button>
  );
};

// Media | Files | Links for a conversation. `shared` is { media, files, links }.
const SharedContent = ({ shared }) => {
  const [tab, setTab] = useState("media");
  const [viewer, setViewer] = useState(null); // message
  const counts = { media: shared.media.length, files: shared.files.length, links: shared.links.length };

  // Open on the first non-empty tab if Media is empty.
  useEffect(() => {
    if (counts.media === 0 && counts.files > 0) setTab("files");
    else if (counts.media === 0 && counts.files === 0 && counts.links > 0) setTab("links");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const photos = useMemo(() => shared.media, [shared.media]);

  return (
    <div className="py-3">
      <div role="tablist" aria-label="Shared content" className="grid grid-cols-3 gap-1 mx-4 mb-3 bg-chat rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[40px] rounded-lg text-xs transition-colors ${tab === t.id ? "bg-ember/15 text-ember" : "text-muted hover:text-ink"}`}
          >
            {t.label} <span className="opacity-70">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      {tab === "media" &&
        (photos.length === 0 ? (
          <Empty>No shared photos or videos yet.</Empty>
        ) : (
          <div className="grid grid-cols-3 gap-1 px-4">
            {photos.map((m) => (
              <MediaTile key={m._id} item={m} onOpen={setViewer} />
            ))}
          </div>
        ))}

      {tab === "files" &&
        (shared.files.length === 0 ? (
          <Empty>No shared files yet.</Empty>
        ) : (
          <ul>
            {shared.files.map((f) => {
              const a = f.attachment || {};
              const Icon = iconFor(a.mimeType);
              return (
                <li key={f._id} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5">
                  <span className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Icon size={18} className="text-muted" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate" title={a.name}>{a.name || "File"}</p>
                    <p className="text-xs text-muted truncate">
                      {[fileTypeLabel(a.mimeType, a.name), fmtBytes(a.size), fmtDate(f.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <a
                    href={downloadUrl(a.url, a.name)}
                    download={a.name}
                    aria-label={`Download ${a.name}`}
                    title="Download"
                    className="w-10 h-10 rounded-full hover:bg-white/10 text-muted hover:text-ember flex items-center justify-center flex-shrink-0"
                  >
                    <Download size={16} />
                  </a>
                  <a
                    href={mediaUrl(a.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${a.name}`}
                    title="Open"
                    className="w-10 h-10 rounded-full hover:bg-white/10 text-muted hover:text-ember flex items-center justify-center flex-shrink-0"
                  >
                    <ExternalLink size={16} />
                  </a>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "links" &&
        (shared.links.length === 0 ? (
          <Empty>No shared links yet.</Empty>
        ) : (
          <ul>
            {shared.links.map((l, i) => (
              <li key={`${l.url}-${i}`}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 min-h-[52px]"
                >
                  <span className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Link2 size={17} className="text-muted" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ember truncate">{hostOf(l.url)}</span>
                    <span className="block text-xs text-muted truncate">{l.url}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ))}

      <AnimatePresence>
        {viewer && viewer.type === "image" && (
          <ImageLightbox src={mediaUrl(viewer.attachment.url)} alt={viewer.attachment.name} onClose={() => setViewer(null)} />
        )}
      </AnimatePresence>
      {viewer && viewer.type === "video" && (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-3" onClick={() => setViewer(null)} role="dialog" aria-modal="true">
          <video src={mediaUrl(viewer.attachment.url)} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full rounded-lg" />
          <button onClick={() => setViewer(null)} aria-label="Close video" className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] right-4 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center">✕</button>
        </div>
      )}
    </div>
  );
};

export default SharedContent;
