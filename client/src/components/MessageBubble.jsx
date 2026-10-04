import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { motion } from "framer-motion";
import {
  Check,
  CheckCheck,
  Reply,
  Trash2,
  Copy,
  Smile,
  FileText,
  FileArchive,
  FileSpreadsheet,
  Download,
  ImageOff,
  Pencil,
  Pin,
  PinOff,
  Info,
  Play,
  Pause,
  Phone,
  Video,
  PhoneMissed,
  PhoneOff,
  Sparkles,
  CircleDashed,
  FileImage,
  FileVideo,
  FileAudio,
  Link as LinkIcon,
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import ImageLightbox from "./ImageLightbox.jsx";
import { mediaUrl, downloadUrl, fmtBytes, fmtDuration, fileTypeLabel } from "../utils/media.js";

const REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "👏"];

const formatTime = (date) =>
  new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const formatSize = (bytes = 0) => fmtBytes(bytes);

const formatDuration = (seconds = 0) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const fileIconFor = (mimeType = "") => {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("tar")) return FileArchive;
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return FileText;
};

// Highlights occurrences of the in-chat search term inside message text.
const Highlighted = ({ text, term }) => {
  if (!term) return text;
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const parts = [];
  let i = 0;
  let idx = lower.indexOf(needle);
  while (idx !== -1) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={idx} className="bg-amber/80 text-bg rounded px-0.5">
        {text.slice(idx, idx + needle.length)}
      </mark>
    );
    i = idx + needle.length;
    idx = lower.indexOf(needle, i);
  }
  parts.push(text.slice(i));
  return parts;
};

const URL_SPLIT = /(https?:\/\/[^\s<>"')]+)/gi;
const Linkified = ({ text, term, isOwn }) =>
  text.split(URL_SPLIT).map((part, i) =>
    /^https?:\/\//i.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        className={`underline break-all ${isOwn ? "text-bg" : "text-ember"}`}
      >
        <Highlighted text={part} term={term} />
      </a>
    ) : (
      <Highlighted key={i} text={part} term={term} />
    )
  );

const VoicePlayer = ({ src, duration, isOwn }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration || 0);
  const [failed, setFailed] = useState(false);

  const toggle = (e) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      // Only one voice message plays at a time.
      document.querySelectorAll("audio[data-voice]").forEach((a) => a !== el && a.pause());
      el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  };

  const seek = (e) => {
    e.stopPropagation();
    const el = audioRef.current;
    const d = (isFinite(el?.duration) && el.duration) || total;
    if (!el || !d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * d;
  };

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-80 mb-1">
        <ImageOff size={14} /> Couldn't play this voice message.
        <button className="underline" onClick={(e) => { e.stopPropagation(); setFailed(false); audioRef.current?.load(); }}>Retry</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 w-[210px] max-w-full sm:w-[240px] mb-1">
      <audio
        ref={audioRef}
        src={src}
        data-voice
        preload="metadata"
        onLoadedMetadata={(e) => {
          if (isFinite(e.target.duration) && e.target.duration > 0) setTotal(e.target.duration);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const d = (isFinite(e.target.duration) && e.target.duration) || total || 1;
          setCurrent(e.target.currentTime);
          setProgress(e.target.currentTime / d);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrent(0);
        }}
        onError={() => setFailed(true)}
      />
      <button
        onClick={toggle}
        className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full ${isOwn ? "bg-black/15" : "bg-black/20"}`}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div
        className="flex-1 h-5 flex items-center cursor-pointer"
        onClick={seek}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label="Voice message progress"
      >
        <div className="w-full h-1.5 rounded-full bg-black/20 overflow-hidden">
          <div className={`h-full ${isOwn ? "bg-bg/80" : "bg-ember"}`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>
      <span className="text-[10px] opacity-75 flex-shrink-0 tabular-nums w-9 text-right">
        {fmtDuration(playing || current > 0 ? current : total)}
      </span>
    </div>
  );
};

const FileCard = ({ attachment, isOwn }) => {
  const Icon = fileIconFor(attachment.mimeType);
  const href = mediaUrl(attachment.url);
  const canOpenInline = /^(application\/pdf|text\/plain|image\/|video\/|audio\/)/.test(attachment.mimeType || "");
  const meta = [fileTypeLabel(attachment.mimeType, attachment.name), formatSize(attachment.size)].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-2.5 bg-black/20 rounded-lg px-3 py-2 mb-1 w-[240px] max-w-full sm:w-[280px]">
      <Icon size={22} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate" title={attachment.name}>{attachment.name || "File"}</div>
        <div className="text-xs opacity-70 truncate">{meta}</div>
      </div>
      {canOpenInline && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${attachment.name}`}
          title="Open"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/20 flex-shrink-0"
        >
          <LinkIcon size={15} />
        </a>
      )}
      <a
        href={downloadUrl(attachment.url, attachment.name)}
        download={attachment.name}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Download ${attachment.name}`}
        title="Download"
        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/20 flex-shrink-0"
      >
        <Download size={16} />
      </a>
    </div>
  );
};

const CallRecord = ({ message, isOwn }) => {
  const c = message.call || {};
  const video = c.mode === "video";
  const label = video ? "Video call" : "Voice call";
  let Icon = video ? Video : Phone;
  let title = label;
  let sub = c.duration ? fmtDuration(c.duration) : "";
  let danger = false;
  if (c.status === "missed" || c.status === "canceled") {
    Icon = PhoneMissed;
    danger = !isOwn;
    title = isOwn ? `${label} · No answer` : `Missed ${label.toLowerCase()}`;
    if (c.status === "canceled" && isOwn) title = `${label} · Canceled`;
  } else if (c.status === "declined") {
    Icon = PhoneOff;
    title = isOwn ? `${label} · Declined` : `Declined ${label.toLowerCase()}`;
  } else if (c.status === "busy") {
    Icon = PhoneOff;
    title = `${label} · Busy`;
  } else if (c.status === "failed") {
    Icon = PhoneOff;
    title = `${label} · Failed`;
    danger = true;
  }
  return (
    <div className="flex items-center gap-3 min-w-[170px]">
      <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? "bg-red-500/15 text-red-400" : isOwn ? "bg-black/15" : "bg-white/5"}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${danger ? "text-red-400" : ""}`}>{title}</p>
        {sub && <p className="text-xs opacity-70">{sub}</p>}
      </div>
    </div>
  );
};

