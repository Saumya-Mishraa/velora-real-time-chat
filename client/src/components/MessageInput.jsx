
import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  Suspense,
  lazy,
} from "react";

import { motion, AnimatePresence } from "framer-motion";

import {
  Paperclip,
  Send,
  Smile,
  X,
  AlertCircle,
  Mic,
  Square,
  Trash2,
  Pause,
  Play,
  FileText,
  Film,
  Music,
} from "lucide-react";

import api from "../services/api.js";
import { useDraft } from "../hooks/useDrafts.js";
import {
  uploadFile,
  fmtBytes,
  fmtDuration,
  fileKind,
  errorMessage,
} from "../utils/media.js";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

const useIsMobileDevice = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;

    return !window.matchMedia("(min-width: 640px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");

    const onChange = () => setIsMobile(!mq.matches);

    onChange();
    mq.addEventListener("change", onChange);

    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
};

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

const pickRecorderMime = () => {
  if (
    typeof MediaRecorder === "undefined" ||
    !MediaRecorder.isTypeSupported
  ) {
    return "";
  }

  return (
    RECORDER_MIME_TYPES.find((type) =>
      MediaRecorder.isTypeSupported(type)
    ) || ""
  );
};

const MAX_RECORD_SECONDS = 15 * 60;
const MIN_RECORD_SECONDS = 1;

const RecordingPreview = ({ url, duration }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = async () => {
    const audio = audioRef.current;

    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          setProgress(
            Math.min(
              1,
              e.currentTarget.currentTime /
                Math.max(duration, 0.1)
            )
          );
        }}
        className="hidden"
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="w-10 h-10 rounded-full bg-ember/15 text-ember flex items-center justify-center flex-shrink-0"
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-ember transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <span className="text-xs text-muted tabular-nums flex-shrink-0">
        {fmtDuration(duration)}
      </span>
    </div>
  );
};

const StagedIcon = ({ kind }) => {
  const Icon =
    kind === "video"
      ? Film
      : kind === "audio"
        ? Music
        : FileText;

  return <Icon size={22} className="text-muted" />;
};

