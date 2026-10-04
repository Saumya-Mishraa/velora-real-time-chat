import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Type, Send, Check, Loader2, AlertCircle } from "lucide-react";
import Modal from "./Modal.jsx";
import Avatar from "./Avatar.jsx";
import api from "../services/api.js";
import { uploadFile, fmtBytes, errorMessage } from "../utils/media.js";

const BG_COLORS = ["#FF6B4A", "#B58CFF", "#3AA0FF", "#5FE2B8", "#FF6FA5", "#FFB86B", "#2B2F3A"];
const AUDIENCES = [
  { id: "chats", label: "My chats", hint: "Everyone you have a one-to-one chat with" },
  { id: "except", label: "My chats except…", hint: "Hide it from people you pick" },
  { id: "selected", label: "Only share with…", hint: "Just the people you pick" },
];

const StatusComposer = ({ open, onClose, contacts }) => {
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState("chats");
  const [picked, setPicked] = useState(new Set());
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [maxMb, setMaxMb] = useState(50);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    api.get("/upload/limits").then(({ data }) => data?.maxMb && setMaxMb(data.maxMb)).catch(() => {});
  }, [open]);

  const reset = () => {
    setMode("text");
    setText("");
    setBgColor(BG_COLORS[0]);
    setFile(null);
    setCaption("");
    setAudience("chats");
    setPicked(new Set());
    setError("");
    setProgress(0);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  // Preview URLs are temporary and only used on this screen; what gets
  // posted is the uploaded file's permanent path.
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      setError("Choose a photo or a video.");
      return;
    }
    if (f.size > maxMb * 1024 * 1024) {
      setError(`That file is ${fmtBytes(f.size)} — the limit is ${maxMb}MB.`);
      return;
    }
    setError("");
    setFile(f);
  };

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canPost =
    !posting &&
    (mode === "text" ? text.trim().length > 0 : !!file) &&
    (audience !== "selected" || picked.size > 0);

  const post = async () => {
    setError("");
    setPosting(true);
    try {
      const base = { audience, audienceUsers: audience === "chats" ? [] : Array.from(picked) };
      if (mode === "text") {
        await api.post("/status", { ...base, type: "text", text: text.trim(), bgColor });
      } else {
        const uploaded = await uploadFile(file, { onProgress: setProgress });
        await api.post("/status", {
          ...base,
          type: file.type.startsWith("video/") ? "video" : "image",
          mediaPath: uploaded.path,
          mimeType: uploaded.mimeType || file.type,
          caption: caption.trim(),
        });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't post your status. Try again."));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal open={open} onClose={posting ? () => {} : onClose} title="New status">
      <div className="grid grid-cols-2 gap-1 bg-chat rounded-xl p-1 mb-4">
        {[
          { id: "text", label: "Text", icon: Type },
          { id: "media", label: "Photo / Video", icon: ImageIcon },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`min-h-[44px] rounded-lg flex items-center justify-center gap-2 text-sm transition-colors ${
              mode === t.id ? "bg-ember/15 text-ember" : "text-muted hover:text-ink"
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {mode === "text" ? (
        <div>
          <div
            className="rounded-2xl min-h-[180px] flex items-center justify-center p-4 transition-colors"
            style={{ background: bgColor }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={700}
              rows={4}
              placeholder="Type a status"
              aria-label="Status text"
              className="w-full bg-transparent text-white text-center text-xl font-display font-medium outline-none resize-none placeholder:text-white/60"
            />
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap" role="radiogroup" aria-label="Background color">
            {BG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBgColor(c)}
                role="radio"
                aria-checked={bgColor === c}
                aria-label={`Background ${c}`}
                className="w-9 h-9 rounded-full border-2 flex items-center justify-center"
                style={{ background: c, borderColor: bgColor === c ? "white" : "transparent" }}
              >
                {bgColor === c && <Check size={14} className="text-white" />}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted">{text.length}/700</span>
          </div>
        </div>
      ) : (
        <div>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={pickFile} />
          {file && previewUrl ? (
            <div className="rounded-2xl overflow-hidden bg-black flex items-center justify-center max-h-[300px]">
              {file.type.startsWith("video/") ? (
                <video src={previewUrl} controls playsInline className="max-h-[300px] w-full" />
              ) : (
                <img src={previewUrl} alt="Status preview" className="max-h-[300px] w-full object-contain" />
              )}
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full min-h-[160px] rounded-2xl border-2 border-dashed border-white/15 hover:border-ember/50 text-muted hover:text-ink flex flex-col items-center justify-center gap-2 transition-colors"
            >
              <ImageIcon size={28} className="text-ember" />
              <span className="text-sm">Choose a photo or video</span>
              <span className="text-xs">Up to {maxMb}MB</span>
            </button>
          )}
          {file && (
            <>
              <div className="flex items-center justify-between gap-2 mt-2 text-xs text-muted">
                <span className="truncate">{file.name} · {fmtBytes(file.size)}</span>
                <button onClick={() => fileRef.current?.click()} className="text-ember flex-shrink-0 min-h-[36px] px-2">Change</button>
              </div>
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={300}
                placeholder="Add a caption"
                aria-label="Caption"
                className="w-full mt-2 bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-xl px-3.5 py-2.5 text-base sm:text-sm"
              />
            </>
          )}
        </div>
      )}

      <fieldset className="mt-5">
        <legend className="text-xs uppercase tracking-wide text-muted mb-2">Who can see this</legend>
        <div className="space-y-1.5">
          {AUDIENCES.map((a) => (
            <label
              key={a.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer min-h-[48px] ${
                audience === a.id ? "border-ember/50 bg-ember/5" : "border-white/5 hover:bg-white/5"
              }`}
            >
              <input type="radio" name="audience" checked={audience === a.id} onChange={() => setAudience(a.id)} className="mt-1 accent-[rgb(var(--color-accent))]" />
              <span className="min-w-0">
                <span className="block text-sm">{a.label}</span>
                <span className="block text-xs text-muted">{a.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {audience !== "chats" && (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/5 bg-chat">
            {contacts.length === 0 ? (
              <p className="text-sm text-muted p-3">Start a chat with someone first.</p>
            ) : (
              contacts.map((c) => (
                <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer min-h-[48px]">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="accent-[rgb(var(--color-accent))] w-4 h-4" />
                  <Avatar name={c.name} src={c.avatar} size={30} />
                  <span className="text-sm truncate">{c.name}</span>
                </label>
              ))
            )}
          </div>
        )}
      </fieldset>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-3 py-2">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      <button
        onClick={post}
        disabled={!canPost}
        className="mt-5 w-full min-h-[48px] rounded-xl bg-ember text-bg font-medium flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-40 transition"
      >
        {posting ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}
        {posting ? (mode === "media" && progress ? `Uploading ${progress}%` : "Posting…") : "Post status"}
      </button>
    </Modal>
  );
};

export default StatusComposer;
