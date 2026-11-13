import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCheck,
  Reply,
  Trash2,
  Copy,
  Smile,
  MoreHorizontal,
  ChevronLeft,
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

const formatTime = (date) => {
  const parsed = date ? new Date(date) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getId = (value) => {
  if (value == null) return "";
  if (typeof value === "object") return String(value._id || value.id || value);
  return String(value);
};

const formatSize = (bytes = 0) => fmtBytes(bytes);

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

// ---------------------------------------------------------------------
// Reaction + actions popover
// ---------------------------------------------------------------------

const useIsTouch = () => {
  const query = "(hover: none)";
  const [touch, setTouch] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setTouch(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return touch;
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back for plain http.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
};

// A fixed-position popover that follows its anchor while the chat scrolls
// and always stays inside the visible message area (never under the header
// or the composer, never off-screen on a 320px phone).
const MenuPopover = ({ anchorRef, isOwn, onClose, label, contentKey, children }) => {
  const popRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const a = anchor.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const scroller = anchor.closest(".chat-scroll");
    const bounds = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    // The message scrolled completely out of view: nothing left to point at.
    if (a.bottom < bounds.top || a.top > bounds.bottom) {
      closeRef.current();
      return;
    }
    const margin = 8;
    const minTop = Math.max(bounds.top, 0) + margin;
    const maxBottom = Math.min(bounds.bottom, window.innerHeight) - margin;

    let left = isOwn ? a.right - p.width : a.left;
    left = Math.min(Math.max(left, margin), window.innerWidth - p.width - margin);

    let top = a.top - p.height - 6; // prefer above the message
    if (top < minTop) top = a.bottom + 6; // otherwise below it
    if (top + p.height > maxBottom) top = Math.max(minTop, maxBottom - p.height);

    setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [anchorRef, isOwn]);

  // Measure first (hidden), then place. Re-place when the content changes size.
  useLayoutEffect(() => {
    place();
  }, [place, contentKey]);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("keydown", onKey);
    };
  }, [place]);

  // Move keyboard focus into the popover once it is placed.
  useEffect(() => {
    if (pos) popRef.current?.querySelector("button")?.focus({ preventScroll: true });
    // Only on first placement of each view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos === null, contentKey]);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        aria-hidden="true"
      />
      <motion.div
        ref={popRef}
        role="menu"
        aria-label={label}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.12 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          visibility: pos ? "visible" : "hidden",
        }}
        className="z-50 w-max max-w-[calc(100vw-1rem)] rounded-2xl bg-sidebar border border-white/10 shadow-2xl overflow-hidden"
      >
        {children}
      </motion.div>
    </>
  );
};

const MenuItem = ({ icon: Icon, children, onClick, danger = false }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`flex w-full items-center gap-3 px-4 min-h-[44px] sm:min-h-[38px] text-sm text-left outline-none transition-colors hover:bg-white/5 focus-visible:bg-white/10 ${
      danger ? "text-red-400" : "text-ink"
    }`}
  >
    <Icon size={16} className={danger ? "" : "text-muted"} />
    <span>{children}</span>
  </button>
);

const ReactionPill = ({ reaction, names, onToggle }) => {
  const who = names.length ? names.join(", ") : "";
  return (
    <motion.button
      type="button"
      layout="position"
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 520, damping: 22 }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(reaction.emoji);
      }}
      aria-pressed={reaction.mine}
      aria-label={`${reaction.emoji} ${reaction.count} ${reaction.count === 1 ? "reaction" : "reactions"}${
        who ? ` from ${who}` : ""
      }. ${reaction.mine ? "Press to remove yours" : "Press to add yours"}`}
      title={`${who ? `${who} · ` : ""}${reaction.mine ? "Click to remove your reaction" : "Click to react too"}`}
      className={`inline-flex items-center justify-center gap-1 h-7 min-w-[2rem] px-2 rounded-full border text-[13px] leading-none shadow-sm transition-colors ${
        reaction.mine
          ? "bg-ember/20 border-ember/60 text-ink"
          : "bg-sidebar border-white/10 text-ink hover:border-white/30"
      }`}
    >
      <span className="text-[15px] leading-none">{reaction.emoji}</span>
      {reaction.count > 1 && (
        <motion.span
          key={reaction.count}
          initial={{ y: -6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="tabular-nums text-xs opacity-80"
        >
          {reaction.count}
        </motion.span>
      )}
    </motion.button>
  );
};

