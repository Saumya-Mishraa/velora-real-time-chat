
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { motion, AnimatePresence } from "framer-motion";

import {
  X,
  Crown,
  LogOut,
  Pin,
  Image as ImageIcon,
  FileText,
  Link2,
  BellOff,
  Bell,
  Archive,
  ArchiveRestore,
  Ban,
  Trash2,
  Wallpaper,
  UserPlus,
  ShieldCheck,
  UserMinus,
  Loader2,
  Search,
  AlertCircle,
  Check,
  ChevronRight,
  Users,
  Clock,
  Video,
} from "lucide-react";

import Avatar from "./Avatar.jsx";
import OnlineIndicator from "./OnlineIndicator.jsx";

import { useAuth } from "../context/AuthContext.jsx";
import SharedContent from "./SharedContent.jsx";
import { useSocket } from "../context/SocketContext.jsx";

import { mediaUrl, fmtDuration } from "../utils/media.js";
import api from "../services/api.js";

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const getId = (value) => {
  if (!value) return "";

  return String(
    value.id || value._id || value
  );
};

const otherMember = (conversation, userId) =>
  conversation && !conversation.isGroup
    ? (conversation.members || []).find(
        (member) => getId(member) !== String(userId)
      )
    : null;

const isUserOnline = (onlineUserIds, userId) => {
  if (!userId || !onlineUserIds) return false;

  const id = String(userId);

  if (onlineUserIds instanceof Set) {
    return onlineUserIds.has(id);
  }

  if (Array.isArray(onlineUserIds)) {
    return onlineUserIds.some(
      (item) => getId(item) === id
    );
  }

  return false;
};

