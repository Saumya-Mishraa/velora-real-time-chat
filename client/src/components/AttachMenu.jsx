import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Image as ImageIcon, FileText, BarChart3, MapPin, MonitorPlay } from "lucide-react";

// The "+" / paperclip menu. One tap on the button opens this instead of
// jumping straight to the file picker, so polls, live location and Watch
// Together have a home. Plain media/file picking keeps its old behaviour as
// the first two entries.
const Item = ({ icon: Icon, label, hint, onClick, className = "" }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] text-left hover:bg-white/5 active:bg-white/10 transition-colors ${className}`}
  >
    <span className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-ember flex-shrink-0">
      <Icon size={16} />
    </span>
    <span className="min-w-0">
      <span className="block text-sm text-ink truncate">{label}</span>
      {hint && <span className="block text-[11px] text-muted truncate">{hint}</span>}
    </span>
  </button>
);

const AttachMenu = ({ onClose, onMedia, onFile, onPoll, onLocation, onWatch, onGif, isGroup, locationSupported }) => {
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || e.target.closest?.("[data-attach-toggle]")) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label="Attach"
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.14 }}
      className="absolute bottom-full left-3 sm:left-4 mb-2 z-50 w-64 max-w-[calc(100vw-1.5rem)] bg-sidebar border border-white/10 rounded-2xl shadow-2xl py-1 overflow-hidden"
    >
      <Item icon={ImageIcon} label="Photo or video" hint="Optionally view once" onClick={onMedia} />
      <Item icon={FileText} label="File" hint="Documents, audio, anything" onClick={onFile} />
      {isGroup && <Item icon={BarChart3} label="Poll" hint="Let the group vote" onClick={onPoll} />}
      {locationSupported && <Item icon={MapPin} label="Live location" hint="15 min, 1 hour or 8 hours" onClick={onLocation} />}
      <Item icon={MonitorPlay} label="Watch together" hint="Synced YouTube" onClick={onWatch} />
      {/* The GIF button is tucked in here on very narrow phones (<360px). */}
      <div className="min-[360px]:hidden">
        <Item
          icon={({ size }) => <span style={{ fontSize: size * 0.6 }} className="font-bold leading-none">GIF</span>}
          label="GIFs & stickers"
          onClick={onGif}
        />
      </div>
    </motion.div>
  );
};

export default AttachMenu;
