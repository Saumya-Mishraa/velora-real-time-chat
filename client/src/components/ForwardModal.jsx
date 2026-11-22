import React, { useEffect, useMemo, useState } from "react";
import { Search, Check, Send, Loader2, Ban } from "lucide-react";
import Modal from "./Modal.jsx";
import Avatar from "./Avatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { buildForwardPayload, describeMessage } from "../utils/messageKinds.js";
import { mediaUrl } from "../utils/media.js";

const MAX_TARGETS = 5;

const emitSend = (socket, payload) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: "Timed out." }), 15000);
    socket.emit("message:send", payload, (res) => {
      clearTimeout(timer);
      resolve(res || { error: "No response." });
    });
  });

// Forward one message to up to 5 existing chats. Sends through the normal
// `message:send` socket event with `forwarded: true`.
const ForwardModal = ({ open, message, conversations, onClose, onDone }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected([]);
      setError("");
      setSending(false);
    }
  }, [open]);

  const rows = useMemo(() => {
    const blocked = new Set((user?.blockedUsers || []).map(String));
    return (conversations || [])
      .map((c) => {
        const other = !c.isGroup ? c.members.find((m) => String(m.id || m._id) !== String(user.id)) : null;
        return {
          id: c._id,
          label: c.isGroup ? c.name : other?.name || "Unknown",
          avatar: c.isGroup ? c.avatar : other?.avatar,
          sub: c.isGroup ? `${c.members.length} members` : other?.username ? `@${other.username}` : "",
          blocked: !!other && blocked.has(String(other.id || other._id)),
          at: new Date(c.lastMessage?.createdAt || c.updatedAt || 0).getTime(),
        };
      })
      .filter((r) => r.label.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => b.at - a.at);
  }, [conversations, query, user]);

  const toggle = (row) => {
    if (row.blocked || sending) return;
    setError("");
    setSelected((prev) => {
      if (prev.includes(row.id)) return prev.filter((x) => x !== row.id);
      if (prev.length >= MAX_TARGETS) {
        setError(`You can forward to up to ${MAX_TARGETS} chats at once.`);
        return prev;
      }
      return [...prev, row.id];
    });
  };

  const send = async () => {
    if (!socket?.connected) return setError("You're offline. Reconnect and try again.");
    if (!message || selected.length === 0) return;
    setSending(true);
    setError("");
    const payload = buildForwardPayload(message);
    const failed = [];
    for (const id of selected) {
      // eslint-disable-next-line no-await-in-loop
      const res = await emitSend(socket, { conversationId: id, ...payload });
      if (res?.error) failed.push(id);
    }
    setSending(false);
    const okCount = selected.length - failed.length;
    if (failed.length === 0) {
      onDone?.({ sent: okCount, failed: 0 });
      onClose();
    } else {
      setSelected(failed); // keep only the failed ones so "Send" retries them
      setError(
        okCount > 0
          ? `Forwarded to ${okCount}, but ${failed.length} failed. Tap Send to retry those.`
          : "Couldn't forward. Check your connection and try again."
      );
      if (okCount > 0) onDone?.({ sent: okCount, failed: failed.length, silent: true });
    }
  };

  const d = message ? describeMessage(message) : null;

  return (
    <Modal open={open} onClose={sending ? () => {} : onClose} title="Forward message">
      {message && (
        <div className="flex items-center gap-3 bg-chat rounded-xl px-3 py-2 mb-3 border-l-2 border-ember">
          {message.type === "image" && message.attachment?.url && (
            <img src={mediaUrl(message.attachment.url)} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
          )}
          <p className="text-sm text-muted truncate min-w-0">{d.text}</p>
        </div>
      )}

      <div className="relative mb-2">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-full pl-9 pr-3 py-2 text-base sm:text-sm placeholder:text-muted"
        />
      </div>

      <div className="max-h-[42vh] overflow-y-auto -mx-1">
        {rows.length === 0 && <p className="text-sm text-muted text-center py-8">No chats found.</p>}
        {rows.map((r) => {
          const on = selected.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => toggle(r)}
              disabled={r.blocked}
              aria-pressed={on}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors ${
                r.blocked ? "opacity-50" : "hover:bg-white/5"
              }`}
            >
              <Avatar name={r.label} src={r.avatar} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{r.label}</p>
                <p className="text-xs text-muted truncate">{r.blocked ? "Blocked" : r.sub}</p>
              </div>
              {r.blocked ? (
                <Ban size={15} className="text-muted flex-shrink-0" />
              ) : (
                <span
                  className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                    on ? "bg-ember border-ember" : "border-white/20"
                  }`}
                >
                  {on && <Check size={12} className="text-bg" strokeWidth={3} />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={send}
        disabled={sending || selected.length === 0}
        className="mt-4 w-full min-h-[46px] flex items-center justify-center gap-2 rounded-full bg-ember text-bg font-medium hover:brightness-110 disabled:opacity-50"
      >
        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {sending ? "Forwarding…" : selected.length ? `Forward to ${selected.length} chat${selected.length > 1 ? "s" : ""}` : "Select chats"}
      </button>
    </Modal>
  );
};

export default ForwardModal;
