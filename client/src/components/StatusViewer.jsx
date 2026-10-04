import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Send, Eye, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../services/api.js";
import { mediaUrl, errorMessage } from "../utils/media.js";

const IMAGE_MS = 5500;

const timeAgo = (date) => {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const StatusViewer = ({ target, mine, feed, onClose, markViewed, removeLocal, onReplied }) => {
  const { user } = useAuth();
  const isMine = target.userId === "mine";

  const group = useMemo(() => {
    if (isMine) return { user: { id: user.id, name: user.name, avatar: user.avatar }, statuses: mine };
    return feed.find((g) => g.user.id === target.userId) || null;
  }, [isMine, mine, feed, target.userId, user]);

  const statuses = group?.statuses || [];
  const [index, setIndex] = useState(() => {
    if (isMine || !group) return 0;
    const firstUnviewed = group.statuses.findIndex((s) => !s.viewed);
    return firstUnviewed === -1 ? 0 : firstUnviewed;
  });
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyFocused, setReplyFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const timerRef = useRef({ start: 0, elapsed: 0, raf: 0 });

  const current = statuses[Math.min(index, statuses.length - 1)];
  const paused = holding || replyFocused || showViewers || sending;

  // Group vanished (expired / deleted while viewing) -> close.
  useEffect(() => {
    if (!group || statuses.length === 0) onClose();
  }, [group, statuses.length, onClose]);

  useEffect(() => {
    if (index >= statuses.length && statuses.length > 0) setIndex(statuses.length - 1);
  }, [statuses.length, index]);

  const next = useCallback(() => {
    if (index < statuses.length - 1) setIndex(index + 1);
    else onClose();
  }, [index, statuses.length, onClose]);

  const prev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
    else setProgress(0);
  }, [index]);

  // Record the view once per status.
  useEffect(() => {
    if (current && !isMine && !current.viewed) markViewed(current._id);
    setProgress(0);
    timerRef.current = { start: 0, elapsed: 0, raf: 0 };
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?._id]);

  // Progress for text/image statuses (video drives its own).
  useEffect(() => {
    if (!current || current.type === "video") return undefined;
    const t = timerRef.current;
    const tick = (now) => {
      if (paused) {
        t.start = 0;
        t.raf = requestAnimationFrame(tick);
        return;
      }
      if (!t.start) t.start = now - t.elapsed;
      t.elapsed = now - t.start;
      const p = Math.min(1, t.elapsed / IMAGE_MS);
      setProgress(p);
      if (p >= 1) {
        next();
        return;
      }
      t.raf = requestAnimationFrame(tick);
    };
    t.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(t.raf);
  }, [current?._id, current?.type, paused, next]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause/resume the video with the same "paused" signal.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused, current?._id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || sending || !current) return;
    setSending(true);
    setError("");
    try {
      const { data } = await api.post(`/status/${current._id}/reply`, { text });
      setReplyText("");
      onReplied(data.conversation);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send your reply."));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!current) return;
    try {
      await api.delete(`/status/${current._id}`);
      removeLocal(current._id);
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete that status."));
    }
  };

  if (!current) return null;
  const author = group.user;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[96] bg-black text-white flex flex-col select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`${author.name}'s status`}
    >
      {/* Progress segments */}
      <div className="flex gap-1 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] relative z-20">
        {statuses.map((s, i) => (
          <div key={s._id} className="h-[3px] flex-1 rounded-full bg-white/25 overflow-hidden">
            <div
              className="h-full bg-white"
              style={{ width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-3 relative z-20">
        <Avatar name={author.name} src={author.avatar} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate text-sm">{isMine ? "My status" : author.name}</p>
          <p className="text-xs text-white/70">{timeAgo(current.createdAt)}</p>
        </div>
        {isMine && (
          <button onClick={remove} aria-label="Delete this status" className="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center">
            <Trash2 size={19} />
          </button>
        )}
        <button onClick={onClose} aria-label="Close status" className="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center">
          <X size={22} />
        </button>
      </div>

      {/* Content + tap zones */}
      <div
        className="flex-1 min-h-0 relative flex items-center justify-center"
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
      >
        {current.type === "text" ? (
          <div className="w-full h-full flex items-center justify-center p-8 text-center" style={{ background: current.bgColor || "#FF6B4A" }}>
            <p className="font-display text-2xl sm:text-4xl font-medium break-words whitespace-pre-wrap max-w-2xl">{current.text}</p>
          </div>
        ) : current.type === "image" ? (
          <img src={mediaUrl(current.mediaUrl)} alt={current.caption || "Status"} className="max-w-full max-h-full object-contain" draggable={false} />
        ) : (
          <video
            ref={videoRef}
            key={current._id}
            src={mediaUrl(current.mediaUrl)}
            autoPlay
            playsInline
            onTimeUpdate={(e) => e.currentTarget.duration && setProgress(e.currentTarget.currentTime / e.currentTarget.duration)}
            onEnded={next}
            className="max-w-full max-h-full"
          />
        )}

        <button onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous" className="absolute left-0 top-0 bottom-24 w-1/4 focus:outline-none" />
        <button onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next" className="absolute right-0 top-0 bottom-24 w-1/4 focus:outline-none" />
        <button onClick={prev} aria-label="Previous status" className="hidden md:flex absolute left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center"><ChevronLeft size={20} /></button>
        <button onClick={next} aria-label="Next status" className="hidden md:flex absolute right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center"><ChevronRight size={20} /></button>

        {current.caption && (
          <p className="absolute bottom-3 inset-x-0 text-center px-6 py-3 bg-gradient-to-t from-black/70 to-transparent text-sm sm:text-base break-words pointer-events-none">
            {current.caption}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-20 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        {error && <p role="alert" className="text-red-300 text-xs mb-2 text-center">{error}</p>}
        {isMine ? (
          <button
            onClick={() => setShowViewers(true)}
            className="mx-auto flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-white/10 hover:bg-white/20 text-sm"
          >
            <Eye size={16} /> {current.viewerCount || 0} {current.viewerCount === 1 ? "view" : "views"}
          </button>
        ) : (
          <div className="flex items-center gap-2 max-w-xl mx-auto">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => setReplyFocused(true)}
              onBlur={() => setReplyFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              placeholder={`Reply to ${author.name.split(" ")[0]}…`}
              aria-label="Reply to status"
              maxLength={2000}
              className="flex-1 min-w-0 bg-white/10 border border-white/20 focus:border-white/50 outline-none rounded-full px-4 py-3 text-base placeholder:text-white/60"
            />
            <button
              onClick={sendReply}
              disabled={!replyText.trim() || sending}
              aria-label="Send reply"
              className="w-12 h-12 rounded-full bg-ember text-bg flex items-center justify-center disabled:opacity-40 flex-shrink-0"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        )}
      </div>

      {/* Viewer list (owner) */}
      {showViewers && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowViewers(false)}>
          <div
            className="w-full sm:max-w-sm max-h-[70dvh] bg-sidebar rounded-t-2xl sm:rounded-2xl border border-white/10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Viewers"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <h3 className="font-display font-semibold">Viewed by {current.viewerCount || 0}</h3>
              <button onClick={() => setShowViewers(false)} aria-label="Close viewers" className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
              {(current.viewers || []).length === 0 ? (
                <p className="text-center text-muted text-sm py-8">No views yet.</p>
              ) : (
                [...current.viewers].reverse().map((v) => (
                  <div key={v.user.id} className="flex items-center gap-3 px-3 py-2 min-h-[52px]">
                    <Avatar name={v.user.name} src={v.user.avatar} size={38} />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{v.user.name}</p>
                      <p className="text-xs text-muted">{timeAgo(v.viewedAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default StatusViewer;
