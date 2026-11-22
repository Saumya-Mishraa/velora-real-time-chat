import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Star, Search, Loader2, Mic, Image as ImageIcon, Film, FileText, Music, Sparkles } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import api from "../services/api.js";
import { describeMessage } from "../utils/messageKinds.js";
import { mediaUrl } from "../utils/media.js";

const KIND_ICON = { image: ImageIcon, gif: ImageIcon, sticker: ImageIcon, video: Film, voice: Mic, audio: Music, file: FileText, moment: Sparkles };

const fmtDate = (d) => {
  const date = new Date(d);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString([], { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
};

// Sidebar panel listing every message the person has starred.
const StarredPanel = ({ conversations, onBack, onOpen }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/messages/starred");
      setMessages(data.messages || []);
    } catch {
      setError("Couldn't load starred messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Starring/unstarring on another device or in the open chat.
  useEffect(() => {
    if (!socket) return undefined;
    const onStar = ({ messageId, starred }) => {
      if (starred) load();
      else setMessages((prev) => prev.filter((m) => m._id !== messageId));
    };
    const onDelete = ({ messageId, mode }) => mode === "everyone" && setMessages((prev) => prev.filter((m) => m._id !== messageId));
    socket.on("message:star", onStar);
    socket.on("message:delete", onDelete);
    return () => {
      socket.off("message:star", onStar);
      socket.off("message:delete", onDelete);
    };
  }, [socket, load]);

  const labelFor = useMemo(() => {
    const map = new Map();
    (conversations || []).forEach((c) => {
      const other = !c.isGroup ? c.members.find((m) => String(m.id || m._id) !== String(user.id)) : null;
      map.set(c._id, { label: c.isGroup ? c.name : other?.name || "Unknown", avatar: c.isGroup ? c.avatar : other?.avatar });
    });
    return map;
  }, [conversations, user.id]);

  const unstar = async (m) => {
    setMessages((prev) => prev.filter((x) => x._id !== m._id));
    try {
      await api.post(`/messages/single/${m._id}/unstar`);
    } catch {
      setMessages((prev) => [m, ...prev]);
    }
  };

  const shown = messages.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const chat = labelFor.get(m.conversation?._id || m.conversation)?.label || "";
    return `${m.text || ""} ${m.sender?.name || ""} ${chat}`.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 sm:px-4 pb-2 pt-1 flex items-center gap-1">
        <button onClick={onBack} aria-label="Back to chats" className="w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-white/5">
          <ArrowLeft size={18} />
        </button>
        <h2 className="font-display font-semibold flex items-center gap-2">
          <Star size={16} className="text-amber" fill="currentColor" /> Starred messages
        </h2>
      </div>
      <div className="px-4 sm:px-5 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search starred"
            aria-label="Search starred messages"
            className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-full pl-9 pr-3 py-2 text-sm placeholder:text-muted"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-2">
        {loading ? (
          <div className="flex justify-center mt-12 text-muted"><Loader2 size={18} className="animate-spin" /></div>
        ) : error ? (
          <div className="text-center text-sm text-muted mt-12 px-6">
            {error} <button className="text-ember underline" onClick={load}>Retry</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center text-muted text-sm mt-16 px-6">
            {messages.length === 0 ? "No starred messages yet. Open a message's menu and tap the star to save it here." : "No matches."}
          </div>
        ) : (
          shown.map((m) => {
            const convId = m.conversation?._id || m.conversation;
            const chat = labelFor.get(convId);
            const d = describeMessage(m);
            const Icon = KIND_ICON[d.kind];
            const mine = String(m.sender?._id || m.sender) === String(user.id);
            return (
              <div key={m._id} className="group relative flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-white/5 mb-0.5">
                <button type="button" onClick={() => onOpen(convId, m._id)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                  <Avatar name={chat?.label} src={chat?.avatar} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{mine ? "You" : m.sender?.name || "Someone"}{chat ? <span className="text-muted font-normal"> · {chat.label}</span> : null}</p>
                      <span className="text-[11px] text-muted flex-shrink-0">{fmtDate(m.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted truncate flex items-center gap-1">
                      {Icon && <Icon size={13} className="flex-shrink-0" />}
                      <span className="truncate">{d.text}</span>
                    </p>
                  </div>
                  {m.type === "image" && m.attachment?.url && (
                    <img src={mediaUrl(m.attachment.url)} alt="" loading="lazy" className="w-11 h-11 rounded-md object-cover flex-shrink-0" />
                  )}
                </button>
                <button
                  onClick={() => unstar(m)}
                  aria-label="Remove star"
                  title="Remove star"
                  className="w-9 h-9 flex items-center justify-center rounded-full text-amber hover:bg-white/10 flex-shrink-0"
                >
                  <Star size={15} fill="currentColor" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default StarredPanel;
