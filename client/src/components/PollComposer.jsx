import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import { useSocket } from "../context/SocketContext.jsx";

const EXPIRY_OPTIONS = [
  { label: "No expiry", minutes: null },
  { label: "1 hour", minutes: 60 },
  { label: "24 hours", minutes: 60 * 24 },
  { label: "3 days", minutes: 60 * 24 * 3 },
  { label: "7 days", minutes: 60 * 24 * 7 },
];

const Toggle = ({ checked, onChange, label, hint }) => (
  <label className="flex items-start gap-3 py-2 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[rgb(var(--color-accent))] flex-shrink-0" />
    <span className="min-w-0">
      <span className="block text-sm text-ink">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </span>
  </label>
);

// Group-only poll creation sheet (opened from the attach menu).
const PollComposer = ({ conversationId, onClose }) => {
  const { socket } = useSocket();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [expiry, setExpiry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const dupes = new Set(filled.map((o) => o.toLowerCase())).size !== filled.length;
  const valid = question.trim().length > 0 && filled.length >= 2 && !dupes;

  const setOption = (i, v) => setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));

  const submit = (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    if (!socket?.connected) return setError("You're offline. Reconnect and try again.");
    setBusy(true);
    setError("");
    socket.emit(
      "poll:create",
      { conversationId, question: question.trim(), options: filled, multiple, anonymous, expiresInMinutes: EXPIRY_OPTIONS[expiry].minutes },
      (res) => {
        setBusy(false);
        if (res?.error) return setError(res.error);
        onClose();
      }
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Create poll"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full sm:max-w-md max-h-modal-safe overflow-y-auto bg-sidebar border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold">Create poll</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <label className="block text-xs text-muted mb-1" htmlFor="poll-question">Question</label>
        <input
          id="poll-question"
          ref={firstRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          placeholder="Ask the group…"
          className="w-full bg-chat border border-white/5 focus:border-ember/50 outline-none rounded-xl px-3.5 py-2.5 text-base sm:text-sm placeholder:text-muted mb-4"
        />

        <p className="text-xs text-muted mb-1">Options (2–6)</p>
        <div className="space-y-2 mb-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                maxLength={100}
                aria-label={`Option ${i + 1}`}
                placeholder={`Option ${i + 1}`}
                className="flex-1 min-w-0 bg-chat border border-white/5 focus:border-ember/50 outline-none rounded-xl px-3.5 py-2.5 text-base sm:text-sm placeholder:text-muted"
              />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Remove option ${i + 1}`} className="w-10 h-10 flex items-center justify-center text-muted hover:text-red-400 flex-shrink-0">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 6 && (
          <button type="button" onClick={() => setOptions((prev) => [...prev, ""])} className="flex items-center gap-1.5 text-sm text-ember min-h-[40px] mb-2">
            <Plus size={15} /> Add option
          </button>
        )}
        {dupes && <p className="text-xs text-red-400 mb-2">Options must be different from each other.</p>}

        <div className="border-t border-white/5 pt-2 mt-1">
          <Toggle checked={multiple} onChange={setMultiple} label="Allow multiple answers" />
          <Toggle checked={anonymous} onChange={setAnonymous} label="Anonymous votes" hint="Nobody sees who voted for what." />
          <div className="flex items-center justify-between gap-3 py-2">
            <label htmlFor="poll-expiry" className="text-sm text-ink">Ends</label>
            <select id="poll-expiry" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} className="bg-chat border border-white/5 rounded-lg px-3 py-2 text-sm text-ink outline-none">
              {EXPIRY_OPTIONS.map((o, i) => (
                <option key={o.label} value={i}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-400 mt-1">{error}</p>}

        <button type="submit" disabled={!valid || busy} className="w-full mt-3 bg-ember text-bg font-medium rounded-xl py-3 min-h-[44px] hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 size={16} className="animate-spin" />} Send poll
        </button>
      </motion.form>
    </div>
  );
};

export default PollComposer;