const MessageInput = ({
  conversationId,
  onSend,
  onTyping,
  replyTo,
  onCancelReply,
  disabled,
  disabledReason,
}) => {
  const [text, setDraftText, clearDraft] = useDraft(conversationId);

  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [sendPulse, setSendPulse] = useState(false);
  const [pickerWidth, setPickerWidth] = useState(320);
  const [maxMb, setMaxMb] = useState(50);

  const [staged, setStaged] = useState([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [voiceState, setVoiceState] = useState("idle");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recorded, setRecorded] = useState(null);
  const [micError, setMicError] = useState("");

  const fileRef = useRef(null);
  const typingTimeout = useRef(null);
  const typingSentAt = useRef(0);
  const inputRowRef = useRef(null);
  const errorTimeout = useRef(null);
  const textareaRef = useRef(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const tickRef = useRef(null);

  const clockRef = useRef({
    startedAt: 0,
    accumulated: 0,
  });

  const discardOnStopRef = useRef(false);
  const dragCounter = useRef(0);

  const stagedRef = useRef(staged);
  const recordedRef = useRef(recorded);

  stagedRef.current = staged;
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
    let active = true;

    api
      .get("/upload/limits")
      .then(({ data }) => {
        if (active && Number(data?.maxMb) > 0) {
          setMaxMb(data.maxMb);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isMobile) return;

    const measure = () => {
      const rowWidth = inputRowRef.current?.offsetWidth || 320;

      setPickerWidth(
        Math.max(260, Math.min(350, rowWidth))
      );
    };

    measure();

    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [isMobile]);

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;
  };

  // ---- Small helpers ----------------------------------------------

  // Shows an error above the composer and clears it after a few seconds.
  const flashError = useCallback((message) => {
    setUploadError(message);
    clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setUploadError(""), 6000);
  }, []);

  // Brief "squish" on the send button.
  const pulse = () => {
    setSendPulse(true);
    setTimeout(() => setSendPulse(false), 140);
  };

  // Typing indicator: tell the other side we're typing at most every 2s
  // (their UI hides it after 3s of silence) and that we stopped after 2.5s
  // of inactivity, on send, on blur, and when the chat changes.
  const stopTyping = useCallback(() => {
    clearTimeout(typingTimeout.current);
    typingTimeout.current = null;
    if (typingSentAt.current) {
      typingSentAt.current = 0;
      onTyping?.(false);
    }
  }, [onTyping]);

  const notifyTyping = () => {
    const now = Date.now();
    if (!typingSentAt.current || now - typingSentAt.current > 2000) {
      typingSentAt.current = now;
      onTyping?.(true);
    }
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(stopTyping, 2500);
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setDraftText(value);
    if (value.trim()) notifyTyping();
    else stopTyping();
  };

  const insertAtCursor = (insertion) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + insertion + text.slice(end);
    setDraftText(next);
    notifyTyping();
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      const caret = start + insertion.length;
      node.setSelectionRange(caret, caret);
    });
  };

  const handleEmojiClick = (emojiData) => {
    insertAtCursor(emojiData?.emoji || "");
  };

  
  // Files, recordings and the emoji picker belong to one conversation.
  // Without this, a file picked in one chat could be sent to another.
  useEffect(() => {
    return () => {
      stopTyping();
      setShowEmoji(false);

      stagedRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setStaged([]);

      discardOnStopRef.current = true;
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        // already stopped
      }
      releaseStream();
      if (recordedRef.current?.url) URL.revokeObjectURL(recordedRef.current.url);
      setRecorded(null);
      resetVoice();
      setUploadError("");
      setMicError("");
    };
    // Runs when the conversation changes (cleanup of the previous one) and on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(
    () => () => {
      clearTimeout(errorTimeout.current);
      clearTimeout(typingTimeout.current);
      clearInterval(tickRef.current);
    },
    []
  );

  // Close the emoji picker when clicking elsewhere.
  useEffect(() => {
    if (!showEmoji) return undefined;
    const onDown = (e) => {
      if (inputRowRef.current && !inputRowRef.current.contains(e.target)) setShowEmoji(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [showEmoji]);

  // Jump straight into typing when replying.
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // ---- Files -------------------------------------------------------

  const stageFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList || []).filter(Boolean);
      if (!files.length) return;

      const remainingSlots = Math.max(0, 10 - stagedRef.current.length);

      if (remainingSlots === 0) {
        flashError("You can attach up to 10 files at a time.");
        return;
      }

      const accepted = [];

      for (const file of files) {
        if (accepted.length >= remainingSlots) {
          flashError("You can attach up to 10 files at a time.");
          break;
        }

        if (file.size === 0) {
          flashError(`"${file.name}" is empty.`);
          continue;
        }

        if (file.size > maxMb * 1024 * 1024) {
          flashError(
            `"${file.name}" is ${fmtBytes(file.size)} — the limit is ${maxMb}MB.`
          );
          continue;
        }

        const kind = fileKind(file.type, file.name);

        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          kind,
          previewUrl:
            kind === "image" || kind === "video"
              ? URL.createObjectURL(file)
              : null,
        });
      }

      if (accepted.length) {
        setStaged((prev) => [...prev, ...accepted].slice(0, 10));
      }
    },
    [maxMb, flashError]
  );

  const handleFile = (e) => {
    stageFiles(e.target.files);
    e.target.value = "";
  };

  const removeStaged = (id) => {
    setStaged((prev) => {
      const item = prev.find((p) => p.id === id);

      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }

      return prev.filter((p) => p.id !== id);
    });
  };

  const clearStaged = () => {
    stagedRef.current.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });

    setStaged([]);
  };

  // ---- Upload and send --------------------------------------------

  const uploadAndSend = async (
    file,
    { type, duration, text: caption } = {}
  ) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");

    try {
      const data = await uploadFile(file, {
        onProgress: setUploadProgress,
      });

      if (!data?.path) {
        throw new Error("The server did not return a valid file URL.");
      }

      const resolvedType =
        type || fileKind(data.mimeType || file.type, file.name);

      const sent = onSend({
        type:
          resolvedType === "audio" && type !== "voice"
            ? "audio"
            : resolvedType,
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

      if (sent === false) {
        throw new Error("You're offline. Reconnect and try again.");
      }

      onCancelReply?.();
      return true;
    } catch (err) {
      flashError(
        errorMessage(
          err,
          "Upload failed. Check your connection and try again."
        )
      );

      return false;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const sendStaged = async () => {
    if (uploading || !stagedRef.current.length) return;

    const queue = [...stagedRef.current];
    const caption = text.trim();

    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];

      const ok = await uploadAndSend(item.file, {
        text: i === 0 ? caption : "",
      });

      if (!ok) {
        return;
      }

      if (i === 0 && caption) {
        clearDraft();
      }

      removeStaged(item.id);
    }

    pulse();
  };

  // ---- Drag and drop ----------------------------------------------

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

    if (dragCounter.current === 0) {
      setIsDraggingFile(false);
    }
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();

      dragCounter.current = 0;
      setIsDraggingFile(false);

      stageFiles(e.dataTransfer.files);
    },
    [stageFiles]
  );

  // ---- Paste files -------------------------------------------------

  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);

    if (files.length) {
      e.preventDefault();
      stageFiles(files);
    }
  };

  // ---- Voice recording --------------------------------------------

  const elapsedSeconds = () => {
    const clock = clockRef.current;

    return (
      clock.accumulated +
      (clock.startedAt
        ? (performance.now() - clock.startedAt) / 1000
        : 0)
    );
  };

  const startTicker = () => {
    clearInterval(tickRef.current);

    tickRef.current = setInterval(() => {
      const seconds = elapsedSeconds();

      setRecordSeconds(Math.floor(seconds));

      if (seconds >= MAX_RECORD_SECONDS) {
        stopRecording();
      }
    }, 250);
  };

  const resetVoice = () => {
    clearInterval(tickRef.current);

    clockRef.current = {
      startedAt: 0,
      accumulated: 0,
    };

    chunksRef.current = [];

    setRecordSeconds(0);
    setVoiceState("idle");
  };

  const startRecording = async () => {
    setMicError("");

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMicError(
        "Voice messages aren't supported in this browser. Try a recent Chrome, Edge, Firefox or Safari."
      );
      return;
    }

    if (!window.isSecureContext) {
      setMicError(
        "The microphone needs a secure (https) connection."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];
      discardOnStopRef.current = false;

      const mimeType = pickRecorderMime();

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
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

        clockRef.current = {
          startedAt: 0,
          accumulated: duration,
        };

        if (discardOnStopRef.current) {
          chunksRef.current = [];
          return;
        }

        const type = (
          recorder.mimeType ||
          mimeType ||
          "audio/webm"
        ).split(";")[0];

        const blob = new Blob(chunksRef.current, { type });

        chunksRef.current = [];

        if (
          duration < MIN_RECORD_SECONDS ||
          blob.size === 0
        ) {
          setMicError(
            "That was too short — hold on a little longer to record a voice message."
          );

          resetVoice();
          return;
        }

        setRecorded({
          blob,
          url: URL.createObjectURL(blob),
          duration: Math.round(duration),
          mimeType: type,
        });

        setRecordSeconds(Math.round(duration));
        setVoiceState("recorded");
      };

      recorder.start(250);

      clockRef.current = {
        startedAt: performance.now(),
        accumulated: 0,
      };

      setRecordSeconds(0);
      setVoiceState("recording");

      startTicker();
    } catch (err) {
      releaseStream();

      setMicError(
        err?.name === "NotAllowedError" ||
        err?.name === "SecurityError"
          ? "Microphone access was denied. Allow it in your browser's site settings to record voice messages."
          : err?.name === "NotFoundError"
          ? "No microphone was found on this device."
          : err?.name === "NotReadableError"
          ? "The microphone is being used by another app."
          : "Couldn't access the microphone."
      );
    }
  };


  
  // ---- Voice recording controls -----------------------------------

  const pauseRecording = () => {
    const recorder = recorderRef.current;

    if (
      !recorder ||
      recorder.state !== "recording" ||
      typeof recorder.pause !== "function"
    ) {
      return;
    }

    const elapsed = elapsedSeconds();

    recorder.pause();

    clockRef.current = {
      startedAt: 0,
      accumulated: elapsed,
    };

    clearInterval(tickRef.current);
    setVoiceState("paused");
  };

  const resumeRecording = () => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state !== "paused") return;

    recorder.resume();

    clockRef.current = {
      startedAt: performance.now(),
      accumulated: clockRef.current.accumulated,
    };

    setVoiceState("recording");
    startTicker();
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === "inactive") return;

    if (recorder.state === "recording") {
      const elapsed = elapsedSeconds();

      clockRef.current = {
        startedAt: 0,
        accumulated: elapsed,
      };
    }

    clearInterval(tickRef.current);
    recorder.stop();
  };

  const cancelRecording = () => {
    discardOnStopRef.current = true;

    const recorder = recorderRef.current;

    try {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    } catch {
      // Recorder may already have stopped.
    }

    releaseStream();

    if (recorded?.url) {
      URL.revokeObjectURL(recorded.url);
    }

    setRecorded(null);
    resetVoice();
  };

  const sendRecording = async () => {
    if (!recorded || uploading) return;

    const ext = recorded.mimeType.includes("mp4")
      ? "m4a"
      : recorded.mimeType.includes("ogg")
      ? "ogg"
      : "webm";

    const file = new File(
      [recorded.blob],
      `voice-message.${ext}`,
      { type: recorded.mimeType }
    );

    const ok = await uploadAndSend(file, {
      type: "voice",
      duration: recorded.duration,
    });

    if (ok) {
      URL.revokeObjectURL(recorded.url);
      setRecorded(null);
      resetVoice();
    }
  };

  // ---- Submit and keyboard ----------------------------------------

  const submit = async () => {
    if (disabled || uploading) return;

    // Files take priority; the typed text becomes the first file's caption.
    if (stagedRef.current.length) {
      stopTyping();
      setShowEmoji(false);
      await sendStaged();
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    const sent = onSend({
      type: "text",
      text: trimmed,
      replyTo: replyTo?._id || null,
    });

    // Keep the draft if the message could not be sent (e.g. offline).
    if (sent === false) return;

    clearDraft();
    onCancelReply?.();
    stopTyping();
    setShowEmoji(false);
    pulse();
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === "Escape") {
      if (showEmoji) setShowEmoji(false);
      else if (replyTo) onCancelReply?.();
    }
  };

  // ---- Composer state ---------------------------------------------

  const hasContent = text.trim().length > 0 || staged.length > 0;

  // ---- Composer UI ------------------------------------------------

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
            <p className="text-sm font-medium text-ember">
              Drop files to share
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload and microphone errors */}
      <AnimatePresence>
        {(uploadError || micError) && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-lg px-3 py-2 mb-2"
          >
            <AlertCircle size={14} className="flex-shrink-0" />

            <span className="flex-1 min-w-0">
              {uploadError || micError}
            </span>

            <button
              type="button"
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

      {/* Disabled conversation notice */}
      {disabled && disabledReason && (
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 text-muted text-xs rounded-lg px-3 py-2 mb-2">
          <AlertCircle size={14} className="flex-shrink-0" />

          <span>{disabledReason}</span>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div
          className="h-0.5 bg-white/5 rounded-full mb-2 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uploadProgress}
        >
          <motion.div
            className="h-full bg-ember"
            initial={{ width: 0 }}
            animate={{ width: `${uploadProgress}%` }}
            transition={{ ease: "easeOut" }}
          />
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between bg-chat rounded-lg px-3 py-2 mb-2 border-l-2 border-ember"
        >
          <div className="text-sm text-muted truncate min-w-0">
            Replying to{" "}
            <span className="text-ink">
              {replyTo.sender?.name || "them"}
            </span>

            {replyTo.text
              ? ` — "${replyTo.text.slice(0, 60)}"`
              : " — attachment"}
          </div>

          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="text-muted hover:text-ink flex-shrink-0 ml-2"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}


      
      {/* Files chosen but not sent yet */}
      {staged.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 bg-chat border border-white/5 rounded-xl p-2"
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {staged.map((item) => (
              <div
                key={item.id}
                className="relative flex-shrink-0 w-[132px] bg-sidebar/60 border border-white/5 rounded-lg p-2"
              >
                <div className="h-14 rounded-md overflow-hidden bg-black/20 flex items-center justify-center">
                  {item.kind === "image" ? (
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : item.kind === "video" ? (
                    <video
                      src={item.previewUrl}
                      muted
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <StagedIcon kind={item.kind} />
                  )}
                </div>

                <p
                  className="text-[11px] mt-1.5 truncate"
                  title={item.file.name}
                >
                  {item.file.name}
                </p>

                <p className="text-[10px] text-muted">
                  {fmtBytes(item.file.size)}
                </p>

                <button
                  type="button"
                  onClick={() => removeStaged(item.id)}
                  disabled={uploading}
                  aria-label={`Remove ${item.file.name}`}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-sidebar border border-white/10 text-muted hover:text-red-400 flex items-center justify-center disabled:opacity-40"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={clearStaged}
              disabled={uploading}
              className="text-xs text-muted hover:text-red-400 px-2 py-2 min-h-[40px] disabled:opacity-40"
            >
              Clear all
            </button>

            <button
              type="button"
              onClick={submit}
              disabled={uploading || disabled}
              className="flex items-center gap-2 px-4 min-h-[40px] rounded-full bg-ember text-bg text-sm font-medium hover:brightness-110 disabled:opacity-50"
            >
              <Send size={14} />

              {uploading
                ? `Uploading ${uploadProgress}%`
                : `Send ${
                    staged.length > 1
                      ? `${staged.length} files`
                      : "file"
                  }`}
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
            type="button"
            onClick={cancelRecording}
            disabled={uploading}
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-red-400 hover:bg-white/5 flex-shrink-0 disabled:opacity-40"
            aria-label="Discard voice message"
            title="Discard"
          >
            <Trash2 size={17} />
          </button>

          <RecordingPreview
            url={recorded.url}
            duration={recorded.duration}
          />

          <button
            type="button"
            onClick={sendRecording}
            disabled={uploading || disabled}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-ember text-bg hover:brightness-110 disabled:opacity-50 flex-shrink-0"
            aria-label="Send voice message"
            title="Send"
          >
            {uploading ? (
              <span className="text-[10px] font-semibold">
                {uploadProgress}%
              </span>
            ) : (
              <Send size={17} />
            )}
          </button>
        </motion.div>
      )}

      {/* Actively recording */}
      {voiceState === "recording" || voiceState === "paused" ? (
        <div
          className="flex items-center gap-1.5 sm:gap-3 px-1 py-1"
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            onClick={cancelRecording}
            className="w-11 h-11 flex items-center justify-center rounded-full text-muted hover:text-red-400 hover:bg-white/5 flex-shrink-0"
            title="Cancel recording"
            aria-label="Cancel recording"
          >
            <Trash2 size={18} />
          </button>

          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              voiceState === "recording"
                ? "bg-red-500 animate-pulse"
                : "bg-amber"
            }`}
          />

          <span className="flex-1 min-w-0 text-sm text-muted truncate">
            {voiceState === "recording"
              ? "Recording voice…"
              : "Recording paused"}{" "}

            <span className="tabular-nums text-ink">
              {fmtDuration(recordSeconds)}
            </span>
          </span>

          {typeof MediaRecorder !== "undefined" &&
            typeof MediaRecorder.prototype.pause === "function" && (
              <button
                type="button"
                onClick={
                  voiceState === "recording"
                    ? pauseRecording
                    : resumeRecording
                }
                className="w-11 h-11 flex items-center justify-center rounded-full text-ink bg-white/5 hover:bg-white/10 flex-shrink-0"
                title={
                  voiceState === "recording" ? "Pause" : "Resume"
                }
                aria-label={
                  voiceState === "recording"
                    ? "Pause recording"
                    : "Resume recording"
                }
              >
                {voiceState === "recording" ? (
                  <Pause size={17} />
                ) : (
                  <Mic size={17} />
                )}
              </button>
            )}

          <button
            type="button"
            onClick={stopRecording}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-ember text-bg hover:brightness-110 flex-shrink-0"
            title="Finish recording"
            aria-label="Finish recording"
          >
            <Square size={15} />
          </button>
        </div>
      ) : voiceState === "recorded" ? null : (
        <div
          ref={inputRowRef}
          className="flex items-end gap-1 sm:gap-2"
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-9 h-9 min-[360px]:w-10 min-[360px]:h-10 flex items-center justify-center rounded-full text-muted hover:text-ember hover:bg-white/5 transition-colors flex-shrink-0"
            title="Attach files"
            aria-label="Attach files"
            disabled={uploading || disabled}
          >
            <Paperclip size={20} />
          </button>

          {/* Allow normal file types; server validates uploads. */}
          <input
            type="file"
            multiple
            ref={fileRef}
            className="hidden"
            onChange={handleFile}
          />

          <div className="relative flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onBlur={stopTyping}
              onPaste={handlePaste}
              rows={1}
              disabled={disabled}
              aria-label="Message"
              placeholder={
                uploading
                  ? `Uploading… ${uploadProgress}%`
                  : staged.length
                  ? "Add a caption"
                  : "Type a message"
              }
              className="w-full resize-none bg-chat border border-white/5 focus:border-ember/50 outline-none rounded-2xl px-3.5 py-2.5 sm:px-4 text-base sm:text-[15px] text-ink placeholder:text-muted transition-colors max-h-32 overflow-y-auto disabled:opacity-60"
            />


            
            {/* Desktop only — mobile uses its native emoji keyboard */}
            {!isMobile && showEmoji && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 24,
                }}
                className="absolute bottom-14 right-0 z-50 max-w-[calc(100vw-1.5rem)]"
              >
                <Suspense
                  fallback={
                    <div
                      style={{
                        width: pickerWidth,
                        height: Math.min(420, pickerWidth * 1.2),
                      }}
                      className="flex items-center justify-center text-muted text-sm bg-sidebar border border-white/10 rounded-xl"
                    >
                      Loading emoji…
                    </div>
                  }
                >
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

          {/* Emoji button — desktop only */}
          {!isMobile && (
            <button
              type="button"
              onClick={() => setShowEmoji((s) => !s)}
              disabled={disabled}
              aria-label="Emoji picker"
              aria-expanded={showEmoji}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
                showEmoji
                  ? "text-ember bg-white/10"
                  : "text-muted hover:text-amber hover:bg-white/5"
              }`}
              title="Emoji"
            >
              <Smile size={20} />
            </button>
          )}

          {/* Send message or record voice */}
          {hasContent ? (
            <motion.button
              type="button"
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
              type="button"
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
