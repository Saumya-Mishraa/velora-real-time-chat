import React, { useRef, useState, useEffect, useCallback, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Send, Smile, X, AlertCircle, Mic, Square, Trash2, Pause, Play, FileText, Film, Music, Eye } from "lucide-react";
import api from "../services/api.js";
import { useTheme } from "../context/ThemeContext.jsx";
import GifPicker from "./GifPicker.jsx";
import Avatar from "./Avatar.jsx";
import { extractMentionIds, getMentionQuery, memberId } from "../utils/mentions.js";
import { useDraft } from "../hooks/useDrafts.js";
import { uploadFile, fmtBytes, fmtDuration, fileKind, errorMessage } from "../utils/media.js";
import AttachMenu from "./AttachMenu.jsx";
import PollComposer from "./PollComposer.jsx";
import LiveLocationDialog from "./LiveLocationDialog.jsx";
import useKeyboardViewport from "../hooks/useKeyboardViewport.js";
import { useLiveLocation } from "../context/LiveLocationContext.jsx";
import { useWatchTogether } from "../context/WatchTogetherContext.jsx";

// Code-split: emoji-picker-react (with its full emoji dataset) is one of
// the heaviest optional dependencies in the app. Loading it lazily keeps
// it out of the initial bundle for every session that never opens the
// picker (section 47 — avoid unnecessary load for a feature not used
// yet), at the cost of a short delay the first time it's opened.
const EmojiPicker = lazy(() => import("emoji-picker-react"));

// Same mobile/desktop boundary already used elsewhere in the app (e.g.
// Dashboard.jsx's pane-switching) - 640px, Tailwind's default `sm`. Below it
// Enter inserts a newline (the send button sends) and opening the emoji
// picker dismisses the keyboard. The emoji button itself is available at
// every width: on phones its picker is sized to the screen (see the
// pickerWidth/pickerHeight measuring effect) so it can't overflow.
const useIsMobileDevice = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && !window.matchMedia("(min-width: 640px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => setIsMobile(!mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
};

// Recording formats in order of preference. Safari only does mp4/aac,
// Chrome/Firefox/Edge do webm/opus (Firefox also ogg).
const RECORDER_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const pickRecorderMime = () =>
  typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported
    ? ""
    : RECORDER_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";

const MAX_RECORD_SECONDS = 15 * 60;
const MIN_RECORD_SECONDS = 1;

// Small play/pause + progress bar used to review a recording before it's sent.
const RecordingPreview = ({ url, duration }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        // MediaRecorder blobs report Infinity duration, so progress is
        // computed against the duration we measured while recording.
        onTimeUpdate={(e) => setProgress(Math.min(1, e.currentTarget.currentTime / Math.max(duration, 0.1)))}
        className="hidden"
      />
      <button
        onClick={toggle}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="w-10 h-10 rounded-full bg-ember/15 text-ember flex items-center justify-center flex-shrink-0"
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-ember transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <span className="text-xs text-muted tabular-nums flex-shrink-0">{fmtDuration(duration)}</span>
    </div>
  );
};

const StagedIcon = ({ kind }) => {
  const Icon = kind === "video" ? Film : kind === "audio" ? Music : FileText;
  return <Icon size={22} className="text-muted" />;
};