const SharedMoment = ({ shared, isOwn, onOpen }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onOpen?.(shared.refId); }}
    className="block w-[230px] max-w-full text-left rounded-xl overflow-hidden bg-black/20 hover:bg-black/30 transition-colors mb-1"
    aria-label={`Open Moment ${shared.title}`}
  >
    <div className="h-24 bg-gradient-to-br from-ember/30 via-lavender/20 to-transparent relative">
      {shared.cover ? (
        <img src={mediaUrl(shared.cover)} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center"><Sparkles size={24} className="opacity-70" /></div>
      )}
    </div>
    <div className="px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide opacity-70 flex items-center gap-1"><Sparkles size={10} /> Moment</p>
      <p className="text-sm font-medium truncate">{shared.title}</p>
      <p className="text-xs opacity-70 truncate">{shared.counts}</p>
    </div>
  </button>
);

const StatusReplyCard = ({ reply }) => (
  <div className="flex items-stretch gap-2 mb-1.5 rounded-lg bg-black/20 overflow-hidden w-[220px] max-w-full">
    <div className="w-1 bg-lavender flex-shrink-0" />
    <div className="flex-1 min-w-0 py-1.5">
      <p className="text-[10px] uppercase tracking-wide opacity-70 flex items-center gap-1"><CircleDashed size={10} /> Status</p>
      <p className="text-xs truncate opacity-90">{reply.text || (reply.type === "video" ? "Video" : reply.type === "image" ? "Photo" : "Status")}</p>
    </div>
    {reply.mediaUrl ? (
      <img src={mediaUrl(reply.mediaUrl)} alt="" className="w-11 h-11 object-cover flex-shrink-0" />
    ) : reply.type === "text" ? (
      <div className="w-11 h-11 flex-shrink-0" style={{ background: reply.bgColor || "#FF6B4A" }} />
    ) : null}
  </div>
);

