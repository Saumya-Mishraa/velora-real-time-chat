import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Video, Check, X, Loader2 } from "lucide-react";
import api from "../services/api.js";
import { errorMessage } from "../utils/media.js";

// View-once photo / video.
//
// Server side: the media URL is never part of the message the client holds.
// Tapping the placeholder calls POST /messages/single/:id/view-once, which
// discloses the URL exactly once to a recipient and records the view. This
// component keeps that URL only in memory while the viewer is open.
//
// IMPORTANT / honest limitation: a browser cannot prevent screenshots or
// screen recordings (or someone photographing the screen). Everything here
// - no download/save controls, no context menu, no drag, blurring when the
// tab is hidden - only discourages casual saving. It is "view once" in the
// sense that Velora shows it once and the server only hands out the link once.

const OnceBadge = ({ opened, tone }) => (
  <span
    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
      opened ? "bg-white/10" : "border-[1.5px] border-dashed border-current"
    } ${tone}`}
    aria-hidden="true"
  >
    {opened ? <Check size={16} /> : <span className="text-sm font-semibold leading-none">1</span>}
  </span>
);

const Viewer = ({ media, onClose }) => {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    // Hide the media whenever the tab/app loses visibility (task switcher etc.).
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const isVideo = media.type === "video" || /^video\//.test(media.mimeType || "");
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="View once media"
      className="fixed inset-0 z-[95] bg-black flex flex-col select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-2 text-white/80 text-sm">
        <span>View once · this can only be opened once</span>
        <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-2">
        {hidden ? null : isVideo ? (
          <video
            src={media.url}
            controls
            autoPlay
            playsInline
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            className="max-w-full max-h-full rounded-lg"
          />
        ) : (
          <img src={media.url} alt="View once photo" draggable={false} onContextMenu={(e) => e.preventDefault()} className="max-w-full max-h-full object-contain rounded-lg pointer-events-none" />
        )}
      </div>
    </div>,
    document.body
  );
};

const ViewOnceMedia = ({ message, isOwn, currentUserId }) => {
  const [media, setMedia] = useState(null); // { url, type, mimeType } - memory only
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openedLocally, setOpenedLocally] = useState(false);

  const isVideo = message.type === "video";
  const Icon = isVideo ? Video : ImageIcon;
  const noun = isVideo ? "Video" : "Photo";
  const viewedBy = message.viewedBy || [];
  const opened = openedLocally || message.viewedByMe || viewedBy.some((u) => String(u) === String(currentUserId));
  const tone = isOwn ? "text-bg" : "text-ember";

  const open = async (e) => {
    e.stopPropagation();
    if (busy || opened) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/messages/single/${message._id}/view-once`);
      setMedia(data);
      setOpenedLocally(true);
    } catch (err) {
      if (err.response?.status === 409) setOpenedLocally(true);
      else setError(errorMessage(err, "Couldn't open this."));
    } finally {
      setBusy(false);
    }
  };

  // Sender: status only, never the media.
  if (isOwn) {
    const n = viewedBy.filter((u) => String(u) !== String(currentUserId)).length;
    return (
      <div className="flex items-center gap-3 min-w-[180px] py-0.5">
        <OnceBadge opened={n > 0} tone={tone} />
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5"><Icon size={14} /> {noun}</p>
          <p className="text-xs opacity-75">View once · {n > 0 ? (n > 1 ? `Opened by ${n}` : "Opened") : "Not opened"}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={opened || busy}
        className={`flex items-center gap-3 min-w-[180px] py-0.5 text-left ${opened ? "opacity-70 cursor-default" : "hover:opacity-90"}`}
        aria-label={opened ? `${noun}, opened` : `Open ${noun.toLowerCase()} (view once)`}
      >
        {busy ? <Loader2 size={20} className="animate-spin w-9" /> : <OnceBadge opened={opened} tone={tone} />}
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5"><Icon size={14} /> {noun}{opened ? "" : " · View once"}</p>
          <p className="text-xs opacity-75">{opened ? "Opened" : "Tap to view"}</p>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </div>
      </button>
      {media && <Viewer media={media} onClose={() => setMedia(null)} />}
    </>
  );
};

export default ViewOnceMedia;
