import React, { useRef, useState, useEffect, useCallback, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Send, Smile, X, AlertCircle, Mic, Square, Trash2, Pause, Play, FileText, Film, Music } from "lucide-react";
import api from "../services/api.js";
import { useDraft } from "../hooks/useDrafts.js";
import { uploadFile, fmtBytes, fmtDuration, fileKind, errorMessage } from "../utils/media.js";

// Code-split: emoji-picker-react (with its full emoji dataset) is one of
// the heaviest optional dependencies in the app. Loading it lazily keeps
// it out of the initial bundle for every session that never opens the
// picker (section 47 — avoid unnecessary load for a feature not used
// yet), at the cost of a short delay the first time it's opened.
const EmojiPicker = lazy(() => import("emoji-picker-react"));

// Same mobile/desktop boundary already used elsewhere in the app (e.g.
// Dashboard.jsx's pane-switching, and the `sm:` breakpoint on the chat
// header's back button) — 640px, Tailwind's default `sm`. The emoji
// button/picker are removed entirely below this width (see render
// below): mobile keyboards already have a built-in emoji picker, so
// there's no need to also ship one in-app there, and it's one less
// thing that can ever overflow a small viewport.
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

const MessageInput = ({ conversationId, onSend, onTyping, replyTo, onCancelReply, disabled, disabledReason }) => {
  // The draft lives in a per-user, per-conversation store (localStorage),
  // not component state: it survives navigating away, refreshing and
  // closing the tab, and the chat list reads the same store for its
  // "Draft:" preview.
  const [text, setDraftText, clearDraft] = useDraft(conversationId);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [sendPulse, setSendPulse] = useState(false);
  const [pickerWidth, setPickerWidth] = useState(320);
  const [maxMb, setMaxMb] = useState(50);

  // Files chosen but not yet sent (any type). Images/videos get a
  // thumbnail from a temporary object URL — preview only; what's sent is
  // always the uploaded file's permanent path, never a blob: URL.
  const [staged, setStaged] = useState([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

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
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
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

  // The emoji picker library only accepts a fixed pixel width. Desktop only.
  useEffect(() => {
    if (isMobile) return;
    const measure = () => {
      const rowWidth = inputRowRef.current?.offsetWidth || 320;
      setPickerWidth(Math.max(260, Math.min(350, rowWidth)));
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

  const handleChange = (e) => {
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

    const ok = onSend({ type: "text", text: text.trim(), replyTo: replyTo?._id || null });
    if (ok === false) return; // offline: keep the draft so nothing is lost
    clearDraft();
    setShowEmoji(false);
    onTyping?.(false);
    clearTimeout(typingTimeout.current);
    pulse();
    onCancelReply?.();
  };

  const handleKeyDown = (e) => {
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
  const uploadAndSend = async (file, { type, duration, text: caption } = {}) => {
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
      const ok = await uploadAndSend(item.file, { text: i === 0 ? text.trim() : "" });
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

  const hasContent = text.trim().length > 0 || staged.length > 0;

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="relative border-t border-white/5 bg-sidebar/60 backdrop-blur px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] sm:px-4 sm:pt-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
    >
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
            onClick={() => fileRef.current?.click()}
            className="w-9 h-9 min-[360px]:w-10 min-[360px]:h-10 flex items-center justify-center rounded-full text-muted hover:text-ember hover:bg-white/5 transition-colors flex-shrink-0"
            title="Attach files"
            aria-label="Attach files"
            disabled={uploading || disabled}
          >
            <Paperclip size={20} />
          </button>

          {/* No accept= filter: any normal file can be shared. The server
              enforces size limits and blocks only executable/script types. */}
          <input type="file" multiple ref={fileRef} className="hidden" onChange={handleFile} />

          <div className="relative flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              disabled={disabled}
              aria-label="Message"
              placeholder={uploading ? `Uploading… ${uploadProgress}%` : staged.length ? "Add a caption" : "Type a message"}
              className="w-full resize-none bg-chat border border-white/5 focus:border-ember/50 outline-none rounded-2xl px-3.5 py-2.5 sm:px-4 text-base sm:text-[15px] text-ink placeholder:text-muted transition-colors max-h-32 overflow-y-auto disabled:opacity-60"
            />

            {/* Desktop only — mobile has its own OS-level emoji keyboard,
                and removing this here entirely (not just visually hiding
                it) means there's nothing emoji-picker-related that can
                ever overflow a small viewport. */}
            {!isMobile && showEmoji && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="absolute bottom-14 right-0 z-50 max-w-[calc(100vw-1.5rem)]"
              >
                <Suspense fallback={<div style={{ width: pickerWidth, height: Math.min(420, pickerWidth * 1.2) }} className="flex items-center justify-center text-muted text-sm bg-sidebar border border-white/10 rounded-xl">Loading emoji…</div>}>
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme="dark"
                    searchDisabled={false}
                    skinTonesDisabled={false}
                    lazyLoadEmojis
                    width={pickerWidth}
                    height={Math.min(420, pickerWidth * 1.2)}
                    previewConfig={{ showPreview: false }}
                  />
                </Suspense>
              </motion.div>
            )}
          </div>

          {!isMobile && (
            <button
              onClick={() => setShowEmoji((s) => !s)}
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
