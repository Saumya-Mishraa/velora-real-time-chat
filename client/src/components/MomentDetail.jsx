import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, ImagePlus, NotebookPen, Pencil, Trash2, Share2, X, ChevronLeft, ChevronRight,
  Play, Users, Loader2, AlertCircle, Check, Star, Sparkles,
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import Modal from "./Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import api from "../services/api.js";
import { mediaUrl, uploadFile, fmtBytes, errorMessage } from "../utils/media.js";
import { countsLabel } from "./MomentsPanel.jsx";

const fmtDate = (d) => new Date(d).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });

// Full-screen gallery with captions, keyboard + swipe navigation.
const Gallery = ({ items, index, setIndex, onClose, canEdit, onSaveCaption, onDelete, onSetCover, isCover }) => {
  const item = items[index];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const touch = useRef(null);

  useEffect(() => {
    setEditing(false);
    setDraft(item?.text || "");
  }, [item?._id, item?.text]);

  const go = useCallback((d) => setIndex((i) => (i + d + items.length) % items.length), [items.length, setIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (editing) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, editing]);

  if (!item) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[98] bg-black/95 text-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Moment gallery"
    >
      <div className="flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2">
        <span className="text-sm text-white/70 tabular-nums flex-1">{index + 1} / {items.length}</span>
        {canEdit && item.kind === "photo" && (
          <button onClick={() => onSetCover(item)} aria-label="Use as cover" title="Use as cover" className={`w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center ${isCover ? "text-amber" : ""}`}>
            <Star size={19} fill={isCover ? "currentColor" : "none"} />
          </button>
        )}
        {canEdit && (
          <>
            <button onClick={() => setEditing(true)} aria-label="Edit caption" className="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center"><Pencil size={18} /></button>
            <button onClick={() => onDelete(item)} aria-label="Remove from Moment" className="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center"><Trash2 size={18} /></button>
          </>
        )}
        <button onClick={onClose} aria-label="Close gallery" className="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center"><X size={22} /></button>
      </div>

      <div
        className="flex-1 min-h-0 relative flex items-center justify-center px-2"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {item.kind === "photo" ? (
          <img src={mediaUrl(item.url)} alt={item.text || item.name || "Photo"} className="max-w-full max-h-full object-contain" />
        ) : (
          <video key={item._id} src={mediaUrl(item.url)} controls playsInline className="max-w-full max-h-full" />
        )}
        {items.length > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="Previous" className="hidden sm:flex absolute left-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center"><ChevronLeft size={22} /></button>
            <button onClick={() => go(1)} aria-label="Next" className="hidden sm:flex absolute right-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center"><ChevronRight size={22} /></button>
          </>
        )}
      </div>

      <div className="px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] min-h-[72px]">
        {editing ? (
          <div className="max-w-xl mx-auto flex items-start gap-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Add a caption"
              aria-label="Caption"
              className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-base outline-none resize-none"
            />
            <button onClick={() => { onSaveCaption(item, draft); setEditing(false); }} aria-label="Save caption" className="w-11 h-11 rounded-full bg-ember text-bg flex items-center justify-center flex-shrink-0"><Check size={18} /></button>
          </div>
        ) : (
          <div className="max-w-xl mx-auto text-center">
            <p className="text-sm sm:text-base break-words whitespace-pre-wrap">{item.text || <span className="text-white/40">No caption</span>}</p>
            <p className="text-xs text-white/50 mt-1">{fmtDate(item.date)}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const MomentDetail = ({ momentId, conversations, onBack, onEdit, onDeleted, onUpsert, onOpenChat }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [moment, setMoment] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [uploading, setUploading] = useState(null); // { done, total }
  const [error, setError] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryText, setMemoryText] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingMemory, setEditingMemory] = useState(null); // { id, text }
  const fileRef = useRef(null);

  const apply = useCallback(
    (m) => {
      setMoment(m);
      onUpsert?.(m);
    },
    [onUpsert]
  );

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/moments/${momentId}`);
      setMoment(data.moment);
      setStatus("ready");
    } catch (err) {
      setStatus(err?.response?.status === 404 ? "missing" : "error");
    }
  }, [momentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: someone added a photo / edited a caption / removed me.
  useEffect(() => {
    if (!socket) return undefined;
    const onUpdated = ({ moment: m }) => m._id === momentId && load();
    const onGone = ({ momentId: id }) => id === momentId && setStatus("missing");
    socket.on("moment:updated", onUpdated);
    socket.on("moment:deleted", onGone);
    return () => {
      socket.off("moment:updated", onUpdated);
      socket.off("moment:deleted", onGone);
    };
  }, [socket, momentId, load]);

  const media = useMemo(() => (moment?.items || []).filter((i) => i.kind !== "memory"), [moment]);
  const memories = useMemo(() => (moment?.items || []).filter((i) => i.kind === "memory"), [moment]);
  const canEditItem = (item) => moment && (moment.isOwner || item.addedBy === user.id);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (files.length === 0) return setError("Choose photos or videos.");
    setError("");
    setUploading({ done: 0, total: files.length });
    const items = [];
    for (const f of files) {
      try {
        const up = await uploadFile(f);
        items.push({ path: up.path, name: up.name, size: up.size, mimeType: up.mimeType, date: new Date(f.lastModified || Date.now()).toISOString() });
      } catch (err) {
        setError(`"${f.name}": ${errorMessage(err, "upload failed")}`);
      }
      setUploading((u) => ({ ...u, done: u.done + 1 }));
    }
    try {
      if (items.length) {
        const { data } = await api.post(`/moments/${momentId}/items`, { items });
        apply(data.moment);
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't add those to the Moment."));
    } finally {
      setUploading(null);
    }
  };

  const addMemory = async () => {
    if (!memoryText.trim()) return;
    try {
      const { data } = await api.post(`/moments/${momentId}/items`, { kind: "memory", text: memoryText.trim() });
      apply(data.moment);
      setMemoryText("");
      setMemoryOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that memory."));
    }
  };

  const saveItemText = async (item, text) => {
    try {
      const { data } = await api.patch(`/moments/${momentId}/items/${item._id}`, { text });
      apply(data.moment);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save."));
    }
  };

  const deleteItem = async (item) => {
    try {
      const { data } = await api.delete(`/moments/${momentId}/items/${item._id}`);
      apply(data.moment);
      if (galleryIndex !== null) {
        if (data.moment.items.filter((i) => i.kind !== "memory").length === 0) setGalleryIndex(null);
        else setGalleryIndex((i) => Math.min(i, data.moment.items.filter((x) => x.kind !== "memory").length - 1));
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove that."));
    }
  };

  const setCover = async (item) => {
    try {
      const { data } = await api.patch(`/moments/${momentId}`, { coverItem: item._id });
      apply(data.moment);
    } catch (err) {
      setError(errorMessage(err, "Couldn't set the cover."));
    }
  };

  const deleteMoment = async () => {
    try {
      await api.delete(`/moments/${momentId}`);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete this Moment."));
      setConfirmDelete(false);
    }
  };

  const shareToChat = async (conversation) => {
    try {
      const { data } = await api.post(`/moments/${momentId}/share`, { conversationId: conversation._id });
      apply(data.moment);
      setShareOpen(false);
      onOpenChat(conversation._id);
    } catch (err) {
      setError(errorMessage(err, "Couldn't share this Moment."));
      setShareOpen(false);
    }
  };

  if (status === "loading") {
    return <div className="flex-1 flex items-center justify-center text-muted text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading Moment…</div>;
  }
  if (status !== "ready" || !moment) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3 px-6 text-center">
        <p>{status === "missing" ? "This Moment isn't available any more." : "Couldn't load this Moment."}</p>
        <button onClick={onBack} className="px-4 min-h-[44px] rounded-full bg-white/5 hover:bg-white/10 text-ink text-sm">Back to Moments</button>
      </div>
    );
  }

  const shareable = conversations.filter((c) => !c.mySettings?.archived);

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-chat">
      <header className="flex items-center gap-2 px-3 sm:px-5 py-3 border-b border-white/5 bg-chat/80 backdrop-blur flex-shrink-0">
        <button onClick={onBack} className="sm:hidden w-10 h-10 -ml-1 flex items-center justify-center text-muted hover:text-ink" aria-label="Back to Moments">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg sm:text-xl font-semibold truncate">{moment.title}</h1>
          <p className="text-xs text-muted truncate">{countsLabel(moment.counts)} · {fmtDate(moment.date)}</p>
        </div>
        {moment.isOwner && (
          <>
            <button onClick={() => setShareOpen(true)} aria-label="Share Moment to a chat" title="Share to a chat" className="w-10 h-10 rounded-full text-muted hover:text-ember hover:bg-white/5 flex items-center justify-center"><Share2 size={18} /></button>
            <button onClick={() => onEdit(moment)} aria-label="Edit Moment" title="Edit" className="w-10 h-10 rounded-full text-muted hover:text-ink hover:bg-white/5 flex items-center justify-center"><Pencil size={18} /></button>
            <button onClick={() => setConfirmDelete(true)} aria-label="Delete Moment" title="Delete" className="w-10 h-10 rounded-full text-muted hover:text-red-400 hover:bg-white/5 flex items-center justify-center"><Trash2 size={18} /></button>
          </>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {/* Hero */}
        <div className="px-3 sm:px-6 pt-4">
          {moment.description && <p className="text-sm text-muted whitespace-pre-wrap break-words mb-3">{moment.description}</p>}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="flex items-center gap-1.5 text-xs text-muted bg-white/5 rounded-full pl-1 pr-3 py-1">
              <Avatar name={moment.owner.name} src={moment.owner.avatar} size={20} /> {moment.isOwner ? "You" : moment.owner.name}
            </span>
            {moment.members.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted bg-white/5 rounded-full px-3 py-1.5 min-w-0">
                <Users size={12} className="flex-shrink-0" />
                <span className="truncate">{moment.members.map((m) => m.name).join(", ")}</span>
              </span>
            )}
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={!!uploading} className="min-h-[44px] px-4 rounded-full bg-ember text-bg text-sm font-medium flex items-center gap-2 hover:brightness-110 disabled:opacity-50">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {uploading ? `Uploading ${uploading.done}/${uploading.total}` : "Add photos & videos"}
            </button>
            <button onClick={() => setMemoryOpen(true)} className="min-h-[44px] px-4 rounded-full bg-white/5 hover:bg-white/10 text-sm flex items-center gap-2">
              <NotebookPen size={16} /> Add memory
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-3 py-2">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span className="flex-1 min-w-0 break-words">{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss" className="p-1 flex-shrink-0"><X size={13} /></button>
            </div>
          )}
        </div>

        {/* Gallery grid */}
        <section className="px-3 sm:px-6" aria-label="Photos and videos">
          {media.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 text-center text-muted text-sm py-12 px-6">
              <Sparkles size={26} className="mx-auto mb-2 text-ember" />
              No photos or videos yet. Add the first ones to start the gallery.
            </div>
          ) : (
            <div className="grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2">
              {media.map((item, i) => (
                <button
                  key={item._id}
                  onClick={() => setGalleryIndex(i)}
                  aria-label={`Open ${item.kind} ${i + 1}${item.text ? `: ${item.text}` : ""}`}
                  className={`relative aspect-square rounded-xl overflow-hidden bg-black/30 group ${i === 0 && media.length > 4 ? "col-span-2 row-span-2" : ""}`}
                >
                  {item.kind === "photo" ? (
                    <img src={mediaUrl(item.url)} alt={item.text || ""} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <>
                      <video src={`${mediaUrl(item.url)}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center"><Play size={18} fill="white" /></span></span>
                    </>
                  )}
                  {item.text && <span className="absolute bottom-0 inset-x-0 px-2 py-1.5 text-[11px] text-left text-white truncate bg-gradient-to-t from-black/70 to-transparent">{item.text}</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Memories */}
        {memories.length > 0 && (
          <section className="px-3 sm:px-6 mt-6 pb-8" aria-label="Memories">
            <h2 className="text-xs uppercase tracking-wide text-muted mb-2">Memories</h2>
            <div className="space-y-2">
              {memories.map((m) => (
                <article key={m._id} className="rounded-2xl bg-sidebar/70 border border-white/5 px-4 py-3">
                  {editingMemory?.id === m._id ? (
                    <div className="flex items-start gap-2">
                      <textarea
                        autoFocus
                        value={editingMemory.text}
                        onChange={(e) => setEditingMemory({ id: m._id, text: e.target.value })}
                        rows={3}
                        maxLength={2000}
                        aria-label="Edit memory"
                        className="flex-1 min-w-0 bg-chat border border-white/10 rounded-xl px-3 py-2 text-base sm:text-sm outline-none resize-none"
                      />
                      <button onClick={() => { if (editingMemory.text.trim()) saveItemText(m, editingMemory.text.trim()); setEditingMemory(null); }} aria-label="Save memory" className="w-10 h-10 rounded-full bg-ember text-bg flex items-center justify-center flex-shrink-0"><Check size={16} /></button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted flex-1">{fmtDate(m.date)}</span>
                        {canEditItem(m) && (
                          <>
                            <button onClick={() => setEditingMemory({ id: m._id, text: m.text })} aria-label="Edit memory" className="w-9 h-9 rounded-full text-muted hover:text-ink hover:bg-white/5 flex items-center justify-center"><Pencil size={14} /></button>
                            <button onClick={() => deleteItem(m)} aria-label="Delete memory" className="w-9 h-9 rounded-full text-muted hover:text-red-400 hover:bg-white/5 flex items-center justify-center"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      <AnimatePresence>
        {galleryIndex !== null && media[galleryIndex] && (
          <Gallery
            items={media}
            index={galleryIndex}
            setIndex={setGalleryIndex}
            onClose={() => setGalleryIndex(null)}
            canEdit={canEditItem(media[galleryIndex])}
            onSaveCaption={saveItemText}
            onDelete={deleteItem}
            onSetCover={setCover}
            isCover={moment.coverItem === media[galleryIndex]._id}
          />
        )}
      </AnimatePresence>

      <Modal open={memoryOpen} onClose={() => setMemoryOpen(false)} title="Add a memory">
        <textarea
          autoFocus
          value={memoryText}
          onChange={(e) => setMemoryText(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="We got lost on the way up, found the best chai of our lives…"
          aria-label="Memory"
          className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-xl px-3.5 py-2.5 text-base sm:text-sm resize-none"
        />
        <button onClick={addMemory} disabled={!memoryText.trim()} className="mt-4 w-full min-h-[48px] rounded-xl bg-ember text-bg font-medium disabled:opacity-40 hover:brightness-110">Save memory</button>
      </Modal>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share Moment">
        <p className="text-sm text-muted mb-3">Everyone in the chat you pick can view this Moment and add to it.</p>
        <div className="max-h-72 overflow-y-auto -mx-1">
          {shareable.length === 0 ? (
            <p className="text-sm text-muted p-3">No chats yet.</p>
          ) : (
            shareable.map((c) => {
              const other = c.isGroup ? null : c.members.find((m) => (m.id || m._id) !== user.id);
              const label = c.isGroup ? c.name : other?.name;
              return (
                <button key={c._id} onClick={() => shareToChat(c)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-left min-h-[52px]">
                  <Avatar name={label} src={c.isGroup ? c.avatar : other?.avatar} size={36} />
                  <span className="truncate text-sm">{label}</span>
                </button>
              );
            })
          )}
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this Moment?">
        <p className="text-sm text-muted">“{moment.title}” and everything in it will be removed for everyone it's shared with.</p>
        <div className="flex gap-2 mt-5">
          <button onClick={() => setConfirmDelete(false)} className="flex-1 min-h-[46px] rounded-xl bg-white/5 hover:bg-white/10 text-sm">Cancel</button>
          <button onClick={deleteMoment} className="flex-1 min-h-[46px] rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-400">Delete</button>
        </div>
      </Modal>
    </div>
  );
};

export default MomentDetail;
