import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import OnlineIndicator from "./OnlineIndicator.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import SharedContent from "./SharedContent.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { mediaUrl } from "../utils/media.js";
import api from "../services/api.js";

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

const MUTE_OPTIONS = [
  { key: "1h", label: "1 hour" },
  { key: "8h", label: "8 hours" },
  { key: "1w", label: "1 week" },
  { key: "always", label: "Always" },
];

const ChatInfoPanel = ({
  conversation,
  open,
  onClose,
  onlineUserIds,
  onLeft,
  onConversationUpdate,
  onJumpToMessage,
  onClearedChat,
}) => {
  const { user } = useAuth();
  const [tab, setTab] = useState("info");
  const [shared, setShared] = useState({ media: [], files: [], links: [] });
  const [pinned, setPinned] = useState([]);
  const [showMuteMenu, setShowMuteMenu] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [wallpaperUploading, setWallpaperUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !conversation) return;
    setTab("info");
    api.get(`/messages/${conversation._id}/shared`).then(({ data }) => setShared(data)).catch(() => {});
    api.get(`/messages/${conversation._id}/pinned`).then(({ data }) => setPinned(data.messages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversation?._id]);

  // Keep Media / Files / Links live while the panel is open.
  const { socket } = useSocket();
  const convId = conversation?._id;
  useEffect(() => {
    if (!open || !socket || !convId) return undefined;
    let timer;
    const refresh = (msg) => {
      if (msg && msg.conversation && msg.conversation !== convId) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        api.get(`/messages/${convId}/shared`).then(({ data }) => setShared(data)).catch(() => {});
      }, 300);
    };
    socket.on("message:new", refresh);
    socket.on("message:delete", refresh);
    return () => {
      clearTimeout(timer);
      socket.off("message:new", refresh);
      socket.off("message:delete", refresh);
    };
  }, [open, socket, convId]);

  if (!conversation) return null;

  const isGroup = conversation.isGroup;
  const isAdmin = conversation.admins?.some((a) => (a.id || a._id || a) === user.id);
  const other = otherMember(conversation, user.id);
  const label = isGroup ? conversation.name : other?.name;
  const mutedUntil = conversation.mySettings?.mutedUntil;
  const isMuted = mutedUntil && new Date(mutedUntil) > new Date();
  const isArchived = conversation.mySettings?.archived;
  const isBlocked = !isGroup && (user.blockedUsers || []).some((id) => String(id) === String(other?.id || other?._id));

  const patchSettings = async (path, body) => {
    const { data } = await api.patch(`/conversations/${conversation._id}/${path}`, body);
    onConversationUpdate?.({ ...conversation, mySettings: data.settings });
  };

  const leave = async () => {
    if (!window.confirm("Leave this group? You'll no longer receive messages.")) return;
    await api.post(`/conversations/group/${conversation._id}/leave`);
    onLeft(conversation._id);
    onClose();
  };

  const clearChat = async () => {
    if (!window.confirm("Clear all messages in this chat? This only removes them for you.")) return;
    await api.delete(`/conversations/${conversation._id}/clear`);
    onClearedChat?.(conversation._id);
  };

  const toggleBlock = async () => {
    if (!other) return;
    const id = other.id || other._id;
    if (isBlocked) {
      await api.post(`/users/${id}/unblock`);
    } else {
      if (!window.confirm(`Block ${other.name}? They won't be able to message you.`)) return;
      await api.post(`/users/${id}/block`);
    }
    onConversationUpdate?.({ ...conversation, _blockToggled: id });
  };

  const removeMember = async (memberId) => {
    if (!window.confirm("Remove this member from the group?")) return;
    const { data } = await api.post(`/conversations/group/${conversation._id}/remove-member`, {
      memberId,
    });
    onConversationUpdate?.(data.conversation);
  };

  const setMemberAdmin = async (memberId, isAdminNow) => {
    const { data } = await api.post(`/conversations/group/${conversation._id}/set-admin`, {
      memberId,
      isAdmin: !isAdminNow,
    });
    onConversationUpdate?.(data.conversation);
  };

  const searchToAdd = async (q) => {
    setAddQuery(q);
    if (!q.trim()) return setAddResults([]);
    const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
    const existingIds = new Set(conversation.members.map((m) => m.id || m._id));
    setAddResults(data.users.filter((u) => !existingIds.has(u.id)));
  };

  const addMember = async (memberId) => {
    const { data } = await api.post(`/conversations/group/${conversation._id}/members`, {
      memberIds: [memberId],
    });
    onConversationUpdate?.(data.conversation);
    setAddQuery("");
    setAddResults([]);
    setShowAddMember(false);
  };

  const handleWallpaperFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
    if (file.size > 8 * 1024 * 1024) return alert("Wallpaper image must be under 8MB.");
    setWallpaperUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await patchSettings("wallpaper", { wallpaper: data.path || data.url });
    } catch {
      alert("Failed to upload wallpaper. Please try again.");
    } finally {
      setWallpaperUploading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="chat-info-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40 sm:hidden"
          />

          <motion.div
            key="chat-info-panel"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed inset-y-0 right-0 w-full max-w-sm sm:static sm:w-80 sm:max-w-none flex-shrink-0 bg-sidebar border-l border-white/5 h-full flex flex-col z-50"
          >
            <div className="flex items-center justify-between px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-4 sm:pt-4 border-b border-white/5 flex-shrink-0">
              <h3 className="font-display font-semibold">{isGroup ? "Group info" : "Contact info"}</h3>
              <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-1 px-3 pt-3 border-b border-white/5 flex-shrink-0">
              {["info", "settings"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative px-3 py-2 text-sm capitalize transition-colors ${
                    tab === t ? "text-ember" : "text-muted hover:text-ink"
                  }`}
                >
                  {t}
                  {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ember rounded-full" />}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {tab === "info" && (
                <>
                  <div className="flex flex-col items-center py-6 border-b border-white/5 px-4">
                    <div className="relative">
                      <Avatar name={label} src={mediaUrl(isGroup ? conversation.avatar : other?.avatar)} size={72} />
                      {!isGroup && (
                        <OnlineIndicator
                          online={onlineUserIds.has(String(other?.id || other?._id))}
                          className="absolute bottom-1 right-1"
                        />
                      )}
                    </div>
                    <p className="font-display font-semibold mt-3 text-center">{label}</p>
                    {!isGroup && other?.username && (
                      <p className="text-xs text-muted mt-0.5">@{other.username}</p>
                    )}
                    {!isGroup && (
                      <p className="text-xs text-muted mt-1">
                        {onlineUserIds.has(String(other?.id || other?._id))
                          ? "Online"
                          : other?.lastSeen
                          ? `Last seen ${timeAgo(other.lastSeen)}`
                          : ""}
                      </p>
                    )}
                    {isGroup && <p className="text-xs text-muted mt-1">{conversation.members.length} members</p>}
                    {(isGroup ? conversation.description : other?.bio) && (
                      <p className="text-sm text-muted text-center mt-2 px-2">
                        {isGroup ? conversation.description : other.bio}
                      </p>
                    )}
                    {!isGroup && other?.statusMessage && (
                      <p className="text-xs text-ember mt-1">{other.statusMessage}</p>
                    )}
                  </div>

                  {pinned.length > 0 && (
                    <div className="border-b border-white/5 py-3">
                      <p className="text-xs text-muted px-5 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                        <Pin size={12} /> Pinned messages
                      </p>
                      {pinned.map((m) => (
                        <button
                          key={m._id}
                          onClick={() => onJumpToMessage?.(m._id)}
                          className="w-full text-left px-5 py-2 hover:bg-white/5 transition-colors"
                        >
                          <p className="text-xs text-muted truncate">{m.sender?.name}</p>
                          <p className="text-sm truncate">{m.text || "Attachment"}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {isGroup && (
                    <div className="py-3 border-b border-white/5">
                      <div className="flex items-center justify-between px-5 mb-2">
                        <p className="text-xs text-muted uppercase tracking-wide">Members</p>
                        {isAdmin && (
                          <button
                            onClick={() => setShowAddMember((s) => !s)}
                            className="text-ember hover:brightness-110"
                            title="Add member"
                          >
                            <UserPlus size={16} />
                          </button>
                        )}
                      </div>
                      {showAddMember && (
                        <div className="px-5 mb-2">
                          <input
                            value={addQuery}
                            onChange={(e) => searchToAdd(e.target.value)}
                            placeholder="Search people to add"
                            className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-full px-3 py-1.5 text-xs placeholder:text-muted mb-2"
                          />
                          {addResults.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => addMember(u.id)}
                              className="w-full flex items-center gap-2 py-1.5 hover:bg-white/5 rounded-lg text-left"
                            >
                              <Avatar name={u.name} src={u.avatar} size={24} />
                              <span className="text-xs">{u.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {conversation.members.map((m) => {
                        const id = m.id || m._id;
                        const isMemberAdmin = conversation.admins?.some((a) => (a.id || a._id || a) === id);
                        return (
                          <div key={id} className="flex items-center gap-3 px-5 py-2 hover:bg-white/5 transition-colors group/member">
                            <div className="relative">
                              <Avatar name={m.name} src={m.avatar} size={36} />
                              <OnlineIndicator online={onlineUserIds.has(String(id))} className="absolute -bottom-0.5 -right-0.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{m.name}</p>
                              <p className="text-xs text-muted truncate">@{m.username}</p>
                            </div>
                            {isMemberAdmin && <Crown size={14} className="text-amber flex-shrink-0" />}
                            {isAdmin && id !== user.id && (
                              <div className="hidden group-hover/member:flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => setMemberAdmin(id, isMemberAdmin)}
                                  title={isMemberAdmin ? "Remove admin" : "Make admin"}
                                  className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-amber"
                                >
                                  <ShieldCheck size={13} />
                                </button>
                                <button
                                  onClick={() => removeMember(id)}
                                  title="Remove from group"
                                  className="p-1 rounded-full hover:bg-white/10 text-muted hover:text-red-400"
                                >
                                  <UserMinus size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <SharedContent shared={shared} />
                </>
              )}

              {tab === "settings" && (
                <div className="py-3">
                  <button
                    onClick={() => patchSettings("pin", { pinned: !conversation.mySettings?.pinned })}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 text-sm text-left"
                  >
                    <Pin size={16} className="text-muted" />
                    {conversation.mySettings?.pinned ? "Unpin chat" : "Pin chat"}
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setShowMuteMenu((s) => !s)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 text-sm text-left"
                    >
                      {isMuted ? <BellOff size={16} className="text-muted" /> : <Bell size={16} className="text-muted" />}
                      {isMuted ? "Muted" : "Mute notifications"}
                    </button>
                    {showMuteMenu && (
                      <div className="absolute left-5 right-5 top-full bg-chat border border-white/10 rounded-xl overflow-hidden z-10 shadow-lg">
                        {MUTE_OPTIONS.map((o) => (
                          <button
                            key={o.key}
                            onClick={() => {
                              patchSettings("mute", { duration: o.key });
                              setShowMuteMenu(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm hover:bg-white/5"
                          >
                            {o.label}
                          </button>
                        ))}
                        {isMuted && (
                          <button
                            onClick={() => {
                              patchSettings("mute", { duration: null });
                              setShowMuteMenu(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm hover:bg-white/5 text-red-400"
                          >
                            Unmute
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <label className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 text-sm cursor-pointer">
                    <Wallpaper size={16} className="text-muted" />
                    {wallpaperUploading ? "Uploading…" : "Chat wallpaper"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleWallpaperFile} />
                  </label>
                  {conversation.mySettings?.wallpaper && (
                    <button
                      onClick={() => patchSettings("wallpaper", { wallpaper: "" })}
                      className="w-full flex items-center gap-3 px-5 py-2 hover:bg-white/5 text-xs text-muted text-left"
                    >
                      Remove wallpaper
                    </button>
                  )}

                  <button
                    onClick={() => patchSettings("archive", { archived: !isArchived })}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 text-sm text-left"
                  >
                    {isArchived ? <ArchiveRestore size={16} className="text-muted" /> : <Archive size={16} className="text-muted" />}
                    {isArchived ? "Unarchive chat" : "Archive chat"}
                  </button>

                  <button
                    onClick={clearChat}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 text-sm text-left"
                  >
                    <Trash2 size={16} className="text-muted" /> Clear chat
                  </button>

                  {!isGroup && (
                    <button
                      onClick={toggleBlock}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 text-sm text-left text-red-400"
                    >
                      <Ban size={16} /> {isBlocked ? `Unblock ${other?.name}` : `Block ${other?.name}`}
                    </button>
                  )}

                  {isGroup && (
                    <button
                      onClick={leave}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-red-400/10 text-sm text-left text-red-400"
                    >
                      <LogOut size={16} /> Leave group
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChatInfoPanel;
