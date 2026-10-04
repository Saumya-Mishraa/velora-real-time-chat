import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MessageSquarePlus, Users, Settings, LogOut, Pin, BellOff, Archive, ChevronDown, Phone, Video, PhoneMissed, Mic, Image as ImageIcon, Film, FileText, Music } from "lucide-react";
import Avatar from "./Avatar.jsx";
import OnlineIndicator from "./OnlineIndicator.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useDrafts } from "../hooks/useDrafts.js";
import { fmtDuration } from "../utils/media.js";

const timeAgo = (date) => {
  if (!date) return "";
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
};

const conversationLabel = (conversation, currentUserId) => {
  if (conversation.isGroup) return conversation.name;
  const other = conversation.members.find((m) => m.id !== currentUserId && m._id !== currentUserId);
  return other?.name || "Unknown";
};

const isMuted = (conversation) => {
  const until = conversation.mySettings?.mutedUntil;
  return until && new Date(until) > new Date();
};

// One-line preview of a conversation's last message.
const previewFor = (message, currentUserId) => {
  if (!message) return { text: "No messages yet" };
  if (message.deletedForEveryone || message.deleted) return { text: "This message was deleted." };
  switch (message.type) {
    case "voice":
      return { icon: Mic, text: `Voice message${message.attachment?.duration ? ` · ${fmtDuration(message.attachment.duration)}` : ""}` };
    case "image":
      return { icon: ImageIcon, text: message.text || "Photo" };
    case "video":
      return { icon: Film, text: message.text || "Video" };
    case "audio":
      return { icon: Music, text: message.attachment?.name || "Audio" };
    case "file":
      return { icon: FileText, text: message.attachment?.name || "File" };
    case "call": {
      const c = message.call || {};
      const mine = (message.sender?._id || message.sender) === currentUserId;
      const kind = c.mode === "video" ? "video call" : "voice call";
      if (c.status === "missed") return { icon: PhoneMissed, danger: !mine, text: mine ? `No answer · ${kind}` : `Missed ${kind}` };
      if (c.status === "declined") return { icon: PhoneMissed, text: mine ? `Declined · ${kind}` : `You declined ${kind}` };
      if (c.status === "busy") return { icon: PhoneMissed, text: `Busy · ${kind}` };
      if (c.status === "canceled") return { icon: PhoneMissed, danger: !mine, text: mine ? `Canceled ${kind}` : `Missed ${kind}` };
      return { icon: c.mode === "video" ? Video : Phone, text: `${c.mode === "video" ? "Video" : "Voice"} call${c.duration ? ` · ${fmtDuration(c.duration)}` : ""}` };
    }
    default:
      return { text: message.shared?.kind === "moment" ? `Moment · ${message.shared.title}` : message.text || "Attachment" };
  }
};