const MessageBubble = ({
  message,
  isOwn,
  isGroup,
  currentUserId,
  memberCount,
  onReply,
  onDeleteForMe,
  onDeleteForEveryone,
  onReact,
  onEdit,
  onPin,
  onUnpin,
  onShowInfo,
  onJumpToMessage,
  showSender,
  highlighted,
  highlightTerm = "",
  isMatch = false,
  isCurrentMatch = false,
  onOpenMoment,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text || "");
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  // Fixed-position coords for the "..." actions menu, computed in the
  // layout effect below. null until measured, so the menu renders once
  // off-screen (invisible) to get its real size before being placed —
  // see the root-cause note on that effect.
  const [menuPos, setMenuPos] = useState(null);

  const bubbleRef = useRef(null);
  const triggerRef = useRef(null);
  const actionsRef = useRef(null);

  useEffect(() => {
    if (highlighted && bubbleRef.current) {
      bubbleRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  // Root cause of the actions menu ("...", React/Reply/Edit/Pin/Info/
  // Delete) overflowing or getting cut off on phones: it used to be
  // `position: absolute`, anchored to the message bubble's own left/right
  // edge. For a short message sitting near the edge of a narrow screen,
  // the pill of ~6-7 icon buttons simply didn't fit in the remaining
  // horizontal space, and the chat scroll container's overflow-x-hidden
  // (needed elsewhere to stop the page itself from scrolling sideways)
  // then silently clipped whatever spilled past the viewport edge.
  //
  // Fix: render it `position: fixed` instead, measure its own size once
  // it mounts, and clamp its left/top so it's always fully on-screen —
  // with an 8px margin — regardless of where the message bubble sits or
  // how small the screen is. This touches positioning only; the pill's
  // existing visual design (colors, icon buttons, spacing) is unchanged.
  useLayoutEffect(() => {
    if (!showActions) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      const menu = actionsRef.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const margin = 8;

      let left = isOwn ? triggerRect.right - menuRect.width : triggerRect.left;
      left = Math.min(Math.max(left, margin), window.innerWidth - menuRect.width - margin);

      let top = triggerRect.top - menuRect.height - margin;
      if (top < margin) top = Math.min(triggerRect.bottom + margin, window.innerHeight - menuRect.height - margin);

      setMenuPos({ top, left });
    };

    // First paint: the menu is in the DOM (see the `visibility` style
    // below) but not yet positioned, so its real width/height can be
    // measured. Then place it for real.
    place();

    // Close rather than leave a stale position behind if the page
    // scrolls or resizes while the menu is open. Scroll events don't
    // bubble, so a capturing window listener is what catches scrolling
    // on the chat's own scroll container (or any ancestor), not just
    // the window itself.
    const close = () => setShowActions(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showActions, isOwn]);

  if (message.deletedForEveryone || message.deleted) {
    return (
      <div
        id={`message-${message._id}`}
        className={`flex ${isOwn ? "justify-end" : "justify-start"} px-3 sm:px-4`}
      >
        <div className="italic text-muted text-sm px-4 py-2">
          {isOwn ? "You deleted this message." : "This message was deleted."}
        </div>
      </div>
    );
  }

  const FileIcon = fileIconFor(message.attachment?.mimeType);

  // Ticks: single grey (sent) -> double grey (delivered) -> double
  // colored (seen). Group chats only show "seen" once every other
  // member has read it; otherwise stay at delivered.
  const othersCount = Math.max(0, (memberCount || 2) - 1);
  const deliveredCount = (message.deliveredTo || []).filter((u) => (u.id || u._id || u) !== currentUserId).length;
  const seenCount = (message.readBy || []).filter((u) => (u.id || u._id || u) !== currentUserId).length;
  const isDelivered = deliveredCount > 0;
  const isSeen = isGroup ? seenCount >= othersCount && othersCount > 0 : seenCount > 0;

  const commitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.text) onEdit?.(message, trimmed);
    setIsEditing(false);
  };

  return (
    <motion.div
      layout
      id={`message-${message._id}`}
      ref={bubbleRef}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        backgroundColor: highlighted ? "rgba(255,184,107,0.12)" : "rgba(0,0,0,0)",
      }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className={`flex ${isOwn ? "justify-end" : "justify-start"} px-3 sm:px-4 py-1 group rounded-xl`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowReactions(false);
      }}
    >
      <div
        className={`flex items-end gap-2 min-w-0 max-w-[88%] sm:max-w-[75%] lg:max-w-[65%] ${
          isOwn ? "flex-row-reverse" : ""
        }`}
      >
        {!isOwn && showSender && <Avatar name={message.sender?.name} size={28} />}

        <div ref={triggerRef} className="relative min-w-0" onClick={() => setShowActions((s) => !s)}>
          {!isOwn && isGroup && showSender && (
            <p className="text-xs text-ember/80 font-medium px-1 mb-0.5">{message.sender?.name}</p>
          )}

          {message.pinned && (
            <div className={`flex items-center gap-1 text-[10px] text-amber mb-0.5 ${isOwn ? "justify-end" : ""}`}>
              <Pin size={10} /> Pinned
            </div>
          )}

          {message.replyTo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToMessage?.(message.replyTo._id || message.replyTo);
              }}
              className="block w-full text-left text-xs text-muted border-l-2 border-ember/50 pl-2 mb-1 opacity-80 truncate hover:opacity-100"
            >
              <span className="font-medium">{message.replyTo.sender?.name || "Message"}: </span>
              {message.replyTo.deletedForEveryone
                ? "This message was deleted."
                : message.replyTo.text || "Attachment"}
            </button>
          )}

          <div
            className={`rounded-2xl px-3.5 py-2 sm:px-4 min-w-0 break-words ${
              isOwn ? "bg-ember text-bg rounded-br-sm" : "bg-chat border border-white/5 text-ink rounded-bl-sm"
            } ${isCurrentMatch ? "ring-2 ring-amber" : isMatch ? "ring-1 ring-amber/50" : ""}`}
          >
            {message.type === "image" && message.attachment?.url && (
              imgError ? (
                <button
                  type="button"
                  onClick={() => {
                    setImgError(false);
                    setImgLoaded(false);
                  }}
                  className={`w-full max-w-[240px] sm:max-w-xs flex flex-col items-center justify-center gap-1.5 rounded-lg mb-1 py-6 text-center ${
                    isOwn ? "bg-black/15" : "bg-black/20"
                  }`}
                >
                  <ImageOff size={22} className="opacity-70" />
                  <span className="text-xs opacity-80">Image failed to load — tap to retry</span>
                </button>
              ) : (
                <div className="relative w-full max-w-[240px] sm:max-w-xs mb-1">
                  {!imgLoaded && (
                    <div className="absolute inset-0 rounded-lg bg-black/10 animate-pulse" style={{ aspectRatio: "4 / 3" }} />
                  )}
                  <motion.img
                    src={mediaUrl(message.attachment.url)}
                    alt={message.attachment.name || "Shared image"}
                    onLoad={() => setImgLoaded(true)}
                    onError={() => setImgError(true)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxSrc(mediaUrl(message.attachment.url));
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: imgLoaded ? 1 : 0 }}
                    transition={{ duration: 0.35 }}
                    className="w-full h-auto rounded-lg cursor-zoom-in object-cover"
                    loading="lazy"
                  />
                </div>
              )
            )}

            {message.type === "call" && <CallRecord message={message} isOwn={isOwn} />}

            {message.statusReply?.statusId && <StatusReplyCard reply={message.statusReply} />}

            {message.shared?.kind === "moment" && <SharedMoment shared={message.shared} isOwn={isOwn} onOpen={onOpenMoment} />}

            {message.type === "voice" && message.attachment?.url && (
              <VoicePlayer src={mediaUrl(message.attachment.url)} duration={message.attachment.duration} isOwn={isOwn} />
            )}

            {message.type === "video" && message.attachment?.url && (
              <video
                src={mediaUrl(message.attachment.url)}
                controls
                playsInline
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
                className="w-[240px] max-w-full sm:w-[300px] max-h-[320px] rounded-lg mb-1 bg-black"
              />
            )}

            {message.type === "audio" && message.attachment?.url && (
              <div className="mb-1 w-[240px] max-w-full sm:w-[280px]" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs truncate opacity-80 mb-1" title={message.attachment.name}>{message.attachment.name}</p>
                <audio src={mediaUrl(message.attachment.url)} controls preload="metadata" className="w-full h-9" />
              </div>
            )}

            {message.type === "file" && message.attachment?.url && (
              <FileCard attachment={message.attachment} isOwn={isOwn} />
            )}

            {isEditing ? (
              <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1.5">
                <textarea
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      commitEdit();
                    }
                    if (e.key === "Escape") setIsEditing(false);
                  }}
                  rows={2}
                  className="bg-black/15 rounded-lg px-2 py-1 outline-none resize-none text-sm w-56 sm:w-64"
                />
                <div className="flex gap-2 text-xs">
                  <button onClick={commitEdit} className="underline">Save</button>
                  <button onClick={() => setIsEditing(false)} className="underline opacity-70">Cancel</button>
                </div>
              </div>
            ) : (
              message.text && message.type !== "call" && !(message.shared?.kind === "moment") && (
                <p className="whitespace-pre-wrap break-words">
                  <Linkified text={message.text} term={highlightTerm} isOwn={isOwn} />
                </p>
              )
            )}

            <div
              className={`flex items-center gap-1 mt-1 text-[10px] ${
                isOwn ? "text-bg/70 justify-end" : "text-muted"
              }`}
            >
              {message.edited && <span className="italic">edited</span>}
              <span>{formatTime(message.createdAt)}</span>
              {isOwn && (isSeen ? <CheckCheck size={12} className="text-blue-200" /> : isDelivered ? <CheckCheck size={12} /> : <Check size={12} />)}
            </div>
          </div>

          {message.reactions?.length > 0 && (
            <div className="flex gap-1 mt-1">
              {message.reactions.map((r, i) => (
                <motion.span
                  key={i}
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                  className="text-xs bg-chat border border-white/10 rounded-full px-1.5 py-0.5"
                >
                  {r.emoji}
                </motion.span>
              ))}
            </div>
          )}

          {showActions && (
            <motion.div
              ref={actionsRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: menuPos?.top ?? 0,
                left: menuPos?.left ?? 0,
                visibility: menuPos ? "visible" : "hidden",
              }}
              className="flex items-center gap-1 bg-sidebar border border-white/10 rounded-full px-1.5 py-1 shadow-lg z-50 max-w-[calc(100vw-1rem)] flex-wrap"
            >
              <button
                onClick={() => setShowReactions((s) => !s)}
                className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-ember transition"
                title="React"
                aria-label="React"
              >
                <Smile size={14} />
              </button>
              <button
                onClick={() => onReply?.(message)}
                className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-ember transition"
                title="Reply"
                aria-label="Reply"
              >
                <Reply size={14} />
              </button>
              {message.text && message.type !== "call" && (
                <button
                  onClick={() => navigator.clipboard?.writeText(message.text || "")}
                  className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-ember transition"
                  title="Copy"
                  aria-label="Copy text"
                >
                  <Copy size={14} />
                </button>
              )}
              {isOwn && message.type === "text" && !message.shared && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-ember transition"
                  title="Edit"
                  aria-label="Edit message"
                >
                  <Pencil size={14} />
                </button>
              )}
              <button
                onClick={() => (message.pinned ? onUnpin?.(message) : onPin?.(message))}
                className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-amber transition"
                title={message.pinned ? "Unpin" : "Pin"}
                aria-label={message.pinned ? "Unpin message" : "Pin message"}
              >
                {message.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              {isOwn && (
                <button
                  onClick={() => onShowInfo?.(message)}
                  className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-ember transition"
                  title="Message info"
                  aria-label="Message info"
                >
                  <Info size={14} />
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowDeleteMenu((s) => !s)}
                  className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-red-400 transition"
                  title="Delete"
                  aria-label="Delete message"
                >
                  <Trash2 size={14} />
                </button>
                {showDeleteMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`absolute top-8 ${isOwn ? "right-0" : "left-0"} bg-sidebar border border-white/10 rounded-xl shadow-lg py-1 text-xs whitespace-nowrap z-20`}
                  >
                    <button
                      onClick={() => {
                        onDeleteForMe?.(message);
                        setShowDeleteMenu(false);
                      }}
                      className="block w-full text-left px-3 py-1.5 hover:bg-white/5"
                    >
                      Delete for me
                    </button>
                    {isOwn && (
                      <button
                        onClick={() => {
                          if (window.confirm("Delete this message for everyone?")) {
                            onDeleteForEveryone?.(message);
                          }
                          setShowDeleteMenu(false);
                        }}
                        className="block w-full text-left px-3 py-1.5 hover:bg-white/5 text-red-400"
                      >
                        Delete for everyone
                      </button>
                    )}
                  </motion.div>
                )}
              </div>

              {showReactions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`absolute -top-10 ${isOwn ? "right-0" : "left-0"} flex gap-1 bg-sidebar border border-white/10 rounded-full px-2 py-1 max-w-[calc(100vw-1rem)]`}
                >
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onReact?.(message, emoji);
                        setShowReactions(false);
                      }}
                      className="hover:scale-125 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <ImageLightbox src={lightboxSrc} alt={message.attachment?.name} onClose={() => setLightboxSrc(null)} />
    </motion.div>
  );
};

export default MessageBubble;