const MessageInput = ({ conversationId, onSend, onTyping, replyTo, onCancelReply, disabled, disabledReason, isGroup = false, members = [], currentUserId }) => {
  const { isLight } = useTheme();
  // The draft lives in a per-user, per-conversation store (localStorage),
  // not component state: it survives navigating away, refreshing and
  // closing the tab, and the chat list reads the same store for its
  // "Draft:" preview.
  const [text, setDraftText, clearDraft] = useDraft(conversationId);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(-1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [sendPulse, setSendPulse] = useState(false);
  const [pickerWidth, setPickerWidth] = useState(320);
  const [pickerHeight, setPickerHeight] = useState(380);
  const [maxMb, setMaxMb] = useState(50);

  // Files chosen but not yet sent (any type). Images/videos get a
  // thumbnail from a temporary object URL — preview only; what's sent is
  // always the uploaded file's permanent path, never a blob: URL.
  const [staged, setStaged] = useState([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Attach menu, poll / live-location sheets and the view-once toggle.
  const [showAttach, setShowAttach] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  // "View once" applies to the staged photos/videos only (never files/voice).
  const [viewOnce, setViewOnce] = useState(false);
  const { startLiveLocation, supported: locationSupported } = useLiveLocation();
  const { openWatch } = useWatchTogether();
  useKeyboardViewport();

  // Voice: "idle" | "recording" | "paused" | "recorded"
  const [voiceState, setVoiceState] = useState("idle");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recorded, setRecorded] = useState(null); // { blob, url, duration, mimeType }
  const [micError, setMicError] = useState("");

  const fileRef = useRef(null);
  const typingTimeout = useRef(null);
  const inputRowRef = useRef(null);
  const errorTimeout = useRef(null);
  const textareaRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const tickRef = useRef(null);
  const clockRef = useRef({ startedAt: 0, accumulated: 0 });
  const discardOnStopRef = useRef(false);
  const dragCounter = useRef(0);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  const recordedRef = useRef(recorded);
  recordedRef.current = recorded;
  const isMobile = useIsMobileDevice();

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max height comes from CSS (128px on desktop; capped to 30% of the
    // visible height on phones so a tall draft never swallows the screen).
    const max = parseFloat(window.getComputedStyle(el).maxHeight) || 128;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  };

  useEffect(() => {
    resizeTextarea();
  }, [text, conversationId]);

  useEffect(() => {
    api
      .get("/upload/limits")
      .then(({ data }) => data?.maxMb && setMaxMb(data.maxMb))
      .catch(() => {});
  }, []);

  // The emoji picker library only accepts a fixed pixel size: derive both from the row / screen.
  useEffect(() => {
    const measure = () => {
      const rowWidth = inputRowRef.current?.offsetWidth || 320;
      const width = Math.max(260, Math.min(350, rowWidth));
      setPickerWidth(width);
      // Never taller than half the visible screen (landscape phones).
      setPickerHeight(Math.round(Math.min(420, width * 1.2, Math.max(220, window.innerHeight * 0.5))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isMobile]);

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Unmount (leaving the chat, route change, logout): the microphone must
  // be released and every object URL revoked so nothing keeps the mic
  // indicator on or leaks memory.
  useEffect(
    () => () => {
      clearTimeout(errorTimeout.current);
      clearTimeout(typingTimeout.current);
      clearInterval(tickRef.current);
      discardOnStopRef.current = true;
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {
        // already stopped
      }
      releaseStream();
      if (recordedRef.current?.url) URL.revokeObjectURL(recordedRef.current.url);
      stagedRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    },
    []
  );

  const flashError = (msg) => {
    setUploadError(msg);
    clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setUploadError(""), 6000);
  };

  // ---- @mentions (groups) ---------------------------------------------
  const mentionQuery = isGroup && !disabled ? getMentionQuery(text, caret) : null;
  const mentionMatches = React.useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    return (members || [])
      .filter((m) => memberId(m) !== String(currentUserId) && m.username)
      .map((m) => {
        const name = (m.name || "").toLowerCase();
        const un = String(m.username).toLowerCase();
        const rank = !q ? 0 : un.startsWith(q) ? 0 : name.startsWith(q) ? 1 : un.includes(q) || name.includes(q) ? 2 : -1;
        return { m, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || (a.m.name || "").localeCompare(b.m.name || ""))
      .slice(0, 20)
      .map((x) => x.m);
  }, [mentionQuery?.query, mentionQuery?.start, members, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  const mentionOpen = !!mentionQuery && mentionMatches.length > 0 && mentionDismissed !== mentionQuery.start;

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery?.query, mentionQuery?.start]);

  const syncCaret = (e) => setCaret(e.target.selectionStart ?? 0);

  const insertMention = (member) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(caret);
    const insert = `@${member.username} `;
    setDraftText(`${before}${insert}${after.replace(/^\s/, "")}`);
    const pos = before.length + insert.length;
    setCaret(pos);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const mentionsFor = (t) => (isGroup ? extractMentionIds(t, members, currentUserId) : []);

  const handleChange = (e) => {
    setCaret(e.target.selectionStart ?? e.target.value.length);
    setDraftText(e.target.value);
    if (e.target.value.trim()) {
      onTyping?.(true);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => onTyping?.(false), 1200);
    } else {
      onTyping?.(false);
    }
  };

  const handleEmojiClick = (emojiData) => {
    setDraftText(text + emojiData.emoji);
  };

  const pulse = () => {
    setSendPulse(true);
    setTimeout(() => setSendPulse(false), 220);
  };

  const submit = async () => {
    if (disabled || uploading) return;

    // Staged files first (each becomes its own message), then any text.
    if (staged.length > 0) {
      await sendStaged();
      return;
    }
    if (!text.trim()) return;

    const mentions = mentionsFor(text);
    const ok = onSend({ type: "text", text: text.trim(), replyTo: replyTo?._id || null, ...(mentions.length ? { mentions } : {}) });
    if (ok === false) return; // offline: keep the draft so nothing is lost
    clearDraft();
    setShowEmoji(false);
    setShowGif(false);
    onTyping?.(false);
    clearTimeout(typingTimeout.current);
    pulse();
    onCancelReply?.();
  };

  const handleKeyDown = (e) => {
    if (mentionOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = mentionMatches.length;
        setMentionIndex((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionMatches[mentionIndex] || mentionMatches[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionDismissed(mentionQuery.start);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      submit();
    }
  };

  // ---- Files -------------------------------------------------------
  const stageFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;
    const accepted = [];
    for (const file of files) {
      if (file.size === 0) {
        flashError(`"${file.name}" is empty.`);
        continue;
      }
      if (file.size > maxMb * 1024 * 1024) {
        flashError(`"${file.name}" is ${fmtBytes(file.size)} — the limit is ${maxMb}MB.`);
        continue;
      }
      const kind = fileKind(file.type, file.name);
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind,
        previewUrl: kind === "image" || kind === "video" ? URL.createObjectURL(file) : null,
      });
    }
    if (accepted.length) setStaged((prev) => [...prev, ...accepted].slice(0, 10));
  };

  const handleFile = (e) => {
    stageFiles(e.target.files);
    e.target.value = "";
  };

  const removeStaged = (id) => {
    setStaged((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clearStaged = () => {
    stagedRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setStaged([]);
  };

  // Upload one file through the existing /api/upload endpoint, then send
  // the permanent path it returns as the message attachment.
  const uploadAndSend = async (file, { type, duration, text: caption, viewOnce: once } = {}) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    try {
      const data = await uploadFile(file, { onProgress: setUploadProgress });
      const resolvedType = type || fileKind(data.mimeType || file.type, file.name);
      const sent = onSend({
        type: resolvedType === "audio" && type !== "voice" ? "audio" : resolvedType,
        text: caption || "",
        attachment: {
          path: data.path,
          name: data.name || file.name,
          size: data.size ?? file.size,
          mimeType: data.mimeType || file.type,
          ...(duration ? { duration } : {}),
        },
        replyTo: replyTo?._id || null,
        ...(caption && mentionsFor(caption).length ? { mentions: mentionsFor(caption) } : {}),
        // Server only honours this for image/video messages.
        ...(once ? { viewOnce: true } : {}),
      });
      if (sent === false) throw new Error("You're offline. Reconnect and try again.");
      onCancelReply?.();
      return true;
    } catch (err) {
      flashError(errorMessage(err, "Upload failed. Check your connection and try again."));
      return false;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const sendStaged = async () => {
    const queue = [...stagedRef.current];
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      // Caption goes with the first file.
      const ok = await uploadAndSend(item.file, {
        text: i === 0 ? text.trim() : "",
        viewOnce: viewOnce && (item.kind === "image" || item.kind === "video"),
      });
      if (!ok) return; // keep the remaining files staged so the user can retry
      if (i === 0 && text.trim()) clearDraft();
      removeStaged(item.id);
    }
    pulse();
  };

  // ---- Drag and drop (desktop) ----------------------------------------
  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    if (Array.from(e.dataTransfer.types || []).includes("Files")) {
      dragCounter.current += 1;
      setIsDraggingFile(true);
    }
  }, []);
  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDraggingFile(false);
  }, []);
  const onDragOver = useCallback((e) => e.preventDefault(), []);
  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDraggingFile(false);
      stageFiles(e.dataTransfer.files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxMb]
  );

  // Paste an image/file straight into the box.
  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) {
      e.preventDefault();
      stageFiles(files);
    }
  };

  // ---- Voice recording --------------------------------------------------
  const elapsedSeconds = () => {
    const c = clockRef.current;
    return c.accumulated + (c.startedAt ? (performance.now() - c.startedAt) / 1000 : 0);
  };

  const startTicker = () => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const secs = elapsedSeconds();
      setRecordSeconds(Math.floor(secs));
      if (secs >= MAX_RECORD_SECONDS) stopRecording();
    }, 250);
  };

  const resetVoice = () => {
    clearInterval(tickRef.current);
    clockRef.current = { startedAt: 0, accumulated: 0 };
    chunksRef.current = [];
    setRecordSeconds(0);
    setVoiceState("idle");
  };

  const startRecording = async () => {
    setMicError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicError("Voice messages aren't supported in this browser. Try a recent Chrome, Edge, Firefox or Safari.");
      return;
    }
    if (!window.isSecureContext) {
      setMicError("The microphone needs a secure (https) connection.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      discardOnStopRef.current = false;

      const mimeType = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        setMicError("Recording failed. Please try again.");
        discardOnStopRef.current = true;
        releaseStream();
        resetVoice();
      };
      recorder.onstop = () => {
        releaseStream();
        clearInterval(tickRef.current);
        const duration = elapsedSeconds();
        clockRef.current = { startedAt: 0, accumulated: duration };
        if (discardOnStopRef.current) {
          chunksRef.current = [];
          return;
        }
        const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (duration < MIN_RECORD_SECONDS || blob.size === 0) {
          setMicError("That was too short — hold on a little longer to record a voice message.");
          resetVoice();
          return;
        }
        setRecorded({ blob, url: URL.createObjectURL(blob), duration: Math.round(duration), mimeType: type });
        setRecordSeconds(Math.round(duration));
        setVoiceState("recorded");
      };

      recorder.start(250);
      clockRef.current = { startedAt: performance.now(), accumulated: 0 };
      setRecordSeconds(0);
      setVoiceState("recording");
      startTicker();
    } catch (err) {
      releaseStream();
      setMicError(
        err?.name === "NotAllowedError" || err?.name === "SecurityError"
          ? "Microphone access was denied. Allow it in your browser's site settings to record voice messages."
          : err?.name === "NotFoundError"
          ? "No microphone was found on this device."
          : err?.name === "NotReadableError"
          ? "The microphone is being used by another app."
          : "Couldn't access the microphone."
      );
    }
  };

  const pauseRecording = () => {
    const r = recorderRef.current;
    if (!r || r.state !== "recording" || typeof r.pause !== "function") return;
    r.pause();
    clockRef.current = { startedAt: 0, accumulated: elapsedSeconds() };
    clearInterval(tickRef.current);
    setVoiceState("paused");
  };

  const resumeRecording = () => {
    const r = recorderRef.current;
    if (!r || r.state !== "paused") return;
    r.resume();
    clockRef.current = { startedAt: performance.now(), accumulated: clockRef.current.accumulated };
    setVoiceState("recording");
    startTicker();
  };

  const stopRecording = () => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      if (r.state === "recording") clockRef.current = { startedAt: 0, accumulated: elapsedSeconds() };
      r.stop();
    }
  };

  const cancelRecording = () => {
    discardOnStopRef.current = true;
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch {
      // already stopped
    }
    releaseStream();
    if (recorded?.url) URL.revokeObjectURL(recorded.url);
    setRecorded(null);
    resetVoice();
  };

  const sendRecording = async () => {
    if (!recorded) return;
    const ext = recorded.mimeType.includes("mp4") ? "m4a" : recorded.mimeType.includes("ogg") ? "ogg" : "webm";
    const file = new File([recorded.blob], `voice-message.${ext}`, { type: recorded.mimeType });
    const ok = await uploadAndSend(file, { type: "voice", duration: recorded.duration });
    if (ok) {
      URL.revokeObjectURL(recorded.url);
      setRecorded(null);
      resetVoice();
    }
  };

  // GIFs and stickers are sent as image messages pointing at the GIPHY URL
  // (the server keeps external https URLs as-is). The attachment name
  // prefix + explicit flag let every client render them as GIF/sticker.
  const sendGif = (item, kind) => {
    const isSt = kind === "stickers";
    const ext = item.mimeType === "image/webp" ? "webp" : "gif";
    const ok = onSend({
      type: "image",
      text: "",
      ...(isSt ? { sticker: true } : { gif: true }),
      attachment: {
        path: item.url,
        name: `${isSt ? "sticker" : "giphy"}-${item.id}.${ext}`,
        mimeType: item.mimeType,
      },
      replyTo: replyTo?._id || null,
    });
    if (ok === false) {
      flashError("You're offline. Reconnect and try again.");
      return;
    }
    setShowGif(false);
    pulse();
    onCancelReply?.();
  };

  const hasContent = text.trim().length > 0 || staged.length > 0;
  const hasViewOnceable = staged.some((p) => p.kind === "image" || p.kind === "video");
  // The toggle only makes sense while a photo/video is staged.
  useEffect(() => {
    if (!hasViewOnceable) setViewOnce(false);
  }, [hasViewOnceable]);

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="composer-safe-pb relative min-w-0 max-w-full border-t border-white/5 bg-sidebar/60 backdrop-blur px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] sm:px-4 sm:pt-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
    >
      <AnimatePresence>
        {showAttach && !disabled && (
          <AttachMenu
            onClose={() => setShowAttach(false)}
            isGroup={isGroup}
            locationSupported={locationSupported}
            onMedia={() => {
              setShowAttach(false);
              if (fileRef.current) fileRef.current.accept = "image/*,video/*";
              fileRef.current?.click();
            }}
            onFile={() => {
              setShowAttach(false);
              fileRef.current?.removeAttribute("accept");
              fileRef.current?.click();
            }}
            onPoll={() => {
              setShowAttach(false);
              setShowPoll(true);
            }}
            onLocation={() => {
              setShowAttach(false);
              setShowLocation(true);
            }}
            onWatch={() => {
              setShowAttach(false);
              openWatch(conversationId, members);
            }}
            onGif={() => {
              setShowAttach(false);
              setShowGif(true);
              setShowEmoji(false);
            }}
          />
        )}
      </AnimatePresence>
      {showPoll && <PollComposer conversationId={conversationId} onClose={() => setShowPoll(false)} />}
      {showLocation && (
        <LiveLocationDialog
          groupChat={isGroup}
          onClose={() => setShowLocation(false)}
          onStart={(minutes) => startLiveLocation(conversationId, minutes)}
        />
      )}
      {showGif && !disabled && <GifPicker onPick={sendGif} onClose={() => setShowGif(false)} />}

      {/* Drag & drop overlay (desktop) */}
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-bg/90 border-2 border-dashed border-ember rounded-t-2xl m-1 pointer-events-none"
          >
            <p className="text-sm font-medium text-ember">Drop files to share</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(uploadError || micError) && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-lg px-3 py-2 mb-2"
          >
            <AlertCircle size={14} className="flex-shrink-0" />
            <span className="flex-1 min-w-0">{uploadError || micError}</span>
            <button
              onClick={() => {
                setUploadError("");
                setMicError("");
              }}
              aria-label="Dismiss"
              className="flex-shrink-0 hover:text-red-100 p-1"
            >
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {disabled && disabledReason && (
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 text-muted text-xs rounded-lg px-3 py-2 mb-2">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{disabledReason}</span>
        </div>
      )}

      {uploading && (
        <div className="h-0.5 bg-white/5 rounded-full mb-2 overflow-hidden">
          <motion.div
            className="h-full bg-ember"
            initial={{ width: 0 }}
            animate={{ width: `${uploadProgress}%` }}
            transition={{ ease: "easeOut" }}
          />
        </div>
      )}

      {replyTo && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between bg-chat rounded-lg px-3 py-2 mb-2 border-l-2 border-ember"
        >
          <div className="text-sm text-muted truncate">
            Replying to <span className="text-ink">{replyTo.sender?.name || "them"}</span>
            {replyTo.text ? ` — "${replyTo.text.slice(0, 60)}"` : " — attachment"}
          </div>
          <button onClick={onCancelReply} className="text-muted hover:text-ink flex-shrink-0 ml-2">
            <X size={14} />
          </button>
        </motion.div>
      )}

      {/* Files chosen but not sent yet — any type */}
      {staged.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 bg-chat border border-white/5 rounded-xl p-2"
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {staged.map((item) => (
              <div key={item.id} className="relative flex-shrink-0 w-[132px] bg-sidebar/60 border border-white/5 rounded-lg p-2">
                <div className="h-14 rounded-md overflow-hidden bg-black/20 flex items-center justify-center">
                  {item.kind === "image" ? (
                    <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                  ) : item.kind === "video" ? (
                    <video src={item.previewUrl} muted preload="metadata" className="w-full h-full object-cover" />
                  ) : (
                    <StagedIcon kind={item.kind} />
                  )}
                </div>
                <p className="text-[11px] mt-1.5 truncate" title={item.file.name}>{item.file.name}</p>
                <p className="text-[10px] text-muted">{fmtBytes(item.file.size)}</p>
                <button
                  onClick={() => removeStaged(item.id)}
                  disabled={uploading}
                  aria-label={`Remove ${item.file.name}`}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-sidebar border border-white/10 text-muted hover:text-red-400 flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          {hasViewOnceable && (
            <button
              type="button"
              role="switch"
              aria-checked={viewOnce}
              onClick={() => setViewOnce((v) => !v)}
              disabled={uploading}
              className={`mt-1 mb-1 w-full flex items-center gap-2 px-3 min-h-[40px] rounded-lg text-xs border transition-colors ${
                viewOnce ? "border-ember bg-ember/10 text-ember" : "border-white/10 text-muted hover:text-ink"
              }`}
            >
              <Eye size={14} />
              <span className="flex-1 text-left">View once{viewOnce ? " · disappears after it's opened" : ""}</span>
              <span className={`w-8 h-[18px] rounded-full relative transition-colors ${viewOnce ? "bg-ember" : "bg-white/15"}`}>
                <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-bg transition-all ${viewOnce ? "left-[16px]" : "left-[2px]"}`} />
              </span>
            </button>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button onClick={clearStaged} disabled={uploading} className="text-xs text-muted hover:text-red-400 px-2 py-2 min-h-[40px]">
              Clear all
            </button>
            <button
              onClick={submit}
              disabled={uploading || disabled}
              className="flex items-center gap-2 px-4 min-h-[40px] rounded-full bg-ember text-bg text-sm font-medium hover:brightness-110 disabled:opacity-50"
            >
              <Send size={14} />
              {uploading ? `Uploading ${uploadProgress}%` : `Send ${staged.length > 1 ? `${staged.length} files` : "file"}`}
            </button>
          </div>
        </motion.div>
      )}

      {/* Voice message recorded, awaiting send */}
      {voiceState === "recorded" && recorded && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 bg-chat border border-white/5 rounded-xl px-2.5 py-2 flex items-center gap-2"
        >
          <button
            onClick={cancelRecording}
            disabled={uploading}
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-red-400 hover:bg-white/5 flex-shrink-0"
            aria-label="Discard voice message"
            title="Discard"
          >
            <Trash2 size={17} />
          </button>
          <RecordingPreview url={recorded.url} duration={recorded.duration} />
          <button
            onClick={sendRecording}
            disabled={uploading}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-ember text-bg hover:brightness-110 disabled:opacity-50 flex-shrink-0"
            aria-label="Send voice message"
            title="Send"
          >
            {uploading ? <span className="text-[10px] font-semibold">{uploadProgress}%</span> : <Send size={17} />}
          </button>
        </motion.div>
      )}

      {/* Actively recording */}
      {voiceState === "recording" || voiceState === "paused" ? (
        <div className="flex items-center gap-1.5 sm:gap-3 px-1 py-1" role="status" aria-live="polite">
          <button
            onClick={cancelRecording}
            className="w-11 h-11 flex items-center justify-center rounded-full text-muted hover:text-red-400 hover:bg-white/5 flex-shrink-0"
            title="Cancel recording"
            aria-label="Cancel recording"
          >
            <Trash2 size={18} />
          </button>
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${voiceState === "recording" ? "bg-red-500 animate-pulse" : "bg-amber"}`}
          />
          <span className="flex-1 min-w-0 text-sm text-muted truncate">
            {voiceState === "recording" ? "Recording voice…" : "Recording paused"}{" "}
            <span className="tabular-nums text-ink">{fmtDuration(recordSeconds)}</span>
          </span>
          {typeof MediaRecorder !== "undefined" && typeof MediaRecorder.prototype.pause === "function" && (
            <button
              onClick={voiceState === "recording" ? pauseRecording : resumeRecording}
              className="w-11 h-11 flex items-center justify-center rounded-full text-ink bg-white/5 hover:bg-white/10 flex-shrink-0"
              title={voiceState === "recording" ? "Pause" : "Resume"}
              aria-label={voiceState === "recording" ? "Pause recording" : "Resume recording"}
            >
              {voiceState === "recording" ? <Pause size={17} /> : <Mic size={17} />}
            </button>
          )}
          <button
            onClick={stopRecording}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-ember text-bg hover:brightness-110 flex-shrink-0"
            title="Finish recording"
            aria-label="Finish recording"
          >
            <Square size={15} />
          </button>
        </div>
      ) : voiceState === "recorded" ? null : (
        <div ref={inputRowRef} className="flex items-end gap-1 sm:gap-2">
          <button
            data-attach-toggle
            onClick={() => setShowAttach((v) => !v)}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${showAttach ? "text-ember bg-white/10" : "text-muted hover:text-ember hover:bg-white/5"}`}
            title="Attach"
            aria-label="Attach"
            aria-haspopup="menu"
            aria-expanded={showAttach}
            disabled={uploading || disabled}
          >
            <Paperclip size={20} />
          </button>

          {/* No accept= filter: any normal file can be shared. The server
              enforces size limits and blocks only executable/script types. */}
          <input type="file" multiple ref={fileRef} className="hidden" onChange={handleFile} />

          {/* Below lg the wrapper isn't a positioning context, so the mention
              list / emoji picker anchor to the full-width composer instead of
              the (narrow, on phones) textarea. */}
          <div className="max-lg:static lg:relative flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onKeyUp={syncCaret}
              onClick={syncCaret}
              onSelect={syncCaret}
              onPaste={handlePaste}
              rows={1}
              disabled={disabled}
              aria-label="Message"
              placeholder={uploading ? `Uploading… ${uploadProgress}%` : staged.length ? "Add a caption" : isGroup ? "Type a message — @ to mention" : "Type a message"}
              className="w-full resize-none bg-chat border border-white/5 focus:border-ember/50 outline-none rounded-2xl px-3.5 py-2.5 sm:px-4 text-base sm:text-[15px] text-ink placeholder:text-muted transition-colors max-h-[min(8rem,30dvh)] lg:max-h-32 overflow-y-auto disabled:opacity-60"
            />

            {mentionOpen && (
              <div
                role="listbox"
                aria-label="Mention a member"
                className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-sidebar border border-white/10 rounded-xl shadow-2xl overflow-y-auto max-h-56 py-1"
              >
                {mentionMatches.map((m, i) => (
                  <button
                    key={memberId(m)}
                    type="button"
                    role="option"
                    aria-selected={i === mentionIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMention(m)}
                    onMouseEnter={() => setMentionIndex(i)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${i === mentionIndex ? "bg-white/10" : ""}`}
                  >
                    <Avatar name={m.name} src={m.avatar} size={28} />
                    <span className="text-sm truncate">{m.name}</span>
                    <span className="text-xs text-muted truncate">@{m.username}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Sized from the composer width / visible height, so it never
                overflows a phone screen. */}
            {showEmoji && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] right-3 sm:right-4 lg:bottom-14 lg:right-0 z-50 max-w-[calc(100vw-1.5rem)]"
              >
                <Suspense fallback={<div style={{ width: pickerWidth, height: pickerHeight }} className="flex items-center justify-center text-muted text-sm bg-sidebar border border-white/10 rounded-xl">Loading emoji…</div>}>
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme={isLight ? "light" : "dark"}
                    searchDisabled={false}
                    skinTonesDisabled={false}
                    lazyLoadEmojis
                    width={pickerWidth}
                    height={pickerHeight}
                    previewConfig={{ showPreview: false }}
                  />
                </Suspense>
              </motion.div>
            )}
          </div>

          <button
            data-gif-toggle
            onClick={() => {
              setShowGif((v) => !v);
              setShowEmoji(false);
            }}
            disabled={disabled || uploading}
            aria-label="GIFs and stickers"
            aria-expanded={showGif}
            title="GIFs & stickers"
            className={`max-[359px]:hidden h-10 px-2 flex items-center justify-center rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
              showGif ? "text-ember bg-white/10" : "text-muted hover:text-ember hover:bg-white/5"
            }`}
          >
            <span className="text-[10px] font-bold leading-none border-[1.5px] border-current rounded-md px-1 py-[3px]">GIF</span>
          </button>

          {(
            <button
              onClick={() => {
                // On phones close the keyboard so the picker has the room.
                if (isMobile && !showEmoji) textareaRef.current?.blur();
                setShowEmoji((s) => !s);
                setShowGif(false);
              }}
              disabled={disabled}
              aria-label="Emoji picker"
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
                showEmoji ? "text-ember bg-white/10" : "text-muted hover:text-amber hover:bg-white/5"
              }`}
              title="Emoji"
            >
              <Smile size={20} />
            </button>
          )}

          {hasContent ? (
            <motion.button
              animate={{ scale: sendPulse ? 0.85 : 1 }}
              onClick={submit}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-ember text-bg hover:brightness-110 transition-all disabled:opacity-40 flex-shrink-0"
              disabled={disabled || uploading}
              aria-label="Send message"
              title="Send"
            >
              <Send size={18} />
            </motion.button>
          ) : (
            <button
              onClick={startRecording}
              disabled={disabled || uploading}
              aria-label="Record voice message"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-ember text-bg hover:brightness-110 transition-all disabled:opacity-40 flex-shrink-0"
              title="Record voice message"
            >
              <Mic size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageInput;