const MessageBubble = ({
  message,
  isOwn,
  isGroup,
  currentUserId,
  memberCount,
  memberNames,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState("main"); // "main" | "delete"
  const [copied, setCopied] = useState(false);
  const [heartBurst, setHeartBurst] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text || "");

  const isTouch = useIsTouch();
  const rowRef = useRef(null);
  const anchorRef = useRef(null);
  const moreBtnRef = useRef(null);
  const copyTimer = useRef(null);
  // Only messages that arrive live get the entrance animation; history that
  // is loaded or prepended while scrolling should not all animate at once.
  const isFresh = useRef(Date.now() - new Date(message.createdAt || 0).getTime() < 4000);

  useEffect(() => {
    if (!isEditing) setEditText(message.text || "");
  }, [message.text, isEditing]);

  useEffect(() => {
    if (highlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    setMenuView("main");
    setCopied(false);
    if (restoreFocus) moreBtnRef.current?.focus({ preventScroll: true });
  }, []);

  const openMenu = useCallback(() => {
    setMenuView("main");
    setCopied(false);
    setMenuOpen(true);
  }, []);

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

  // Ticks: single grey (sent) -> double grey (delivered) -> double
  // colored (seen). Group chats only show "seen" once every other
  // member has read it; otherwise stay at delivered.
  const othersCount = Math.max(0, (memberCount || 2) - 1);
  const normalizedCurrentUserId = getId(currentUserId);
  const deliveredCount = (message.deliveredTo || []).filter(
    (user) => getId(user) !== normalizedCurrentUserId
  ).length;
  const seenCount = (message.readBy || []).filter(
    (user) => getId(user) !== normalizedCurrentUserId
  ).length;
  const isDelivered = deliveredCount > 0;
  const isSeen = isGroup ? seenCount >= othersCount && othersCount > 0 : seenCount > 0;

  // The API stores one reaction per user. Group them for a compact strip,
  // remember who reacted (for tooltips) and which one is mine.
  const nameFor = (reaction) => {
    const id = getId(reaction.user);
    if (normalizedCurrentUserId && id === normalizedCurrentUserId) return "You";
    return memberNames?.[id] || reaction.user?.name || "Someone";
  };
  const reactionSummary = [];
  (message.reactions || []).forEach((reaction) => {
    if (!reaction?.emoji) return;
    let entry = reactionSummary.find((item) => item.emoji === reaction.emoji);
    if (!entry) {
      entry = { emoji: reaction.emoji, count: 0, mine: false, names: [] };
      reactionSummary.push(entry);
    }
    entry.count += 1;
    const name = nameFor(reaction);
    if (name === "You") {
      entry.mine = true;
      entry.names.unshift(name);
    } else {
      entry.names.push(name);
    }
  });
  const myReaction = reactionSummary.find((item) => item.mine)?.emoji || null;

  const commitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.text) onEdit?.(message, trimmed);
    setIsEditing(false);
  };

  const react = (emoji) => {
    onReact?.(message, emoji);
  };

  const pickReaction = (emoji) => {
    react(emoji);
    closeMenu(true);
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(message.text || "");
    setCopied(ok);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => closeMenu(true), ok ? 700 : 0);
  };

  const interactiveTarget = (target) =>
    !!target?.closest?.("a, button, video, audio, textarea, input");

  // Desktop: double-click sends a quick heart. Right-click opens the menu
  // (unless the person is selecting text or right-clicking a link).
  const handleDoubleClick = (e) => {
    if (isTouch || interactiveTarget(e.target) || isEditing) return;
    window.getSelection?.()?.removeAllRanges();
    if (myReaction !== "❤️") react("❤️");
    setHeartBurst((n) => n + 1);
  };

  const handleContextMenu = (e) => {
    if (isEditing || interactiveTarget(e.target)) return;
    if (window.getSelection?.()?.toString()) return;
    e.preventDefault();
    openMenu();
  };

  const handleBubbleClick = (e) => {
    // Touch screens have no hover, so a tap opens the reactions + actions.
    if (!isTouch || isEditing || interactiveTarget(e.target)) return;
    openMenu();
  };

  const handleBubbleKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      openMenu();
    }
  };

  const canCopy = Boolean(message.text) && message.type !== "call";
  const canEdit = isOwn && message.type === "text" && !message.shared;

  return (
    <div
      id={`message-${message._id}`}
      ref={rowRef}
      className={`flex ${isOwn ? "justify-end" : "justify-start"} px-3 sm:px-4 py-1 group rounded-xl transition-colors duration-700 ${
        highlighted ? "bg-amber/10" : "bg-transparent"
      }`}
    >
      <motion.div
        initial={isFresh.current ? { opacity: 0, y: 10, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className={`flex items-end gap-2 min-w-0 max-w-[88%] sm:max-w-[75%] lg:max-w-[65%] ${
          isOwn ? "flex-row-reverse" : ""
        }`}
      >
        {!isOwn && showSender && <Avatar name={message.sender?.name} size={28} />}

        <div className="relative min-w-0">
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

          {/* Bubble + its hover toolbar. This wrapper is the popover's anchor. */}
          <div ref={anchorRef} className="relative">
            <div
              tabIndex={0}
              onClick={handleBubbleClick}
              onDoubleClick={handleDoubleClick}
              onContextMenu={handleContextMenu}
              onKeyDown={handleBubbleKeyDown}
              aria-label={`${isOwn ? "Your" : `${message.sender?.name || "Their"}`} message. Press Enter for reactions and actions.`}
              style={isTouch ? { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } : undefined}
              className={`relative rounded-2xl px-3.5 py-2 sm:px-4 min-w-0 break-words outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember/70 ${
                isOwn ? "bg-ember text-bg rounded-br-sm" : "bg-chat border border-white/5 text-ink rounded-bl-sm"
              } ${isCurrentMatch ? "ring-2 ring-amber" : isMatch ? "ring-1 ring-amber/50" : ""}`}
            >
              {message.type === "image" && message.attachment?.url && (
                imgError ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImgError(false);
                      setImgLoaded(false);
                      setImageRetry((attempt) => attempt + 1);
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
                      key={`${message._id || "image"}-${imageRetry}`}
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
                    onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        commitEdit();
                      }
                      if (e.key === "Escape") setIsEditing(false);
                    }}
                    rows={2}
                    aria-label="Edit message"
                    className="bg-black/15 rounded-lg px-2 py-1 outline-none resize-none text-base sm:text-sm w-56 sm:w-64 max-w-full"
                  />
                  <div className="flex gap-1 text-xs">
                    <button onClick={commitEdit} className="px-2.5 min-h-[32px] rounded-full bg-black/20 font-medium hover:bg-black/30">Save</button>
                    <button onClick={() => setIsEditing(false)} className="px-2.5 min-h-[32px] rounded-full opacity-80 hover:bg-black/10">Cancel</button>
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
                {isOwn && (isSeen ? <CheckCheck size={12} className="text-blue-200" aria-label="Seen" /> : isDelivered ? <CheckCheck size={12} aria-label="Delivered" /> : <Check size={12} aria-label="Sent" />)}
              </div>

              {/* Double-click heart burst */}
              <AnimatePresence>
                {heartBurst > 0 && (
                  <motion.span
                    key={heartBurst}
                    initial={{ scale: 0.3, opacity: 0.95 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    onAnimationComplete={() => setHeartBurst(0)}
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-3xl"
                    aria-hidden="true"
                  >
                    ❤️
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Hover toolbar (devices with a pointer). Stays reachable by keyboard. */}
            {!isTouch && !isEditing && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 ${isOwn ? "right-full mr-1.5" : "left-full ml-1.5"} flex items-center gap-0.5 rounded-full bg-sidebar/95 border border-white/10 p-0.5 shadow-lg transition-opacity duration-150 ${
                  menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                }`}
              >
                <button
                  type="button"
                  onClick={openMenu}
                  title="React"
                  aria-label="React to message"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-muted hover:text-amber hover:bg-white/10 transition-colors"
                >
                  <Smile size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onReply?.(message)}
                  title="Reply"
                  aria-label="Reply"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-muted hover:text-ember hover:bg-white/10 transition-colors"
                >
                  <Reply size={16} />
                </button>
                <button
                  ref={moreBtnRef}
                  type="button"
                  onClick={openMenu}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  title="More"
                  aria-label="More actions"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-white/10 transition-colors"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            )}
          </div>

          {reactionSummary.length > 0 && (
            <div
              className={`relative z-[1] -mt-1.5 mb-1 flex flex-wrap gap-1 px-2 ${isOwn ? "justify-end" : "justify-start"}`}
              role="group"
              aria-label="Reactions"
            >
              <AnimatePresence initial={false}>
                {reactionSummary.map((reaction) => (
                  <ReactionPill key={reaction.emoji} reaction={reaction} names={reaction.names} onToggle={react} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>

      {menuOpen && (
        <MenuPopover
          anchorRef={anchorRef}
          isOwn={isOwn}
          onClose={() => closeMenu(true)}
          label="Message actions"
          contentKey={menuView}
        >
          {menuView === "main" ? (
            <>
              <div className="flex items-center gap-0.5 px-2 py-2" role="group" aria-label="Quick reactions">
                {REACTIONS.map((emoji) => (
                  <motion.button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    whileHover={{ scale: 1.25 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    onClick={() => pickReaction(emoji)}
                    aria-label={myReaction === emoji ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                    aria-pressed={myReaction === emoji}
                    className={`w-10 h-10 sm:w-9 sm:h-9 rounded-full text-[22px] leading-none flex items-center justify-center outline-none focus-visible:bg-white/15 ${
                      myReaction === emoji ? "bg-ember/25 ring-1 ring-ember/60" : "hover:bg-white/10"
                    }`}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
              <div className="border-t border-white/10 py-1">
                <MenuItem icon={Reply} onClick={() => { onReply?.(message); closeMenu(); }}>Reply</MenuItem>
                {canCopy && (
                  <MenuItem icon={Copy} onClick={handleCopy}>{copied ? "Copied" : "Copy text"}</MenuItem>
                )}
                {canEdit && (
                  <MenuItem icon={Pencil} onClick={() => { setIsEditing(true); closeMenu(); }}>Edit</MenuItem>
                )}
                <MenuItem
                  icon={message.pinned ? PinOff : Pin}
                  onClick={() => { (message.pinned ? onUnpin : onPin)?.(message); closeMenu(); }}
                >
                  {message.pinned ? "Unpin" : "Pin"}
                </MenuItem>
                {isOwn && (
                  <MenuItem icon={Info} onClick={() => { onShowInfo?.(message); closeMenu(); }}>Message info</MenuItem>
                )}
                <MenuItem icon={Trash2} danger onClick={() => setMenuView("delete")}>Delete…</MenuItem>
              </div>
            </>
          ) : (
            <div className="py-1 min-w-[220px]">
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenuView("main")}
                className="flex w-full items-center gap-2 px-3 min-h-[40px] text-xs text-muted text-left outline-none hover:bg-white/5 focus-visible:bg-white/10"
              >
                <ChevronLeft size={14} /> Delete this message?
              </button>
              <div className="border-t border-white/10 mt-1 pt-1">
                <MenuItem icon={Trash2} onClick={() => { onDeleteForMe?.(message); closeMenu(); }}>Delete for me</MenuItem>
                {isOwn && (
                  <MenuItem icon={Trash2} danger onClick={() => { onDeleteForEveryone?.(message); closeMenu(); }}>
                    Delete for everyone
                  </MenuItem>
                )}
              </div>
            </div>
          )}
        </MenuPopover>
      )}

      <ImageLightbox src={lightboxSrc} alt={message.attachment?.name} onClose={() => setLightboxSrc(null)} />
    </div>
  );
};

export default MessageBubble;
