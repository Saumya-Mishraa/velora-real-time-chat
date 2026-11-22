import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, MapPin, Loader2 } from "lucide-react";

const DURATIONS = [
  { minutes: 15, label: "15 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 480, label: "8 hours" },
];

// Explicit consent step before any live location is shared. Nothing is
// requested from the browser until the person ticks the box and taps Start.
const LiveLocationDialog = ({ onStart, onClose, groupChat }) => {
  const [minutes, setMinutes] = useState(15);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const start = async () => {
    if (!consent || busy) return;
    setBusy(true);
    setError("");
    const res = await onStart(minutes);
    setBusy(false);
    if (res?.error) setError(res.error);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Share live location"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full sm:max-w-sm max-h-modal-safe overflow-y-auto bg-sidebar border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-semibold flex items-center gap-2"><MapPin size={18} className="text-ember" /> Share live location</h2>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <p className="text-sm text-muted mb-3">
          {groupChat ? "Everyone in this group" : "The other person in this chat"} will see where you are on a map and
          follow you as you move, until the time runs out or you stop sharing.
        </p>

        <fieldset className="mb-3">
          <legend className="text-xs text-muted mb-1.5">Share for</legend>
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map((d) => (
              <label key={d.minutes} className={`text-center text-sm rounded-xl border px-2 py-2.5 min-h-[44px] cursor-pointer transition-colors ${minutes === d.minutes ? "border-ember bg-ember/10 text-ember" : "border-white/10 text-ink hover:bg-white/5"}`}>
                <input type="radio" name="live-duration" className="sr-only" checked={minutes === d.minutes} onChange={() => setMinutes(d.minutes)} />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-3 text-sm cursor-pointer mb-3">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[rgb(var(--color-accent))] flex-shrink-0" />
          <span>I understand my precise location will be shared live with this chat. I can stop at any time.</span>
        </label>

        {error && <p role="alert" className="text-sm text-red-400 mb-2">{error}</p>}

        <button onClick={start} disabled={!consent || busy} className="w-full bg-ember text-bg font-medium rounded-xl py-3 min-h-[44px] hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 size={16} className="animate-spin" />} Start sharing
        </button>
      </motion.div>
    </div>
  );
};

export default LiveLocationDialog;