const timeAgo = (date) => {
  if (!date) return "";

  const timestamp = new Date(date).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const diff = Math.max(
    0,
    (Date.now() - timestamp) / 1000
  );

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;

  return new Date(date).toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const MUTE_OPTIONS = [
  { key: "1h", label: "1 hour" },
  { key: "8h", label: "8 hours" },
  { key: "1w", label: "1 week" },
  { key: "always", label: "Always" },
];

// --------------------------------------------------
// SMALL REUSABLE COMPONENTS
// --------------------------------------------------

const SectionLabel = ({ children, icon: Icon }) => (
  <p className="
    text-[11px] text-muted px-5 mb-3
    uppercase tracking-wider
    flex items-center gap-2
  ">
    {Icon && <Icon size={13} />}
    {children}
  </p>
);

const SettingButton = ({
  icon: Icon,
  children,
  onClick,
  danger = false,
  disabled = false,
  loading = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || loading}
    className={`
      w-full flex items-center gap-3
      px-5 py-3.5 text-sm text-left
      transition-colors
      disabled:opacity-50 disabled:cursor-not-allowed
      ${
        danger
          ? "text-red-400 hover:bg-red-400/10"
          : "text-ink hover:bg-white/5"
      }
    `}
  >
    {loading ? (
      <Loader2 size={16} className="animate-spin" />
    ) : (
      <Icon size={16} className="text-muted flex-shrink-0" />
    )}

    <span className="flex-1">{children}</span>

    {!danger && (
      <ChevronRight
        size={14}
        className="text-muted opacity-50"
      />
    )}
  </button>
);

// --------------------------------------------------
// MAIN COMPONENT
// --------------------------------------------------

const ChatInfoPanel = ({
  conversation,
  open,
  onClose,
  onlineUserIds = new Set(),
  onLeft,
  onConversationUpdate,
  onJumpToMessage,
  onClearedChat,
}) => {
  const { user } = useAuth();

  const socketContext = useSocket();
  const socket = socketContext?.socket;

  const [tab, setTab] = useState("info");

  const [shared, setShared] = useState({
    media: [],
    files: [],
    links: [],
  });

  const [pinned, setPinned] = useState([]);

  const [loadingContent, setLoadingContent] = useState(false);

  const [showMuteMenu, setShowMuteMenu] = useState(false);

  const [showAddMember, setShowAddMember] = useState(false);

  const [addQuery, setAddQuery] = useState("");

  const [addResults, setAddResults] = useState([]);

  const [searchingMembers, setSearchingMembers] = useState(false);

  const [wallpaperUploading, setWallpaperUploading] = useState(false);

  const [busyAction, setBusyAction] = useState("");

  const [error, setError] = useState("");

  const searchRequestRef = useRef(0);
  const contentRequestRef = useRef(0);

  const conversationId = conversation?._id;

  const isGroup = Boolean(conversation?.isGroup);

  const currentUserId = getId(user);

  const other = otherMember(conversation, currentUserId);

  const label = isGroup
    ? conversation?.name || "Unnamed group"
    : other?.name || "Unknown";

  const isAdmin = Boolean(
    conversation?.admins?.some(
      (admin) => getId(admin) === currentUserId
    )
  );

  const mutedUntil = conversation?.mySettings?.mutedUntil;

  const isMuted =
    mutedUntil &&
    new Date(mutedUntil).getTime() > Date.now();

  const isArchived = Boolean(
    conversation?.mySettings?.archived
  );

  const isBlocked =
    !isGroup &&
    (user?.blockedUsers || []).some(
      (id) => String(getId(id)) === getId(other)
    );

  const otherIsOnline = isUserOnline(
    onlineUserIds,
    getId(other)
  );

  // ------------------------------------------------
  // RESET PANEL STATE
  // ------------------------------------------------

  useEffect(() => {
    if (!open) return;

    setTab("info");
    setShowMuteMenu(false);
    setShowAddMember(false);
    setAddQuery("");
    setAddResults([]);
    setError("");
  }, [open, conversationId]);

  // ------------------------------------------------
  // ESCAPE KEY
  // ------------------------------------------------

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [open, onClose]);

  // ------------------------------------------------
  // FETCH SHARED CONTENT AND PINNED MESSAGES
  // ------------------------------------------------

  const loadContent = useCallback(async () => {
    if (!conversationId) return;

    const requestId = ++contentRequestRef.current;

    setLoadingContent(true);

    try {
      const [sharedResult, pinnedResult] =
        await Promise.allSettled([
          api.get(`/messages/${conversationId}/shared`),
          api.get(`/messages/${conversationId}/pinned`),
        ]);

      if (requestId !== contentRequestRef.current) return;

      if (sharedResult.status === "fulfilled") {
        setShared({
          media: sharedResult.value.data?.media || [],
          files: sharedResult.value.data?.files || [],
          links: sharedResult.value.data?.links || [],
        });
      }

      if (pinnedResult.status === "fulfilled") {
        setPinned(
          pinnedResult.value.data?.messages || []
        );
      }

      if (
        sharedResult.status === "rejected" ||
        pinnedResult.status === "rejected"
      ) {
        setError("Some chat information could not be loaded.");
      }
    } catch {
      if (requestId === contentRequestRef.current) {
        setError("Unable to load chat information.");
      }
    } finally {
      if (requestId === contentRequestRef.current) {
        setLoadingContent(false);
      }
    }
  }, [conversationId]);

  useEffect(() => {
    if (!open || !conversationId) return;

    loadContent();

    return () => {
      contentRequestRef.current += 1;
    };
  }, [open, conversationId, loadContent]);

  // ------------------------------------------------
  // LIVE SHARED CONTENT UPDATES
  // ------------------------------------------------

  useEffect(() => {
    if (!open || !socket || !conversationId) {
      return undefined;
    }

    let refreshTimer;

    const refresh = (message) => {
      const messageConversation = getId(
        message?.conversation
      );

      if (
        messageConversation &&
        messageConversation !== String(conversationId)
      ) {
        return;
      }

      clearTimeout(refreshTimer);

      refreshTimer = setTimeout(() => {
        loadContent();
      }, 300);
    };

    socket.on("message:new", refresh);
    socket.on("message:delete", refresh);

    return () => {
      clearTimeout(refreshTimer);

      socket.off("message:new", refresh);
      socket.off("message:delete", refresh);
    };
  }, [open, socket, conversationId, loadContent]);

  // ------------------------------------------------
  // API ACTION WRAPPER
  // ------------------------------------------------

  const runAction = async (key, callback) => {
    if (busyAction) return;

    setBusyAction(key);
    setError("");

    try {
      await callback();
    } catch (err) {
      console.error(`Chat info action failed (${key}):`, err);

      setError(
        err?.response?.data?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ------------------------------------------------
  // UPDATE CONVERSATION SETTINGS
  // ------------------------------------------------

  const patchSettings = async (path, body) => {
    return runAction(path, async () => {
      const { data } = await api.patch(
        `/conversations/${conversationId}/${path}`,
        body
      );

      onConversationUpdate?.({
        ...conversation,
        mySettings: data.settings,
      });
    });
  };

  // ------------------------------------------------
  // LEAVE GROUP
  // ------------------------------------------------

  const leave = async () => {
    if (
      !window.confirm(
        "Leave this group? You'll no longer receive messages."
      )
    ) {
      return;
    }

    await runAction("leave", async () => {
      await api.post(
        `/conversations/group/${conversationId}/leave`
      );

      onLeft?.(conversationId);
      onClose?.();
    });
  };

  // ------------------------------------------------
  // CLEAR CHAT
  // ------------------------------------------------

  const clearChat = async () => {
    if (
      !window.confirm(
        "Clear all messages in this chat? This only removes them for you."
      )
    ) {
      return;
    }

    await runAction("clear", async () => {
      await api.delete(
        `/conversations/${conversationId}/clear`
      );

      onClearedChat?.(conversationId);
      await loadContent();
    });
  };

  // ------------------------------------------------
  // BLOCK / UNBLOCK
  // ------------------------------------------------

  const toggleBlock = async () => {
    if (!other) return;

    const id = getId(other);

    if (!isBlocked) {
      if (
        !window.confirm(
          `Block ${other.name}? They won't be able to message you.`
        )
      ) {
        return;
      }
    }

    await runAction("block", async () => {
      if (isBlocked) {
        await api.post(`/users/${id}/unblock`);
      } else {
        await api.post(`/users/${id}/block`);
      }

      onConversationUpdate?.({
        ...conversation,
        _blockToggled: id,
      });
    });
  };

  // ------------------------------------------------
  // GROUP MEMBER MANAGEMENT
  // ------------------------------------------------

  const removeMember = async (memberId) => {
    if (
      !window.confirm(
        "Remove this member from the group?"
      )
    ) {
      return;
    }

    await runAction("member", async () => {
      const { data } = await api.post(
        `/conversations/group/${conversationId}/remove-member`,
        { memberId }
      );

      onConversationUpdate?.(data.conversation);
    });
  };

  const setMemberAdmin = async (
    memberId,
    isAdminNow
  ) => {
    await runAction("member", async () => {
      const { data } = await api.post(
        `/conversations/group/${conversationId}/set-admin`,
        {
          memberId,
          isAdmin: !isAdminNow,
        }
      );

      onConversationUpdate?.(data.conversation);
    });
  };

  // ------------------------------------------------
  // SEARCH MEMBERS
  // ------------------------------------------------

  const searchToAdd = async (query) => {
    setAddQuery(query);

    const requestId = ++searchRequestRef.current;

    if (!query.trim()) {
      setAddResults([]);
      setSearchingMembers(false);
      return;
    }

    setSearchingMembers(true);

    try {
      const { data } = await api.get(
        `/users/search?q=${encodeURIComponent(query.trim())}`
      );

      if (requestId !== searchRequestRef.current) {
        return;
      }

      const existingIds = new Set(
        (conversation?.members || []).map(getId)
      );

      const results = (data.users || []).filter(
        (member) => !existingIds.has(getId(member))
      );

      setAddResults(results);
    } catch (err) {
      if (requestId === searchRequestRef.current) {
        setError(
          err?.response?.data?.message ||
            "Unable to search members."
        );
      }
    } finally {
      if (requestId === searchRequestRef.current) {
        setSearchingMembers(false);
      }
    }
  };

  // ------------------------------------------------
  // ADD MEMBER
  // ------------------------------------------------

  const addMember = async (memberId) => {
    await runAction("add-member", async () => {
      const { data } = await api.post(
        `/conversations/group/${conversationId}/members`,
        {
          memberIds: [memberId],
        }
      );

      onConversationUpdate?.(data.conversation);

      setAddQuery("");
      setAddResults([]);
      setShowAddMember(false);
    });
  };

  // ------------------------------------------------
  // CHAT WALLPAPER
  // ------------------------------------------------

  const handleWallpaperFile = async (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError("Wallpaper image must be under 8MB.");
      return;
    }

    await runAction("wallpaper", async () => {
      setWallpaperUploading(true);

      try {
        const formData = new FormData();

        formData.append("file", file);

        const { data } = await api.post(
          "/upload",
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );

        await api.patch(
          `/conversations/${conversationId}/wallpaper`,
          {
            wallpaper: data.path || data.url,
          }
        );

        onConversationUpdate?.({
          ...conversation,
          mySettings: {
            ...conversation.mySettings,
            wallpaper: data.path || data.url,
          },
        });
      } finally {
        setWallpaperUploading(false);
      }
    });
  };

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  if (!conversation) return null;

  return (
    <AnimatePresence>

      {open && (
        <>

          {/* MOBILE BACKDROP */}

          <motion.div
            key="chat-info-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="
              fixed inset-0 bg-black/60
              z-40 sm:hidden
            "
          />

          {/* MAIN PANEL */}

          <motion.div
            key="chat-info-panel"
            initial={{
              x: "100%",
              opacity: 0,
            }}
            animate={{
              x: 0,
              opacity: 1,
            }}
            exit={{
              x: "100%",
              opacity: 0,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 32,
            }}
            className="
              fixed inset-y-0 right-0
              w-full max-w-sm
              sm:static sm:w-80 sm:max-w-none
              flex-shrink-0
              bg-sidebar border-l border-white/5
              h-full flex flex-col z-50
            "
          >

            {/* HEADER */}

            <div className="
              flex items-center justify-between
              px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))]
              pb-4 sm:pt-4
              border-b border-white/5
              flex-shrink-0
            ">

              <div>
                <h3 className="
                  font-display font-semibold
                  text-base
                ">
                  {isGroup ? "Group info" : "Contact info"}
                </h3>

                <p className="text-[11px] text-muted mt-0.5">
                  {isGroup
                    ? "Manage your group"
                    : "Conversation details"}
                </p>
              </div>

              <button
                onClick={onClose}
                className="
                  w-9 h-9 rounded-full
                  flex items-center justify-center
                  text-muted hover:text-ink
                  hover:bg-white/5 transition-colors
                "
                aria-label="Close chat information"
              >
                <X size={18} />
              </button>

            </div>

            {/* TABS */}

            <div className="
              flex gap-1 px-3 pt-3
              border-b border-white/5
              flex-shrink-0
            ">

              {["info", "settings"].map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setTab(item);
                    setError("");
                  }}
                  aria-selected={tab === item}
                  role="tab"
                  className={`
                    relative px-4 py-2.5
                    text-sm capitalize
                    transition-colors
                    ${
                      tab === item
                        ? "text-ember"
                        : "text-muted hover:text-ink"
                    }
                  `}
                >
                  {item}

                  {tab === item && (
                    <motion.div
                      layoutId="chat-info-tab"
                      className="
                        absolute bottom-0 left-0 right-0
                        h-0.5 bg-ember rounded-full
                      "
                    />
                  )}
                </button>
              ))}

            </div>

            {/* ERROR MESSAGE */}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="
                    mx-4 mt-3 px-3 py-2.5
                    rounded-xl bg-red-400/10
                    border border-red-400/20
                    flex items-start gap-2
                    text-xs text-red-400
                  "
                >
                  <AlertCircle
                    size={15}
                    className="flex-shrink-0 mt-0.5"
                  />

                  <span className="flex-1">
                    {error}
                  </span>

                  <button
                    onClick={() => setError("")}
                    aria-label="Dismiss error"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* CONTENT */}

            <div className="flex-1 overflow-y-auto min-h-0">

              <AnimatePresence mode="wait">

                {/* ==================================
                    INFO TAB
                ================================== */}

                {tab === "info" && (
                  <motion.div
                    key="info"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.16 }}
                  >

                    {/* PROFILE */}

                    <div className="
                      flex flex-col items-center
                      py-7 border-b border-white/5 px-4
                    ">

                      <div className="relative">

                        <Avatar
                          name={label}
                          src={mediaUrl(
                            isGroup
                              ? conversation.avatar
                              : other?.avatar
                          )}
                          size={76}
                        />

                        {!isGroup && (
                          <OnlineIndicator
                            online={otherIsOnline}
                            className="absolute bottom-1 right-1"
                          />
                        )}

                      </div>

                      <h3 className="
                        font-display font-semibold
                        text-base mt-3 text-center
                      ">
                        {label}
                      </h3>

                      {!isGroup && other?.username && (
                        <p className="text-xs text-muted mt-1">
                          @{other.username}
                        </p>
                      )}

                      {!isGroup && (
                        <p className="text-xs text-muted mt-2 flex items-center gap-1.5">

                          <span
                            className={`
                              w-1.5 h-1.5 rounded-full
                              ${
                                otherIsOnline
                                  ? "bg-emerald-400"
                                  : "bg-muted"
                              }
                            `}
                          />

                          {otherIsOnline
                            ? "Online"
                            : other?.lastSeen
                              ? `Last seen ${timeAgo(other.lastSeen)}`
                              : "Offline"}
                        </p>
                      )}

                      {isGroup && (
                        <p className="
                          text-xs text-muted mt-2
                          flex items-center gap-1.5
                        ">
                          <Users size={13} />
                          {(conversation.members || []).length} members
                        </p>
                      )}

                      {(isGroup
                        ? conversation.description
                        : other?.bio) && (
                        <p className="
                          text-sm text-muted
                          text-center mt-3
                          max-w-[260px]
                          leading-relaxed
                        ">
                          {isGroup
                            ? conversation.description
                            : other.bio}
                        </p>
                      )}

                      {!isGroup && other?.statusMessage && (
                        <p className="
                          text-xs text-ember
                          mt-2 text-center
                        ">
                          {other.statusMessage}
                        </p>
                      )}

                    </div>

                    {/* PINNED MESSAGES */}

                    {pinned.length > 0 && (
                      <div className="
                        border-b border-white/5 py-4
                      ">

                        <SectionLabel icon={Pin}>
                          Pinned messages
                        </SectionLabel>

                        {pinned.map((message) => (
                          <button
                            key={message._id}
                            onClick={() =>
                              onJumpToMessage?.(message._id)
                            }
                            className="
                              w-full text-left
                              px-5 py-3
                              hover:bg-white/5
                              transition-colors
                              flex items-start gap-3
                            "
                          >

                            <div className="
                              w-8 h-8 rounded-lg
                              bg-ember/10
                              flex items-center justify-center
                              flex-shrink-0
                            ">
                              <Pin
                                size={14}
                                className="text-ember"
                              />
                            </div>

                            <div className="flex-1 min-w-0">

                              <p className="text-xs text-muted truncate">
                                {message.sender?.name || "Message"}
                              </p>

                              <p className="text-sm truncate mt-1">
                                {message.text || "Attachment"}
                              </p>

                              {message.createdAt && (
                                <p className="
                                  text-[10px] text-muted mt-1
                                ">
                                  {timeAgo(message.createdAt)}
                                </p>
                              )}

                            </div>

                            <ChevronRight
                              size={14}
                              className="text-muted mt-2"
                            />

                          </button>
                        ))}

                      </div>
                    )}

                    {/* GROUP MEMBERS */}

                    {isGroup && (
                      <div className="
                        py-4 border-b border-white/5
                      ">

                        <div className="
                          flex items-center justify-between
                          px-5 mb-3
                        ">

                          <SectionLabel icon={Users}>
                            Members
                          </SectionLabel>

                          {isAdmin && (
                            <button
                              onClick={() => {
                                setShowAddMember((previous) => !previous);
                                setError("");
                              }}
                              className="
                                w-8 h-8 rounded-full
                                flex items-center justify-center
                                text-ember hover:bg-ember/10
                                transition-colors
                              "
                              title="Add member"
                              aria-label="Add group member"
                            >
                              <UserPlus size={17} />
                            </button>
                          )}

                        </div>

                        {/* ADD MEMBER SEARCH */}

                        <AnimatePresence>
                          {showAddMember && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden px-5 mb-3"
                            >

                              <div className="relative">

                                <Search
                                  size={14}
                                  className="
                                    absolute left-3 top-1/2
                                    -translate-y-1/2 text-muted
                                  "
                                />

                                <input
                                  value={addQuery}
                                  onChange={(event) =>
                                    searchToAdd(event.target.value)
                                  }
                                  placeholder="Search people to add"
                                  className="
                                    w-full bg-chat
                                    border border-white/5
                                    focus:border-ember/40
                                    outline-none rounded-full
                                    pl-9 pr-3 py-2
                                    text-xs placeholder:text-muted
                                  "
                                />

                              </div>

                              {searchingMembers && (
                                <p className="
                                  text-xs text-muted mt-3
                                  flex items-center gap-2
                                ">
                                  <Loader2
                                    size={12}
                                    className="animate-spin"
                                  />
                                  Searching...
                                </p>
                              )}

                              {!searchingMembers &&
                                addQuery.trim() &&
                                addResults.length === 0 && (
                                  <p className="
                                    text-xs text-muted mt-3
                                  ">
                                    No new members found.
                                  </p>
                                )}

                              <div className="mt-2">

                                {addResults.map((member) => (
                                  <button
                                    key={getId(member)}
                                    disabled={Boolean(busyAction)}
                                    onClick={() =>
                                      addMember(getId(member))
                                    }
                                    className="
                                      w-full flex items-center
                                      gap-3 py-2 px-2
                                      hover:bg-white/5
                                      rounded-xl text-left
                                      transition-colors
                                      disabled:opacity-50
                                    "
                                  >

                                    <Avatar
                                      name={member.name}
                                      src={mediaUrl(member.avatar)}
                                      size={32}
                                    />

                                    <span className="
                                      text-xs flex-1 min-w-0 truncate
                                    ">
                                      {member.name}
                                    </span>

                                    {busyAction === "add-member" ? (
                                      <Loader2
                                        size={14}
                                        className="animate-spin text-ember"
                                      />
                                    ) : (
                                      <UserPlus
                                        size={14}
                                        className="text-ember"
                                      />
                                    )}

                                  </button>
                                ))}

                              </div>

                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* MEMBER LIST */}

                        {(conversation.members || []).map((member) => {
                          const memberId = getId(member);

                          const memberIsAdmin =
                            conversation.admins?.some(
                              (admin) => getId(admin) === memberId
                            );

                          const memberOnline = isUserOnline(
                            onlineUserIds,
                            memberId
                          );

                          const isCurrentUser =
                            memberId === currentUserId;

                          return (
                            <div
                              key={memberId}
                              className="
                                flex items-center gap-3
                                px-5 py-2.5
                                hover:bg-white/5
                                transition-colors
                                group/member
                              "
                            >

                              <div className="relative flex-shrink-0">

                                <Avatar
                                  name={member.name}
                                  src={mediaUrl(member.avatar)}
                                  size={36}
                                />

                                <OnlineIndicator
                                  online={memberOnline}
                                  className="
                                    absolute -bottom-0.5
                                    -right-0.5
                                  "
                                />

                              </div>

                              <div className="flex-1 min-w-0">

                                <p className="text-sm truncate">
                                  {member.name}
                                  {isCurrentUser && (
                                    <span className="text-muted text-xs ml-1">
                                      (You)
                                    </span>
                                  )}
                                </p>

                                {member.username && (
                                  <p className="text-xs text-muted truncate">
                                    @{member.username}
                                  </p>
                                )}

                              </div>

                              {memberIsAdmin && (
                                <span title="Group admin">
                                  <Crown
                                    size={14}
                                    className="text-amber flex-shrink-0"
                                  />
                                </span>
                              )}

                              {isAdmin && !isCurrentUser && (
                                <div className="
                                  flex items-center gap-1
                                  opacity-100 sm:opacity-0
                                  sm:group-hover/member:opacity-100
                                  transition-opacity
                                ">

                                  <button
                                    onClick={() =>
                                      setMemberAdmin(
                                        memberId,
                                        memberIsAdmin
                                      )
                                    }
                                    disabled={Boolean(busyAction)}
                                    title={
                                      memberIsAdmin
                                        ? "Remove admin"
                                        : "Make admin"
                                    }
                                    aria-label={
                                      memberIsAdmin
                                        ? "Remove admin role"
                                        : "Make group admin"
                                    }
                                    className="
                                      w-8 h-8 rounded-full
                                      flex items-center justify-center
                                      text-muted hover:text-amber
                                      hover:bg-white/10
                                      disabled:opacity-40
                                    "
                                  >
                                    <ShieldCheck size={14} />
                                  </button>

                                  <button
                                    onClick={() =>
                                      removeMember(memberId)
                                    }
                                    disabled={Boolean(busyAction)}
                                    title="Remove member"
                                    aria-label={`Remove ${member.name}`}
                                    className="
                                      w-8 h-8 rounded-full
                                      flex items-center justify-center
                                      text-muted hover:text-red-400
                                      hover:bg-white/10
                                      disabled:opacity-40
                                    "
                                  >
                                    <UserMinus size={14} />
                                  </button>

                                </div>
                              )}

                            </div>
                          );
                        })}

                      </div>
                    )}

                    {/* SHARED CONTENT */}

                    <div className="py-4 border-b border-white/5">

                      <div className="
                        flex items-center justify-between
                        px-5 mb-3
                      ">
                        <SectionLabel icon={ImageIcon}>
                          Shared content
                        </SectionLabel>

                        {loadingContent && (
                          <Loader2
                            size={13}
                            className="animate-spin text-muted mr-1"
                          />
                        )}
                      </div>

                      <SharedContent shared={shared} />

                    </div>

                  </motion.div>
                )}

                {/* ==================================
                    SETTINGS TAB
                ================================== */}

                {tab === "settings" && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.16 }}
                    className="py-3"
                  >

                    {/* CHAT CUSTOMIZATION */}

                    <SectionLabel icon={Wallpaper}>
                      Chat customization
                    </SectionLabel>

                    <SettingButton
                      icon={Pin}
                      onClick={() =>
                        patchSettings("pin", {
                          pinned: !conversation.mySettings?.pinned,
                        })
                      }
                      disabled={Boolean(busyAction)}
                      loading={busyAction === "pin"}
                    >
                      {conversation.mySettings?.pinned
                        ? "Unpin chat"
                        : "Pin chat"}
                    </SettingButton>

                    {/* MUTE OPTIONS */}

                    <div className="relative">

                      <SettingButton
                        icon={isMuted ? BellOff : Bell}
                        onClick={() =>
                          setShowMuteMenu((previous) => !previous)
                        }
                      >
                        {isMuted
                          ? "Muted notifications"
                          : "Mute notifications"}
                      </SettingButton>

                      <AnimatePresence>

                        {showMuteMenu && (
                          <motion.div
                            initial={{
                              opacity: 0,
                              y: -5,
                            }}
                            animate={{
                              opacity: 1,
                              y: 0,
                            }}
                            exit={{
                              opacity: 0,
                              y: -5,
                            }}
                            className="
                              mx-5 mt-1 mb-3
                              bg-chat border border-white/10
                              rounded-xl overflow-hidden
                              shadow-lg
                            "
                          >

                            {MUTE_OPTIONS.map((option) => (
                              <button
                                key={option.key}
                                onClick={() => {
                                  setShowMuteMenu(false);

                                  patchSettings("mute", {
                                    duration: option.key,
                                  });
                                }}
                                disabled={Boolean(busyAction)}
                                className="
                                  block w-full text-left
                                  px-4 py-3 text-sm
                                  text-ink hover:bg-white/5
                                  transition-colors
                                  disabled:opacity-50
                                "
                              >
                                {option.label}
                              </button>
                            ))}

                            {isMuted && (
                              <button
                                onClick={() => {
                                  setShowMuteMenu(false);

                                  patchSettings("mute", {
                                    duration: null,
                                  });
                                }}
                                disabled={Boolean(busyAction)}
                                className="
                                  block w-full text-left
                                  px-4 py-3 text-sm
                                  text-red-400
                                  hover:bg-white/5
                                  border-t border-white/5
                                "
                              >
                                Unmute notifications
                              </button>
                            )}

                          </motion.div>
                        )}

                      </AnimatePresence>

                    </div>

                    {/* WALLPAPER */}

                    <label className="
                      w-full flex items-center gap-3
                      px-5 py-3.5 text-sm
                      hover:bg-white/5
                      transition-colors cursor-pointer
                    ">

                      {wallpaperUploading ? (
                        <Loader2
                          size={16}
                          className="animate-spin text-muted"
                        />
                      ) : (
                        <Wallpaper
                          size={16}
                          className="text-muted"
                        />
                      )}

                      <span className="flex-1">
                        {wallpaperUploading
                          ? "Uploading wallpaper..."
                          : "Change chat wallpaper"}
                      </span>

                      <input
                        type="file"
                        accept="image/*"
                        disabled={Boolean(busyAction)}
                        className="hidden"
                        onChange={handleWallpaperFile}
                      />

                    </label>

                    {conversation.mySettings?.wallpaper && (
                      <button
                        onClick={() =>
                          patchSettings("wallpaper", {
                            wallpaper: "",
                          })
                        }
                        disabled={Boolean(busyAction)}
                        className="
                          w-full text-left
                          px-5 py-2.5
                          text-xs text-muted
                          hover:text-red-400
                          transition-colors
                        "
                      >
                        Remove wallpaper
                      </button>
                    )}

                    {/* ORGANIZATION */}

                    <div className="
                      mt-4 pt-4
                      border-t border-white/5
                    ">

                      <SectionLabel icon={Archive}>
                        Conversation management
                      </SectionLabel>

                      <SettingButton
                        icon={
                          isArchived
                            ? ArchiveRestore
                            : Archive
                        }
                        onClick={() =>
                          patchSettings("archive", {
                            archived: !isArchived,
                          })
                        }
                        disabled={Boolean(busyAction)}
                        loading={busyAction === "archive"}
                      >
                        {isArchived
                          ? "Unarchive chat"
                          : "Archive chat"}
                      </SettingButton>

                      <SettingButton
                        icon={Trash2}
                        danger
                        onClick={clearChat}
                        disabled={Boolean(busyAction)}
                        loading={busyAction === "clear"}
                      >
                        Clear chat
                      </SettingButton>

                    </div>

                    {/* PRIVACY */}

                    {!isGroup && (
                      <div className="
                        mt-4 pt-4
                        border-t border-white/5
                      ">

                        <SectionLabel icon={Ban}>
                          Privacy
                        </SectionLabel>

                        <SettingButton
                          icon={Ban}
                          danger
                          onClick={toggleBlock}
                          disabled={Boolean(busyAction)}
                          loading={busyAction === "block"}
                        >
                          {isBlocked
                            ? `Unblock ${other?.name}`
                            : `Block ${other?.name}`}
                        </SettingButton>

                      </div>
                    )}

                    {/* GROUP MANAGEMENT */}

                    {isGroup && (
                      <div className="
                        mt-4 pt-4
                        border-t border-white/5
                      ">

                        <SectionLabel icon={Users}>
                          Group management
                        </SectionLabel>

                        <SettingButton
                          icon={LogOut}
                          danger
                          onClick={leave}
                          disabled={Boolean(busyAction)}
                          loading={busyAction === "leave"}
                        >
                          Leave group
                        </SettingButton>

                      </div>
                    )}

                  </motion.div>
                )}

              </AnimatePresence>

            </div>

            {/* FOOTER */}

            <div className="
              flex-shrink-0 px-5 py-3
              border-t border-white/5
              flex items-center justify-between
              text-[10px] text-muted
            ">

              <span className="
                flex items-center gap-1.5
              ">
                <span className="
                  w-1.5 h-1.5 rounded-full
                  bg-ember
                " />
                Velora
              </span>

              <span>
                {isGroup ? "Group conversation" : "Private conversation"}
              </span>

            </div>

          </motion.div>

        </>
      )}

    </AnimatePresence>
  );
};

export default ChatInfoPanel;
