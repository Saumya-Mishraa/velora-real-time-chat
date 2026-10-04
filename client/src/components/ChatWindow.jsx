import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Info, Wifi, WifiOff, Loader2, Search, ChevronDown, ChevronUp, X, ArrowDown, Pin, Phone, Video, SearchX } from "lucide-react";
import Avatar from "./Avatar.jsx";
import OnlineIndicator from "./OnlineIndicator.jsx";
import MessageBubble from "./MessageBubble.jsx";
import MessageInput from "./MessageInput.jsx";
import TypingIndicator from "./TypingIndicator.jsx";
import MessageInfoModal from "./MessageInfoModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { useCall } from "../context/CallContext.jsx";
import api from "../services/api.js";
import { mediaUrl } from "../utils/media.js";

const otherMember = (conversation, userId) =>
  conversation && !conversation.isGroup
    ? conversation.members.find((m) => (m.id || m._id) !== userId)
    : null;

const timeAgo = (date) => {
  if (!date) return "";
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(date).toLocaleString();
};

// How far from the bottom (px) still counts as "at the bottom" for
// auto-scroll purposes. A little slack avoids missing a message purely
// because of sub-pixel scroll rounding.
const BOTTOM_THRESHOLD = 120;

const ChatWindow = ({ conversation, onlineUserIds, onBack, onOpenGroupDetails, onConversationUpdate, onOpenMoment, loadingConversation }) => {
  const { user } = useAuth();
  const { socket, connectionState } = useSocket();
  const { startCall, callState } = useCall();
  // Effects below depend on the conversation's *id*; the full object is
  // read from a ref so settings/members updates (wallpaper, pin, mute,
  // name changes...) never re-fetch messages or tear down listeners.
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const conversationId = conversation?._id;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [atBottom, setAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [highlightedId, setHighlightedId] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [sendError, setSendError] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const searchSeq = useRef(0);
  const searchDebounce = useRef(null);
  const [pinnedBarMessages, setPinnedBarMessages] = useState([]);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const typingClearTimeouts = useRef(new Map());
  const deliveredAckedIds = useRef(new Set());

  const isBlocked =
    !conversation?.isGroup &&
    (user.blockedUsers || []).some(
      (id) => String(id) === String(otherMember(conversation, user.id)?.id || otherMember(conversation, user.id)?._id)
    );

  // Dedupe + keep chronological order. The same message can legitimately
  // arrive twice (initial GET racing a socket event, a resync after
  // reconnect) — never render it twice.
  const mergeMessages = useCallback((incoming) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m._id, m]));
      incoming.forEach((m) => map.set(m._id, { ...map.get(m._id), ...m }));
      return Array.from(map.values()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    });
  }, []);

  const joinRoom = useCallback(() => {
    if (!socket || !conversationId) return;
    socket.emit("conversation:join", conversationId, () => {
      socket.emit("message:read", { conversationId });
    });
  }, [socket, conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setNewMessageCount(0);
    setAtBottom(true);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchDone(false);
    setPinnedBarMessages([]);
    deliveredAckedIds.current = new Set();

    api
      .get(`/messages/${conversationId}`)
      .then(({ data }) => !cancelled && setMessages(data.messages))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));

    api
      .get(`/messages/${conversationId}/pinned`)
      .then(({ data }) => !cancelled && setPinnedBarMessages(data.messages))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // (Re)join the room whenever the socket (re)connects or this chat opens.
  useEffect(() => {
    if (!socket || !conversationId) return;
    joinRoom();
    // After a reconnect Socket.IO doesn't replay missed events, so
    // re-sync from the API instead of trusting nothing was missed.
    const resync = () => {
      api.get(`/messages/${conversationId}`).then(({ data }) => mergeMessages(data.messages)).catch(() => {});
      joinRoom();
    };
    socket.io.on("reconnect", resync);
    return () => socket.io.off("reconnect", resync);
  }, [socket, conversationId, joinRoom, mergeMessages]);

  // Returning to a backgrounded tab / waking the laptop: catch up.
  useEffect(() => {
    if (!conversationId) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      api.get(`/messages/${conversationId}`).then(({ data }) => mergeMessages(data.messages)).catch(() => {});
      socket?.emit("message:read", { conversationId });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [conversationId, socket, mergeMessages]);

  // Acknowledge delivery for any message that arrives while this
  // conversation is mounted and isn't already accounted for (covers a
  // burst of messages fetched via the initial GET too, not just new
  // socket ones) — see section 5, "sender should never need to refresh".
  useEffect(() => {
    if (!socket || !conversationId || messages.length === 0) return;
    const toAck = messages
      .filter((m) => (m.sender?._id || m.sender) !== user.id)
      .filter((m) => !deliveredAckedIds.current.has(m._id))
      .filter((m) => !(m.deliveredTo || []).some((u) => (u.id || u._id || u) === user.id))
      .map((m) => m._id);
    if (toAck.length === 0) return;
    toAck.forEach((id) => deliveredAckedIds.current.add(id));
    socket.emit("message:delivered", { conversationId, messageIds: toAck });
  }, [socket, conversationId, messages, user.id]);

  useEffect(() => {
    if (!socket) return;

    const handleNew = (message) => {
      if (message.conversation !== conversationId) return;
      mergeMessages([message]);

      const scroller = scrollRef.current;
      const isAtBottom = scroller
        ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < BOTTOM_THRESHOLD
        : true;

      if (isAtBottom || (message.sender?._id || message.sender) === user.id) {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
        if ((message.sender?._id || message.sender) !== user.id) {
          socket.emit("message:read", { conversationId });
        }
      } else {
        setNewMessageCount((c) => c + 1);
      }
    };

    const handleTypingStart = ({ conversationId: cid, userId }) => {
      if (cid !== conversationId || userId === user.id) return;
      const member = conversationRef.current?.members.find((m) => (m.id || m._id) === userId);
      setTypingUsers((prev) => new Map(prev).set(userId, member?.name || "Someone"));
      clearTimeout(typingClearTimeouts.current.get(userId));
      typingClearTimeouts.current.set(
        userId,
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.delete(userId);
            return next;
          });
        }, 3000)
      );
    };

    const handleTypingStop = ({ conversationId: cid, userId }) => {
      if (cid !== conversationId) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };

    const handleReaction = ({ messageId, reactions }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)));
    };

    const handleDelivered = ({ conversationId: cid, userId, messageIds }) => {
      if (cid !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          messageIds.includes(m._id) && !(m.deliveredTo || []).some((u) => (u.id || u._id || u) === userId)
            ? { ...m, deliveredTo: [...(m.deliveredTo || []), userId] }
            : m
        )
      );
    };

    const handleSeen = ({ conversationId: cid, userId, messageIds }) => {
      if (cid !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          messageIds.includes(m._id) && !(m.readBy || []).some((u) => (u.id || u._id || u) === userId)
            ? { ...m, readBy: [...(m.readBy || []), userId] }
            : m
        )
      );
    };

    const handleEdit = ({ messageId, text, editedAt }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, text, edited: true, editedAt } : m))
      );
    };

    const handleDelete = ({ messageId, mode }) => {
      if (mode === "everyone") {
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? { ...m, deletedForEveryone: true, deleted: true } : m))
        );
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      }
    };

    const handlePin = ({ messageId, pinned }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, pinned } : m)));
      if (conversationId) {
        api.get(`/messages/${conversationId}/pinned`).then(({ data }) => setPinnedBarMessages(data.messages)).catch(() => {});
      }
    };

    socket.on("message:new", handleNew);
    socket.on("typing:start", handleTypingStart);
    socket.on("typing:stop", handleTypingStop);
    socket.on("message:reaction", handleReaction);
    socket.on("message:delivered", handleDelivered);
    socket.on("message:seen", handleSeen);
    socket.on("message:edit", handleEdit);
    socket.on("message:delete", handleDelete);
    socket.on("message:pin", handlePin);

    return () => {
      socket.off("message:new", handleNew);
      socket.off("typing:start", handleTypingStart);
      socket.off("typing:stop", handleTypingStop);
      socket.off("message:reaction", handleReaction);
      socket.off("message:delivered", handleDelivered);
      socket.off("message:seen", handleSeen);
      socket.off("message:edit", handleEdit);
      socket.off("message:delete", handleDelete);
      socket.off("message:pin", handlePin);
    };
  }, [socket, conversationId, user.id, mergeMessages]);

  // Typing timers belong to the conversation; clear them when it changes.
  useEffect(() => {
    const timeouts = typingClearTimeouts.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
      setTypingUsers(new Map());
    };
  }, [conversationId]);

  // Opens the chat scrolled to the bottom / preserves reading position —
  // only auto-scroll on the very first render of a conversation, not on
  // every message array change (new-message handling above already
  // decides scroll behavior for live messages).
  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, conversationId]);

  const handleScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < BOTTOM_THRESHOLD;
    setAtBottom(isAtBottom);
    if (isAtBottom) setNewMessageCount(0);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMessageCount(0);
  };

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const ensureLoadedRef = useRef(null);

  const jumpToMessage = useCallback(async (messageId) => {
    const found = (await ensureLoadedRef.current?.(messageId)) ?? !!document.getElementById(`message-${messageId}`);
    const el = document.getElementById(`message-${messageId}`);
    if (found && el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(messageId);
      setTimeout(() => setHighlightedId((cur) => (cur === messageId ? null : cur)), 2200);
    }
  }, []);

  // In-chat search. Debounced, race-safe (a slow response for an old
  // query can't overwrite a newer one), and always ends in one of three
  // visible states: results, "No messages found", or an error.
  const runSearch = (q) => {
    setSearchQuery(q);
    clearTimeout(searchDebounce.current);
    const seq = ++searchSeq.current;
    if (!q.trim()) {
      setSearchResults([]);
      setSearchDone(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/messages/${conversationId}/search`, { params: { q: q.trim() } });
        if (seq !== searchSeq.current) return;
        // Oldest -> newest so "next" moves down the conversation.
        const results = [...data.messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        setSearchResults(results);
        setSearchIndex(results.length ? results.length - 1 : 0);
        setSearchDone(true);
        if (results.length) jumpToMessage(results[results.length - 1]._id);
      } catch {
        if (seq !== searchSeq.current) return;
        setSearchResults([]);
        setSearchDone(true);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
  };

  const closeSearch = () => {
    clearTimeout(searchDebounce.current);
    searchSeq.current += 1;
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchDone(false);
    setSearching(false);
  };

  const stepSearch = (dir) => {
    if (searchResults.length === 0) return;
    const next = (searchIndex + dir + searchResults.length) % searchResults.length;
    setSearchIndex(next);
    jumpToMessage(searchResults[next]._id);
  };

  useEffect(() => () => clearTimeout(searchDebounce.current), []);

  // Results can sit above the loaded window (older than what's rendered).
  // Pull in history until the target message is in the DOM, then scroll.
  const ensureMessageLoaded = useCallback(
    async (messageId) => {
      if (document.getElementById(`message-${messageId}`)) return true;
      for (let i = 0; i < 12; i += 1) {
        const first = messagesRef.current[0];
        if (!first) return false;
        try {
          const { data } = await api.get(`/messages/${conversationId}`, {
            params: { before: first.createdAt, limit: 50 },
          });
          if (!data.messages.length) return false;
          mergeMessages(data.messages);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          if (document.getElementById(`message-${messageId}`)) return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    [conversationId, mergeMessages]
  );

  // Unread separator: first message not sent by me and not yet in my
  // readBy, computed once per load rather than re-derived every render.
  const firstUnreadId = useMemo(() => {
    const firstUnread = messages.find(
      (m) => (m.sender?._id || m.sender) !== user.id && !(m.readBy || []).some((u) => (u.id || u._id || u) === user.id)
    );
    return firstUnread?._id || null;
  }, [messages, user.id]);

  ensureLoadedRef.current = ensureMessageLoaded;

  if (!conversation && loadingConversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        <Loader2 size={18} className="animate-spin mr-2" /> Opening chat…
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="text-center">
          <p className="font-display text-xl mb-1">Select a conversation</p>
          <p className="text-sm">Choose a chat from the sidebar to start messaging.</p>
        </div>
      </div>
    );
  }

  const other = otherMember(conversation, user.id);
  const label = conversation.isGroup ? conversation.name : other?.name;
  const isOnline = other && onlineUserIds.has(String(other.id || other._id));
  const typingNames = Array.from(typingUsers.values());

  const send = (payload) => {
    if (!socket?.connected) {
      setSendError("You're offline. Reconnecting — try again in a moment.");
      return false;
    }
    socket.emit("message:send", { conversationId: conversation._id, ...payload }, (res) => {
      if (res?.error) setSendError(res.error);
      else if (res?.message) mergeMessages([res.message]);
    });
    setSendError("");
    return true;
  };

  const handleTyping = (isTyping) => {
    socket?.emit(isTyping ? "typing:start" : "typing:stop", { conversationId: conversation._id });
  };

  const handleDeleteForMe = (message) => {
    socket?.emit("message:delete", { messageId: message._id, mode: "me" }, (res) => {
      if (res?.error) return alert(res.error);
      setMessages((prev) => prev.filter((m) => m._id !== message._id));
    });
  };

  const handleDeleteForEveryone = (message) => {
    socket?.emit("message:delete", { messageId: message._id, mode: "everyone" });
  };

  const handleReact = (message, emoji) => {
    socket?.emit("message:react", { messageId: message._id, emoji });
  };

  const handleEdit = (message, text) => {
    socket?.emit("message:edit", { messageId: message._id, text });
  };

  const handlePin = (message) => {
    socket?.emit("message:pin", { messageId: message._id }, (res) => res?.error && alert(res.error));
  };

  const handleUnpin = (message) => {
    socket?.emit("message:unpin", { messageId: message._id }, (res) => res?.error && alert(res.error));
  };

  const wallpaper = mediaUrl(conversation.mySettings?.wallpaper);
  const canCall = !conversation.isGroup && !isBlocked && callState === "idle" && connectionState === "connected";

  return (
    <div
      className="flex-1 min-w-0 flex flex-col h-full bg-chat relative bg-cover bg-center overflow-hidden"
      style={wallpaper ? { backgroundImage: `url("${wallpaper}")` } : undefined}
    >
      {wallpaper && <div className="absolute inset-0 bg-bg/70 pointer-events-none" />}

      <div className="relative z-10 flex items-center gap-1 min-[400px]:gap-2 sm:gap-3 px-2 min-[400px]:px-3 sm:px-5 py-2.5 sm:py-4 border-b border-white/5 bg-chat/80 backdrop-blur">
        <button onClick={onBack} className="sm:hidden text-muted hover:text-ink w-9 h-9 min-[400px]:w-10 min-[400px]:h-10 flex items-center justify-center flex-shrink-0 rounded-full" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <button onClick={onOpenGroupDetails} className="relative flex-shrink-0 hidden min-[360px]:block">
          <Avatar name={label} src={mediaUrl(conversation.isGroup ? conversation.avatar : other?.avatar)} size={40} />
          {!conversation.isGroup && (
            <OnlineIndicator online={isOnline} className="absolute -bottom-0.5 -right-0.5" />
          )}
        </button>
        <button onClick={onOpenGroupDetails} className="flex-1 min-w-0 text-left pl-1 min-[360px]:pl-0">
          <p className="font-medium truncate">{label}</p>
          <p className="text-xs text-muted truncate">
            {typingNames.length > 0
              ? `${typingNames.join(" and ")} ${typingNames.length > 1 ? "are" : "is"} typing…`
              : conversation.isGroup
              ? `${conversation.members.length} members`
              : isOnline
              ? "Online"
              : other?.lastSeen
              ? `Last seen ${timeAgo(other.lastSeen)}`
              : "Offline"}
          </p>
        </button>

        {!conversation.isGroup && (
          <>
            <button
              onClick={() => startCall(conversation, "audio")}
              disabled={!canCall}
              className="w-9 h-9 min-[400px]:w-10 min-[400px]:h-10 flex items-center justify-center flex-shrink-0 rounded-full text-muted hover:text-ember hover:bg-white/5 transition-colors disabled:opacity-40 disabled:hover:text-muted disabled:hover:bg-transparent"
              title="Voice call"
              aria-label="Start voice call"
            >
              <Phone size={18} />
            </button>
            <button
              onClick={() => startCall(conversation, "video")}
              disabled={!canCall}
              className="w-9 h-9 min-[400px]:w-10 min-[400px]:h-10 flex items-center justify-center flex-shrink-0 rounded-full text-muted hover:text-ember hover:bg-white/5 transition-colors disabled:opacity-40 disabled:hover:text-muted disabled:hover:bg-transparent"
              title="Video call"
              aria-label="Start video call"
            >
              <Video size={18} />
            </button>
          </>
        )}

        <button
          onClick={() => (showSearch ? closeSearch() : setShowSearch(true))}
          className="w-9 h-9 min-[400px]:w-10 min-[400px]:h-10 flex items-center justify-center flex-shrink-0 rounded-full text-muted hover:text-ink hover:bg-white/5 transition-colors"
          title="Search in conversation"
          aria-label="Search in conversation"
        >
          <Search size={17} />
        </button>

        <div className="hidden sm:flex items-center gap-1 text-xs text-muted mr-1" title={`Connection: ${connectionState}`}>
          {connectionState === "connected" && <Wifi size={14} className="text-online" />}
          {connectionState === "connecting" && <Loader2 size={14} className="animate-spin text-amber" />}
          {connectionState === "offline" && <WifiOff size={14} className="text-muted" />}
        </div>

        <button
          onClick={onOpenGroupDetails}
          className="w-9 h-9 min-[400px]:w-10 min-[400px]:h-10 flex items-center justify-center flex-shrink-0 rounded-full text-muted hover:text-ink hover:bg-white/5 transition-colors"
          aria-label="Chat info"
        >
          <Info size={18} />
        </button>
      </div>

      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-10 bg-chat/95 backdrop-blur border-b border-white/5 px-3 sm:px-4 py-2 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Search size={14} className="text-muted flex-shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => runSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") stepSearch(e.shiftKey ? -1 : 1);
                  if (e.key === "Escape") closeSearch();
                }}
                placeholder="Search messages"
                aria-label="Search messages"
                className="flex-1 bg-transparent outline-none text-base sm:text-sm placeholder:text-muted min-w-0 py-1"
              />
              {searching && <Loader2 size={14} className="animate-spin text-muted flex-shrink-0" />}
              {searchResults.length > 0 && (
                <span className="text-xs text-muted flex-shrink-0 tabular-nums">
                  {searchIndex + 1}/{searchResults.length}
                </span>
              )}
              <button onClick={() => stepSearch(-1)} disabled={searchResults.length === 0} aria-label="Previous match" className="w-9 h-9 flex items-center justify-center flex-shrink-0 text-muted hover:text-ink disabled:opacity-30">
                <ChevronUp size={16} />
              </button>
              <button onClick={() => stepSearch(1)} disabled={searchResults.length === 0} aria-label="Next match" className="w-9 h-9 flex items-center justify-center flex-shrink-0 text-muted hover:text-ink disabled:opacity-30">
                <ChevronDown size={16} />
              </button>
              <button onClick={closeSearch} aria-label="Close search" className="w-9 h-9 flex items-center justify-center flex-shrink-0 text-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>
            {searchDone && !searching && searchQuery.trim() && searchResults.length === 0 && (
              <div role="status" className="flex items-center gap-2 text-sm text-muted pt-1 pb-2 pl-6">
                <SearchX size={15} className="flex-shrink-0" />
                <span className="min-w-0 break-words">No messages found for “{searchQuery.trim()}”</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {pinnedBarMessages.length > 0 && (
        <div className="relative z-10 flex items-center gap-2 px-4 py-1.5 bg-amber/10 border-b border-white/5 text-xs overflow-x-auto">
          <Pin size={12} className="text-amber flex-shrink-0" />
          <button
            onClick={() => jumpToMessage(pinnedBarMessages[0]._id)}
            className="truncate hover:underline"
          >
            {pinnedBarMessages[0].text || "Pinned attachment"}
          </button>
          {pinnedBarMessages.length > 1 && (
            <span className="text-muted flex-shrink-0">+{pinnedBarMessages.length - 1} more</span>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-8 pb-4"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted text-sm text-center px-8">
            Say hello and start the conversation.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <React.Fragment key={m._id}>
                {m._id === firstUnreadId && (
                  <div className="flex items-center gap-3 px-6 py-2">
                    <div className="flex-1 h-px bg-ember/30" />
                    <span className="text-[10px] uppercase tracking-wide text-ember">Unread messages</span>
                    <div className="flex-1 h-px bg-ember/30" />
                  </div>
                )}
                <MessageBubble
                  message={m}
                  isOwn={(m.sender?._id || m.sender) === user.id}
                  isGroup={conversation.isGroup}
                  currentUserId={user.id}
                  memberCount={conversation.members.length}
                  showSender={conversation.isGroup && (i === 0 || (messages[i - 1].sender?._id || messages[i - 1].sender) !== (m.sender?._id || m.sender))}
                  highlighted={highlightedId === m._id}
                  highlightTerm={showSearch ? searchQuery.trim() : ""}
                  isCurrentMatch={showSearch && searchResults[searchIndex]?._id === m._id}
                  isMatch={showSearch && searchResults.some((r) => r._id === m._id)}
                  onOpenMoment={onOpenMoment}
                  onReply={setReplyTo}
                  onDeleteForMe={handleDeleteForMe}
                  onDeleteForEveryone={handleDeleteForEveryone}
                  onReact={handleReact}
                  onEdit={handleEdit}
                  onPin={handlePin}
                  onUnpin={handleUnpin}
                  onShowInfo={(msg) => setInfoMessage(msg)}
                  onJumpToMessage={jumpToMessage}
                />
              </React.Fragment>
            ))}
          </AnimatePresence>
        )}
        {typingNames.length > 0 && <TypingIndicator name={typingNames.join(" and ")} />}
        <div ref={bottomRef} />
      </div>

      <AnimatePresence>
        {!atBottom && newMessageCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onClick={scrollToBottom}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-ember text-bg text-xs font-medium px-4 py-2 rounded-full shadow-lg"
          >
            <ArrowDown size={14} /> {newMessageCount} New Message{newMessageCount > 1 ? "s" : ""}
          </motion.button>
        )}
      </AnimatePresence>

      <div className="relative z-10">
        {sendError && (
          <div role="alert" className="mx-3 mb-1 flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-lg px-3 py-2">
            <span className="flex-1 min-w-0">{sendError}</span>
            <button onClick={() => setSendError("")} aria-label="Dismiss" className="flex-shrink-0 p-1"><X size={12} /></button>
          </div>
        )}
        <MessageInput
          conversationId={conversation._id}
          onSend={send}
          onTyping={handleTyping}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          disabled={isBlocked}
          disabledReason={isBlocked ? "You've blocked this contact. Unblock them from chat info to send messages." : ""}
        />
      </div>

      <MessageInfoModal
        messageId={infoMessage?._id}
        sentAt={infoMessage?.createdAt}
        onClose={() => setInfoMessage(null)}
      />
    </div>
  );
};

export default ChatWindow;
