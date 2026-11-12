
import React, { useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import {
  Search,
  MessageSquarePlus,
  Users,
  Settings,
  LogOut,
  Pin,
  BellOff,
  Archive,
  ChevronDown,
  Phone,
  Video,
  PhoneMissed,
  Mic,
  Image as ImageIcon,
  Film,
  FileText,
  Music,
  X,
  MessageCircle,
} from "lucide-react";

import Avatar from "./Avatar.jsx";
import OnlineIndicator from "./OnlineIndicator.jsx";

import { useAuth } from "../context/AuthContext.jsx";
import { useDrafts } from "../hooks/useDrafts.js";
import { fmtDuration } from "../utils/media.js";

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const getId = (value) => {
  if (!value) return "";
  return String(value.id || value._id || value);
};

const timeAgo = (date) => {
  if (!date) return "";

  const timestamp = new Date(date).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const diff = Math.max(0, (Date.now() - timestamp) / 1000);

  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;

  return new Date(date).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
};

const conversationLabel = (conversation, currentUserId) => {
  if (conversation.isGroup) {
    return conversation.name || "Unnamed group";
  }

  const members = conversation.members || [];

  const other = members.find(
    (member) => getId(member) !== String(currentUserId)
  );

  return other?.name || "Unknown";
};

const isMuted = (conversation) => {
  const until = conversation.mySettings?.mutedUntil;

  return until && new Date(until).getTime() > Date.now();
};

const isOnlineUser = (onlineUserIds, userId) => {
  if (!userId || !onlineUserIds) return false;

  const id = String(userId);

  if (onlineUserIds instanceof Set) {
    return onlineUserIds.has(id);
  }

  if (Array.isArray(onlineUserIds)) {
    return onlineUserIds.some((item) => getId(item) === id);
  }

  return false;
};

// --------------------------------------------------
// MESSAGE PREVIEW
// --------------------------------------------------

const previewFor = (message, currentUserId) => {
  if (!message) {
    return { text: "No messages yet" };
  }

  if (message.deletedForEveryone || message.deleted) {
    return { text: "This message was deleted." };
  }

  switch (message.type) {
    case "voice":
      return {
        icon: Mic,
        text: `Voice message${
          message.attachment?.duration
            ? ` · ${fmtDuration(message.attachment.duration)}`
            : ""
        }`,
      };

    case "image":
      return {
        icon: ImageIcon,
        text: message.text || "Photo",
      };

    case "video":
      return {
        icon: Film,
        text: message.text || "Video",
      };

    case "audio":
      return {
        icon: Music,
        text: message.attachment?.name || "Audio",
      };

    case "file":
      return {
        icon: FileText,
        text: message.attachment?.name || "File",
      };

    case "call": {
      const call = message.call || {};

      const mine =
        getId(message.sender) === String(currentUserId);

      const kind =
        call.mode === "video" ? "video call" : "voice call";

      if (call.status === "missed") {
        return {
          icon: PhoneMissed,
          danger: !mine,
          text: mine ? `No answer · ${kind}` : `Missed ${kind}`,
        };
      }

      if (call.status === "declined") {
        return {
          icon: PhoneMissed,
          text: mine
            ? `Declined · ${kind}`
            : `You declined ${kind}`,
        };
      }

      if (call.status === "busy") {
        return {
          icon: PhoneMissed,
          text: `Busy · ${kind}`,
        };
      }

      if (call.status === "canceled") {
        return {
          icon: PhoneMissed,
          text: mine ? `Canceled ${kind}` : `Missed ${kind}`,
        };
      }

      return {
        icon: call.mode === "video" ? Video : Phone,
        text: `${
          call.mode === "video" ? "Video" : "Voice"
        } call${
          call.duration
            ? ` · ${fmtDuration(call.duration)}`
            : ""
        }`,
      };
    }

    default:
      return {
        text:
          message.shared?.kind === "moment"
            ? `Moment · ${message.shared.title || ""}`
            : message.text || "Attachment",
      };
  }
};

// --------------------------------------------------
// CONVERSATION ROW
// --------------------------------------------------

const ConversationRow = ({
  c,
  isActive,
  isOnline,
  other,
  label,
  onSelect,
  draft,
  currentUserId,
}) => {
  const preview = previewFor(c.lastMessage, currentUserId);

  const PreviewIcon = preview.icon;

  const unreadCount = Math.max(
    0,
    Number(c.unreadCount) || 0
  );

  const timestamp =
    c.lastMessage?.createdAt || c.updatedAt;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18 }}
      onClick={() => onSelect?.(c)}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Open conversation with ${label}${
        unreadCount ? `, ${unreadCount} unread messages` : ""
      }`}
      className={`
        relative w-full flex items-center gap-3
        px-3 py-3 rounded-xl mb-1 text-left
        transition-colors duration-200
        focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-ember/60
        ${
          isActive
            ? "bg-ember/10"
            : "hover:bg-white/5 active:bg-white/10"
        }
      `}
    >
      {isActive && (
        <motion.div
          layoutId="active-conversation"
          className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-ember"
        />
      )}

      {/* Avatar */}

      <div className="relative flex-shrink-0">
        <Avatar
          name={label}
          src={c.isGroup ? c.avatar : other?.avatar}
          size={44}
        />

        {!c.isGroup && (
          <OnlineIndicator
            online={isOnline}
            className="absolute -bottom-0.5 -right-0.5"
          />
        )}
      </div>

      {/* Conversation details */}

      <div className="flex-1 min-w-0">

        <div className="flex items-center justify-between gap-2">

          <span className="font-medium text-sm truncate flex items-center gap-1.5 min-w-0">

            {c.mySettings?.pinned && (
              <Pin
                size={11}
                className="text-amber flex-shrink-0"
              />
            )}

            <span className="truncate">
              {label}
            </span>

          </span>

          <span className="text-[11px] text-muted flex-shrink-0">
            {timeAgo(timestamp)}
          </span>

        </div>

        <div className="flex items-center justify-between gap-2 mt-1">

          {/* Message or draft */}

          {draft?.text?.trim() ? (
            <p className="text-sm text-muted truncate min-w-0">
              <span className="text-ember font-medium">
                Draft:
              </span>{" "}
              {draft.text.replace(/\s+/g, " ")}
            </p>
          ) : (
            <p
              className={`
                text-sm truncate min-w-0
                flex items-center gap-1.5
                ${
                  preview.danger
                    ? "text-red-400"
                    : "text-muted"
                }
              `}
            >
              {PreviewIcon && (
                <PreviewIcon
                  size={13}
                  className="flex-shrink-0"
                />
              )}

              <span className="truncate">
                {preview.text}
              </span>
            </p>
          )}

          {/* Status indicators */}

          <div className="flex items-center gap-1.5 flex-shrink-0">

            {isMuted(c) && (
              <BellOff
                size={12}
                className="text-muted"
                aria-label="Muted"
              />
            )}

            {unreadCount > 0 && (
              <span
                className="
                  min-w-[19px] h-[19px] px-1
                  rounded-full bg-ember text-bg
                  text-[10px] font-semibold
                  flex items-center justify-center
                "
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}

          </div>

        </div>

      </div>
    </motion.button>
  );
};

// --------------------------------------------------
// MAIN SIDEBAR
// --------------------------------------------------

const Sidebar = ({
  conversations = [],
  loaded = true,
  activeId,
  onSelect,
  onlineUserIds = new Set(),
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

  // ------------------------------------------------
  // PREPARE CONVERSATIONS
  // ------------------------------------------------

  const enriched = useMemo(() => {
    return conversations.map((conversation) => {
      const other = !conversation.isGroup
        ? (conversation.members || []).find(
            (member) =>
              getId(member) !== String(user?.id || "")
          )
        : null;

      return {
        ...conversation,
        _label: conversationLabel(
          conversation,
          user?.id
        ),
        _other: other,
      };
    });
  }, [conversations, user?.id]);

  // ------------------------------------------------
  // SEARCH AND SORT
  // ------------------------------------------------

  const { sorted, archived } = useMemo(() => {
    const search = query.trim().toLowerCase();

    const matches = enriched.filter((conversation) => {
      if (!search) return true;

      const name = conversation._label.toLowerCase();

      const username =
        conversation._other?.username?.toLowerCase() || "";

      const lastMessage =
        conversation.lastMessage?.text?.toLowerCase() || "";

      return (
        name.includes(search) ||
        username.includes(search) ||
        lastMessage.includes(search)
      );
    });

    const active = matches.filter(
      (conversation) => !conversation.mySettings?.archived
    );

    const archivedItems = matches.filter(
      (conversation) => conversation.mySettings?.archived
    );

    const sortConversations = (items) =>
      [...items].sort((a, b) => {
        const pinDiff =
          Number(Boolean(b.mySettings?.pinned)) -
          Number(Boolean(a.mySettings?.pinned));

        if (pinDiff !== 0) return pinDiff;

        const dateA = new Date(
          a.lastMessage?.createdAt || a.updatedAt || 0
        ).getTime();

        const dateB = new Date(
          b.lastMessage?.createdAt || b.updatedAt || 0
        ).getTime();

        return dateB - dateA;
      });

    return {
      sorted: sortConversations(active),
      archived: sortConversations(archivedItems),
    };
  }, [enriched, query]);

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) =>
          total + Math.max(0, Number(conversation.unreadCount) || 0),
        0
      ),
    [conversations]
  );

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  return (
    <aside
      className="
        w-full sm:w-72 md:w-80
        flex-shrink-0 min-w-0
        bg-sidebar border-r border-white/5
        flex flex-col h-full
      "
    >

      {/* HEADER */}

      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between">

        <div className="flex items-center gap-2">

          <div
            className="
              w-8 h-8 rounded-xl bg-ember
              flex items-center justify-center
              font-display font-bold text-bg
            "
          >
            V
          </div>

          <div className="flex flex-col">
            <span className="font-display font-semibold text-lg tracking-tight leading-tight">
              Velora
            </span>
            <span className="text-[10px] text-muted">
              Conversations
            </span>
          </div>

        </div>

        <div className="flex items-center gap-1">

          <button
            onClick={onOpenNewChat}
            title="New chat"
            aria-label="New chat"
            className="
              w-10 h-10 flex items-center justify-center
              rounded-full text-muted
              hover:text-ember hover:bg-white/5
              transition-colors
            "
          >
            <MessageSquarePlus size={18} />
          </button>

          <button
            onClick={onOpenNewGroup}
            title="New group"
            aria-label="New group"
            className="
              w-10 h-10 flex items-center justify-center
              rounded-full text-muted
              hover:text-lavender hover:bg-white/5
              transition-colors
            "
          >
            <Users size={18} />
          </button>

        </div>

      </div>

      {/* SECTION TABS */}

      {tabs.length > 0 && (
        <nav
          className="px-3 sm:px-4 pb-2"
          aria-label="Sections"
        >
          <div className="grid grid-cols-4 gap-1 bg-chat rounded-xl p-1">

            {tabs.map((tab) => {
              const Icon = tab.icon;
              const activeTab = section === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => onSectionChange?.(tab.id)}
                  aria-current={
                    activeTab ? "page" : undefined
                  }
                  aria-label={
                    tab.badge
                      ? `${tab.label}, ${tab.badge} new`
                      : tab.label
                  }
                  className={`
                    relative min-h-[44px] rounded-lg
                    flex flex-col items-center justify-center
                    gap-0.5 text-[10px] sm:text-[11px]
                    transition-colors
                    ${
                      activeTab
                        ? "bg-ember/15 text-ember"
                        : "text-muted hover:text-ink hover:bg-white/5"
                    }
                  `}
                >
                  <Icon size={17} />

                  <span className="leading-none">
                    {tab.label}
                  </span>

                  {tab.badge > 0 && (
                    <span
                      className="
                        absolute top-1 right-1.5
                        min-w-[16px] h-4 px-1
                        rounded-full bg-ember text-bg
                        text-[9px] font-semibold
                        flex items-center justify-center
                      "
                    >
                      {tab.badge > 9 ? "9+" : tab.badge}
                    </span>
                  )}
                </button>
              );
            })}

          </div>
        </nav>
      )}

      {/* MAIN PANEL OR CONVERSATION LIST */}

      {panel ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {panel}
        </div>
      ) : (
        <>

          {/* SEARCH */}

          <div className="px-4 sm:px-5 pb-3 pt-1">

            <div className="relative">

              <Search
                size={16}
                className="
                  absolute left-3 top-1/2
                  -translate-y-1/2 text-muted
                "
              />

              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
                className="
                  w-full bg-chat border border-white/5
                  focus:border-ember/40
                  outline-none rounded-full
                  pl-9 pr-9 py-2.5 text-sm
                  placeholder:text-muted
                  transition-colors
                "
              />

              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="
                    absolute right-3 top-1/2
                    -translate-y-1/2 text-muted
                    hover:text-ink
                  "
                >
                  <X size={14} />
                </button>
              )}

            </div>

            {totalUnread > 0 && (
              <div className="flex items-center gap-1.5 mt-3 px-1 text-[11px] text-muted">
                <MessageCircle
                  size={12}
                  className="text-ember"
                />
                {totalUnread > 99 ? "99+" : totalUnread} unread messages
              </div>
            )}

          </div>

          {/* CONVERSATIONS */}

          <div className="flex-1 overflow-y-auto px-2 min-h-0">

            {!loaded ? (

              <div className="flex flex-col items-center justify-center mt-16 gap-3 text-muted">

                <div className="
                  w-8 h-8 rounded-full
                  border-2 border-ember/20
                  border-t-ember animate-spin
                " />

                <p className="text-sm">
                  Loading conversations...
                </p>

              </div>

            ) : sorted.length === 0 && archived.length === 0 ? (

              <div className="text-center text-muted text-sm mt-16 px-6">

                <div className="
                  w-14 h-14 rounded-2xl
                  bg-white/5 flex items-center
                  justify-center mx-auto mb-4
                ">
                  <MessageCircle
                    size={23}
                    className="opacity-50"
                  />
                </div>

                <p className="font-medium text-ink/80">
                  {query
                    ? "No conversations found"
                    : conversations.length === 0
                      ? "Your conversations start here"
                      : "No conversations available"}
                </p>

                <p className="text-xs mt-2 leading-relaxed">
                  {query
                    ? "Try another name or keyword."
                    : "Start a new chat and connect with someone."}
                </p>

              </div>

            ) : (

              <>

                {/* ACTIVE CHATS */}

                <AnimatePresence initial={false} mode="popLayout">

                  {sorted.map((conversation) => (
                    <ConversationRow
                      key={conversation._id}
                      c={conversation}
                      isActive={activeId === conversation._id}
                      isOnline={isOnlineUser(
                        onlineUserIds,
                        getId(conversation._other)
                      )}
                      other={conversation._other}
                      label={conversation._label}
                      onSelect={onSelect}
                      draft={drafts?.[conversation._id]}
                      currentUserId={user?.id}
                    />
                  ))}

                </AnimatePresence>

                {/* ARCHIVED CHATS */}

                {archived.length > 0 && (
                  <div className="mt-3 mb-2">

                    <button
                      onClick={() =>
                        setShowArchived((previous) => !previous)
                      }
                      aria-expanded={showArchived}
                      className="
                        w-full flex items-center gap-2
                        px-3 py-3 rounded-lg
                        text-xs text-muted uppercase
                        tracking-wide
                        hover:text-ink hover:bg-white/5
                        transition-colors
                      "
                    >
                      <Archive size={13} />

                      Archived ({archived.length})

                      <ChevronDown
                        size={13}
                        className={`
                          ml-auto transition-transform
                          ${showArchived ? "rotate-180" : ""}
                        `}
                      />
                    </button>

                    <AnimatePresence initial={false}>

                      {showArchived && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >

                          {archived.map((conversation) => (
                            <ConversationRow
                              key={conversation._id}
                              c={conversation}
                              isActive={
                                activeId === conversation._id
                              }
                              isOnline={isOnlineUser(
                                onlineUserIds,
                                getId(conversation._other)
                              )}
                              other={conversation._other}
                              label={conversation._label}
                              onSelect={onSelect}
                              draft={drafts?.[conversation._id]}
                              currentUserId={user?.id}
                            />
                          ))}

                        </motion.div>
                      )}

                    </AnimatePresence>

                  </div>
                )}

              </>

            )}

          </div>

        </>
      )}

      {/* USER PROFILE FOOTER */}

      <div className="
        px-4 sm:px-5 pt-3
        pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]
        border-t border-white/5
        flex items-center gap-3
      ">

        <Avatar
          name={user?.name}
          src={user?.avatar}
          size={38}
        />

        <div className="flex-1 min-w-0">

          <p className="font-medium truncate text-sm">
            {user?.name}
          </p>

          <p className="text-xs text-muted truncate">
            @{user?.username}
          </p>

        </div>

        <button
          onClick={onOpenSettings}
          className="
            w-10 h-10 flex items-center
            justify-center rounded-full
            text-muted hover:text-ink
            hover:bg-white/5 transition-colors
          "
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>

        <button
          onClick={logout}
          className="
            w-10 h-10 flex items-center
            justify-center rounded-full
            text-muted hover:text-red-400
            hover:bg-white/5 transition-colors
          "
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