const ConversationRow = ({ c, isActive, isOnline, other, label, onSelect, draft, currentUserId }) => {
  const preview = previewFor(c.lastMessage, currentUserId);
  const PreviewIcon = preview.icon;
  return (
  <motion.button
    initial={{ opacity: 0, x: -12 }}
    animate={{ opacity: 1, x: 0 }}
    onClick={() => onSelect(c)}
    className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 text-left transition-colors ${
      isActive ? "bg-ember/10" : "hover:bg-white/5"
    }`}
  >
    {isActive && (
      <motion.div layoutId="active-conversation" className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-ember" />
    )}
    <div className="relative flex-shrink-0">
      <Avatar name={label} src={c.isGroup ? c.avatar : other?.avatar} size={44} />
      {!c.isGroup && <OnlineIndicator online={isOnline} className="absolute -bottom-0.5 -right-0.5" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium truncate flex items-center gap-1">
          {c.mySettings?.pinned && <Pin size={11} className="text-amber flex-shrink-0" />}
          {label}
        </span>
        <span className="text-xs text-muted flex-shrink-0">{timeAgo(c.lastMessage?.createdAt || c.updatedAt)}</span>
      </div>
      <div className="flex items-center justify-between gap-1">
        {draft ? (
          <p className="text-sm text-muted truncate min-w-0">
            <span className="text-ember font-medium">Draft: </span>
            {draft.text.replace(/\s+/g, " ")}
          </p>
        ) : (
          <p className={`text-sm truncate min-w-0 flex items-center gap-1 ${preview.danger ? "text-red-400" : "text-muted"}`}>
            {PreviewIcon && <PreviewIcon size={13} className="flex-shrink-0" />}
            <span className="truncate">{preview.text}</span>
          </p>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isMuted(c) && <BellOff size={12} className="text-muted" />}
          {c.unreadCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-ember text-bg text-[10px] font-semibold flex items-center justify-center">
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  </motion.button>
);
};

const Sidebar = ({
  conversations,
  loaded = true,
  activeId,
  onSelect,
  onlineUserIds,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenSettings,
  section = "chats",
  tabs = [],
  onSectionChange,
  panel = null,
}) => {
  const { user, logout } = useAuth();
  const drafts = useDrafts();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const enriched = useMemo(
    () =>
      conversations.map((c) => ({
        ...c,
        _label: conversationLabel(c, user?.id),
        _other: !c.isGroup && c.members.find((m) => (m.id || m._id) !== user?.id),
      })),
    [conversations, user?.id]
  );

  const filtered = enriched.filter((c) => c._label.toLowerCase().includes(query.toLowerCase()));
  const active = filtered.filter((c) => !c.mySettings?.archived);
  const archived = filtered.filter((c) => c.mySettings?.archived);
  const sorted = [...active].sort((a, b) => {
    const pinDiff = (b.mySettings?.pinned ? 1 : 0) - (a.mySettings?.pinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    return new Date(b.lastMessage?.createdAt || b.updatedAt) - new Date(a.lastMessage?.createdAt || a.updatedAt);
  });

  return (
    <aside className="w-full sm:w-72 md:w-80 flex-shrink-0 min-w-0 bg-sidebar border-r border-white/5 flex flex-col h-full">
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-ember flex items-center justify-center font-display font-bold text-bg">
            V
          </div>
          <span className="font-display font-semibold text-lg tracking-tight">Velora</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenNewChat}
            title="New chat"
            aria-label="New chat"
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-ember hover:bg-white/5 transition-colors"
          >
            <MessageSquarePlus size={18} />
          </button>
          <button
            onClick={onOpenNewGroup}
            title="New group"
            aria-label="New group"
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-lavender hover:bg-white/5 transition-colors"
          >
            <Users size={18} />
          </button>
        </div>
      </div>

      {tabs.length > 0 && (
        <nav className="px-3 sm:px-4 pb-2" aria-label="Sections">
          <div className="grid grid-cols-4 gap-1 bg-chat rounded-xl p-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const activeTab = section === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onSectionChange?.(t.id)}
                  aria-current={activeTab ? "page" : undefined}
                  aria-label={t.badge ? `${t.label}, ${t.badge} new` : t.label}
                  className={`relative min-h-[44px] rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] sm:text-[11px] transition-colors ${
                    activeTab ? "bg-ember/15 text-ember" : "text-muted hover:text-ink hover:bg-white/5"
                  }`}
                >
                  <Icon size={17} />
                  <span className="leading-none">{t.label}</span>
                  {t.badge > 0 && (
                    <span className="absolute top-1 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-ember text-bg text-[9px] font-semibold flex items-center justify-center">
                      {t.badge > 9 ? "9+" : t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {panel ? (
        <div className="flex-1 min-h-0 flex flex-col">{panel}</div>
      ) : (
      <>
      <div className="px-4 sm:px-5 pb-3 pt-1">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-full pl-9 pr-3 py-2 text-sm placeholder:text-muted transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 min-h-0">
        {sorted.length === 0 && archived.length === 0 ? (
          <div className="text-center text-muted text-sm mt-16 px-6">
            {!loaded ? "Loading conversations…" : conversations.length === 0 ? "Your conversations start here." : "No conversations found."}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sorted.map((c) => (
              <ConversationRow
                key={c._id}
                c={c}
                isActive={activeId === c._id}
                isOnline={c._other && onlineUserIds.has(String(c._other.id || c._other._id))}
                other={c._other}
                label={c._label}
                onSelect={onSelect}
                draft={drafts[c._id]}
                currentUserId={user?.id}
              />
            ))}
          </AnimatePresence>
        )}

        {archived.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowArchived((s) => !s)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted uppercase tracking-wide hover:text-ink"
            >
              <Archive size={12} />
              Archived ({archived.length})
              <ChevronDown size={12} className={`ml-auto transition-transform ${showArchived ? "rotate-180" : ""}`} />
            </button>
            {showArchived && (
              <AnimatePresence initial={false}>
                {archived.map((c) => (
                  <ConversationRow
                    key={c._id}
                    c={c}
                    isActive={activeId === c._id}
                    isOnline={c._other && onlineUserIds.has(String(c._other.id || c._other._id))}
                    other={c._other}
                    label={c._label}
                    onSelect={onSelect}
                    draft={drafts[c._id]}
                    currentUserId={user?.id}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        )}
      </div>

      </>
      )}

      <div className="px-4 sm:px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-white/5 flex items-center gap-3">
        <Avatar name={user?.name} src={user?.avatar} size={38} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-sm">{user?.name}</p>
          <p className="text-xs text-muted truncate">@{user?.username}</p>
        </div>
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-white/5 transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
        <button
          onClick={logout}
          className="w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-red-400 hover:bg-white/5 transition-colors"
          title="Logout"
          aria-label="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
