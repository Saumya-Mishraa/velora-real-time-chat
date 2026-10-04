import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, CircleDashed, Sparkles, Phone } from "lucide-react";
import Sidebar from "../components/Sidebar.jsx";
import ChatWindow from "../components/ChatWindow.jsx";
import NewChatModal from "../components/NewChatModal.jsx";
import NewGroupModal from "../components/NewGroupModal.jsx";
import SettingsModal from "../components/SettingsModal.jsx";
import ChatInfoPanel from "../components/ChatInfoPanel.jsx";
import StatusPanel from "../components/StatusPanel.jsx";
import StatusComposer from "../components/StatusComposer.jsx";
import StatusViewer from "../components/StatusViewer.jsx";
import MomentsPanel from "../components/MomentsPanel.jsx";
import MomentDetail from "../components/MomentDetail.jsx";
import MomentForm from "../components/MomentForm.jsx";
import CallsPanel from "../components/CallsPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { useCall } from "../context/CallContext.jsx";
import { useStatusFeed } from "../hooks/useStatusFeed.js";
import { useMoments } from "../hooks/useMoments.js";
import api from "../services/api.js";

// Below the `sm` breakpoint (640px) the sidebar and the detail pane take
// the full viewport one at a time instead of sitting side by side.
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && !window.matchMedia("(min-width: 640px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => setIsMobile(!mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
};

const useNotificationPermission = () => {
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);
};

// The URL is the source of truth for "where am I", so refreshing, deep
// links and the back button all land in the same place:
//   /app                  chat list
//   /app/c/<conversationId>
//   /app/status
//   /app/moments[/<momentId>]
//   /app/calls
const parseRoute = (pathname) => {
  const parts = pathname.replace(/^\/app\/?/, "").split("/").filter(Boolean);
  const [first, second] = parts;
  if (first === "c" && second) return { section: "chats", conversationId: second, momentId: null };
  if (first === "status") return { section: "status", conversationId: null, momentId: null };
  if (first === "moments") return { section: "moments", conversationId: null, momentId: second || null };
  if (first === "calls") return { section: "calls", conversationId: null, momentId: null };
  return { section: "chats", conversationId: null, momentId: null };
};

const EmptyPane = ({ icon: Icon, title, text }) => (
  <div className="flex-1 flex items-center justify-center text-muted px-6">
    <div className="text-center max-w-xs">
      <div className="w-14 h-14 rounded-2xl bg-white/5 mx-auto mb-4 flex items-center justify-center">
        <Icon size={26} className="text-ember" />
      </div>
      <p className="font-display text-xl mb-1 text-ink">{title}</p>
      <p className="text-sm">{text}</p>
    </div>
  </div>
);

const Dashboard = () => {
  const { user, setUser } = useAuth();
  const { socket } = useSocket();
  const { missedCount } = useCall();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  useNotificationPermission();

  const route = useMemo(() => parseRoute(location.pathname), [location.pathname]);
  const { section, conversationId, momentId } = route;

  const [conversations, setConversations] = useState([]);
  const [convsLoaded, setConvsLoaded] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showStatusComposer, setShowStatusComposer] = useState(false);
  const [statusViewer, setStatusViewer] = useState(null); // { userId | "mine" }
  const [momentForm, setMomentForm] = useState(null); // { moment? } when open
  const [flash, setFlash] = useState("");

  const { mine: myStatuses, feed: statusFeed, loaded: statusLoaded, markViewed, removeLocal, unviewedCount } =
    useStatusFeed(socket);
  const { moments, loaded: momentsLoaded, upsert: upsertMoment } = useMoments(socket);

  const active = useMemo(
    () => (conversationId ? conversations.find((c) => c._id === conversationId) || null : null),
    [conversations, conversationId]
  );
  const activeRef = useRef(active);
  activeRef.current = active;
  const userRef = useRef(user);
  userRef.current = user;

  // ---- navigation helpers -------------------------------------------------
  const goChat = useCallback((id, opts) => navigate(id ? `/app/c/${id}` : "/app", opts), [navigate]);
  const goSection = useCallback(
    (next) => {
      const path = { chats: "/app", status: "/app/status", moments: "/app/moments", calls: "/app/calls" }[next] || "/app";
      navigate(path);
    },
    [navigate]
  );

  const showFlash = useCallback((text) => {
    setFlash(text);
    setTimeout(() => setFlash(""), 4000);
  }, []);

  // ---- data loading ---------------------------------------------------------
  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get("/conversations");
      setConversations(data.conversations);
    } catch {
      // keep what we have; the next reconnect retries
    } finally {
      setConvsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Direct URL to a conversation that doesn't exist (or that this person
  // isn't in any more): once the list has loaded, fall back to the list.
  useEffect(() => {
    if (convsLoaded && conversationId && !active) {
      showFlash("That conversation isn't available.");
      navigate("/app", { replace: true });
    }
  }, [convsLoaded, conversationId, active, navigate, showFlash]);

  useEffect(() => {
    setShowChatInfo(false);
  }, [conversationId]);

  // ---- real-time listeners (registered once per socket) -------------------
  useEffect(() => {
    if (!socket) return undefined;

    const handlePresence = ({ userId, status }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (status === "online") next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
    };
    // Authoritative snapshot sent after every (re)connect — replaces the set.
    const handleOnlineList = ({ userIds }) => setOnlineUserIds(new Set(userIds.map(String)));

    const upsert = (conversation) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === conversation._id);
        if (exists) return prev.map((c) => (c._id === conversation._id ? { ...c, ...conversation } : c));
        return [conversation, ...prev];
      });
    };

    const handleSettings = (settings) =>
      setConversations((prev) =>
        prev.map((c) => (c._id === settings.conversationId ? { ...c, mySettings: settings } : c))
      );

    const handleGroupRemoved = ({ conversationId: removedId }) => {
      setConversations((prev) => prev.filter((c) => c._id !== removedId));
      if (activeRef.current?._id === removedId) {
        showFlash("You're no longer a member of that group.");
        navigate("/app", { replace: true });
      }
    };

    const notifyIfAppropriate = (message, conversation) => {
      if (!conversation || message.type === "call") return;
      const me = userRef.current;
      if ((message.sender?._id || message.sender) === me.id) return;
      if (activeRef.current?._id === conversation._id && document.hasFocus()) return;
      const mutedUntil = conversation.mySettings?.mutedUntil;
      if (mutedUntil && new Date(mutedUntil) > new Date()) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const title = conversation.isGroup
        ? `${message.sender?.name || "Someone"} in ${conversation.name}`
        : message.sender?.name || "New message";
      const labels = { voice: "a voice message", image: "a photo", video: "a video", audio: "an audio file", file: "a file" };
      const body = message.type === "text" ? message.text : `Sent ${labels[message.type] || "an attachment"}`;
      try {
        new Notification(title, { body, tag: conversation._id });
      } catch {
        // some mobile browsers can't construct notifications — never block the UI
      }
    };

    const handleNewMessage = (message) => {
      const me = userRef.current;
      let known = true;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c._id === message.conversation);
        if (idx === -1) {
          known = false;
          return prev;
        }
        const conversation = prev[idx];
        if (conversation.lastMessage?._id === message._id) return prev; // duplicate delivery
        const isSender = (message.sender?._id || message.sender) === me.id;
        const isViewing = activeRef.current?._id === message.conversation;
        const updated = {
          ...conversation,
          lastMessage: message,
          updatedAt: message.createdAt,
          unreadCount: isSender || isViewing ? conversation.unreadCount || 0 : (conversation.unreadCount || 0) + 1,
        };
        notifyIfAppropriate(message, conversation);
        return [updated, ...prev.filter((c) => c._id !== message.conversation)];
      });
      // A message for a conversation we haven't got yet: pull the list.
      if (!known) setTimeout(loadConversations, 0);
    };

    const clearUnreadOnSeenEcho = ({ conversationId: cid, userId }) => {
      if (userId !== userRef.current.id) return;
      setConversations((prev) => prev.map((c) => (c._id === cid ? { ...c, unreadCount: 0 } : c)));
    };

    // Keep the chat-list preview truthful when the last message is edited/deleted.
    const handleEdit = ({ messageId, text }) =>
      setConversations((prev) =>
        prev.map((c) => (c.lastMessage?._id === messageId ? { ...c, lastMessage: { ...c.lastMessage, text, edited: true } } : c))
      );
    const handleDelete = ({ messageId, mode }) => {
      if (mode !== "everyone") return;
      setConversations((prev) =>
        prev.map((c) =>
          c.lastMessage?._id === messageId ? { ...c, lastMessage: { ...c.lastMessage, deletedForEveryone: true, deleted: true } } : c
        )
      );
    };

    // Someone changed their name / photo / bio.
    const handleUserUpdated = ({ user: u }) => {
      const matches = (m) => String(m.id || m._id) === String(u.id);
      setConversations((prev) =>
        prev.map((c) => (c.members.some(matches) ? { ...c, members: c.members.map((m) => (matches(m) ? { ...m, ...u } : m)) } : c))
      );
    };
    // My own profile changed in another tab/device.
    const handleMeUpdated = ({ user: u }) => setUser((prev) => (prev ? { ...prev, ...u } : u));
    const handleMeBlocked = ({ blockedUsers }) => setUser((prev) => (prev ? { ...prev, blockedUsers } : prev));

    socket.on("presence:update", handlePresence);
    socket.on("presence:online-list", handleOnlineList);
    socket.on("conversation:new", upsert);
    socket.on("conversation:updated", upsert);
    socket.on("conversation:settings", handleSettings);
    socket.on("group:removed", handleGroupRemoved);
    socket.on("message:new", handleNewMessage);
    socket.on("message:seen", clearUnreadOnSeenEcho);
    socket.on("message:edit", handleEdit);
    socket.on("message:delete", handleDelete);
    socket.on("user:updated", handleUserUpdated);
    socket.on("me:updated", handleMeUpdated);
    socket.on("me:blocked", handleMeBlocked);
    // Socket.IO doesn't replay what happened while offline — re-sync.
    socket.io.on("reconnect", loadConversations);

    return () => {
      socket.off("presence:update", handlePresence);
      socket.off("presence:online-list", handleOnlineList);
      socket.off("conversation:new", upsert);
      socket.off("conversation:updated", upsert);
      socket.off("conversation:settings", handleSettings);
      socket.off("group:removed", handleGroupRemoved);
      socket.off("message:new", handleNewMessage);
      socket.off("message:seen", clearUnreadOnSeenEcho);
      socket.off("message:edit", handleEdit);
      socket.off("message:delete", handleDelete);
      socket.off("user:updated", handleUserUpdated);
      socket.off("me:updated", handleMeUpdated);
      socket.off("me:blocked", handleMeBlocked);
      socket.io.off("reconnect", loadConversations);
    };
  }, [socket, navigate, loadConversations, setUser, showFlash]);

  // Foreground catch-up (laptop wake, phone unlock).
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && loadConversations();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadConversations]);

  // ---- handlers --------------------------------------------------------------
  const upsertConversation = (conversation) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c._id === conversation._id);
      if (exists) return prev.map((c) => (c._id === conversation._id ? { ...c, ...conversation } : c));
      return [conversation, ...prev];
    });
    goChat(conversation._id);
  };

  const handleLeftGroup = (id) => {
    setConversations((prev) => prev.filter((c) => c._id !== id));
    navigate("/app", { replace: true });
  };

  const handleConversationUpdate = (conversation) => {
    if (conversation._blockToggled) {
      api.get("/auth/me").then(({ data }) => setUser(data.user)).catch(() => {});
      return;
    }
    setConversations((prev) => prev.map((c) => (c._id === conversation._id ? { ...c, ...conversation } : c)));
  };

  const handleClearedChat = (id) => {
    setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, lastMessage: null } : c)));
    if (activeRef.current?._id === id) setRefreshNonce((n) => n + 1);
  };

  const jumpToMessageInChat = (messageId) => {
    setShowChatInfo(false);
    requestAnimationFrame(() => {
      const el = document.getElementById(`message-${messageId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("message-flash");
      setTimeout(() => el.classList.remove("message-flash"), 1600);
    });
  };

  // Status reply -> open the chat the reply landed in.
  const handleStatusReplied = (conversation) => {
    setConversations((prev) => (prev.some((c) => c._id === conversation._id) ? prev : [conversation, ...prev]));
    setStatusViewer(null);
    goChat(conversation._id);
  };

  // Private-chat contacts (for status audience + Moment members).
  const contacts = useMemo(() => {
    const map = new Map();
    conversations.forEach((c) => {
      if (c.isGroup) return;
      const other = c.members.find((m) => (m.id || m._id) !== user.id);
      if (other) map.set(String(other.id || other._id), { id: String(other.id || other._id), name: other.name, avatar: other.avatar, username: other.username });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations, user.id]);

  // ---- layout --------------------------------------------------------------
  const hasDetail = section === "chats" ? !!conversationId : section === "moments" ? !!momentId : false;
  const showSidebarPane = !isMobile || !hasDetail;
  const showChatPane = !isMobile || hasDetail;
  const backFromDetail = () => navigate(section === "moments" ? "/app/moments" : "/app");

  const tabs = [
    { id: "chats", label: "Chats", icon: MessageCircle, badge: conversations.reduce((n, c) => n + (c.unreadCount > 0 && !c.mySettings?.archived ? 1 : 0), 0) },
    { id: "status", label: "Status", icon: CircleDashed, badge: unviewedCount },
    { id: "moments", label: "Moments", icon: Sparkles, badge: 0 },
    { id: "calls", label: "Calls", icon: Phone, badge: missedCount },
  ];

  const panel =
    section === "status" ? (
      <StatusPanel
        mine={myStatuses}
        feed={statusFeed}
        loaded={statusLoaded}
        onAdd={() => setShowStatusComposer(true)}
        onOpen={(target) => setStatusViewer(target)}
      />
    ) : section === "moments" ? (
      <MomentsPanel
        moments={moments}
        loaded={momentsLoaded}
        activeId={momentId}
        onSelect={(m) => navigate(`/app/moments/${m._id}`)}
        onCreate={() => setMomentForm({})}
      />
    ) : section === "calls" ? (
      <CallsPanel onOpenChat={(id) => goChat(id)} conversations={conversations} />
    ) : null;

  let mainPane;
  if (section === "moments") {
    mainPane = momentId ? (
      <MomentDetail
        key={momentId}
        momentId={momentId}
        conversations={conversations}
        onBack={backFromDetail}
        onEdit={(m) => setMomentForm({ moment: m })}
        onDeleted={() => navigate("/app/moments", { replace: true })}
        onUpsert={upsertMoment}
        onOpenChat={(id) => goChat(id)}
      />
    ) : (
      <EmptyPane icon={Sparkles} title="Moments" text="Pick a Moment to relive it, or create a new collection of photos, videos and memories." />
    );
  } else if (section === "status") {
    mainPane = <EmptyPane icon={CircleDashed} title="Status" text="Updates disappear after 24 hours. Pick one from the list to view it." />;
  } else if (section === "calls") {
    mainPane = <EmptyPane icon={Phone} title="Calls" text="Tap the phone or video icon next to a call to ring them back." />;
  } else {
    mainPane = (
      <>
        <ChatWindow
          key={`${conversationId}-${refreshNonce}`}
          conversation={active}
          loadingConversation={!!conversationId && !convsLoaded}
          onlineUserIds={onlineUserIds}
          onBack={() => navigate("/app")}
          onOpenGroupDetails={() => setShowChatInfo(true)}
          onConversationUpdate={handleConversationUpdate}
          onOpenMoment={(id) => navigate(`/app/moments/${id}`)}
        />
        <ChatInfoPanel
          conversation={showChatInfo ? active : null}
          open={showChatInfo && !!active}
          onClose={() => setShowChatInfo(false)}
          onLeft={handleLeftGroup}
          onlineUserIds={onlineUserIds}
          onConversationUpdate={handleConversationUpdate}
          onClearedChat={handleClearedChat}
          onJumpToMessage={jumpToMessageInChat}
        />
      </>
    );
  }

  return (
    <div className="h-full flex bg-bg text-ink overflow-hidden pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] relative">
      <AnimatePresence initial={false} mode={isMobile ? "wait" : "sync"}>
        {showSidebarPane && (
          <motion.div
            key="sidebar-pane"
            initial={isMobile ? { x: -32, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            exit={isMobile ? { x: -32, opacity: 0, transition: { duration: 0.15 } } : undefined}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="w-full sm:w-auto h-full flex min-w-0"
          >
            <Sidebar
              conversations={conversations}
              loaded={convsLoaded}
              activeId={active?._id}
              onSelect={(c) => goChat(c._id)}
              onlineUserIds={onlineUserIds}
              onOpenNewChat={() => setShowNewChat(true)}
              onOpenNewGroup={() => setShowNewGroup(true)}
              onOpenSettings={() => setShowSettings(true)}
              section={section}
              tabs={tabs}
              onSectionChange={goSection}
              panel={panel}
            />
          </motion.div>
        )}

        {showChatPane && (
          <motion.div
            key="chat-pane"
            initial={isMobile ? { x: 32, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            exit={isMobile ? { x: 32, opacity: 0, transition: { duration: 0.15 } } : undefined}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="w-full sm:w-auto sm:flex-1 h-full flex min-w-0"
          >
            {mainPane}
          </motion.div>
        )}
      </AnimatePresence>

      {flash && (
        <div role="status" className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] max-w-[calc(100vw-1.5rem)] bg-sidebar border border-white/10 text-sm rounded-xl px-4 py-3 shadow-2xl">
          {flash}
        </div>
      )}

      <NewChatModal open={showNewChat} onClose={() => setShowNewChat(false)} onCreated={upsertConversation} />
      <NewGroupModal open={showNewGroup} onClose={() => setShowNewGroup(false)} onCreated={upsertConversation} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      <StatusComposer open={showStatusComposer} onClose={() => setShowStatusComposer(false)} contacts={contacts} />
      <AnimatePresence>
        {statusViewer && (
          <StatusViewer
            key="status-viewer"
            target={statusViewer}
            mine={myStatuses}
            feed={statusFeed}
            onClose={() => setStatusViewer(null)}
            markViewed={markViewed}
            removeLocal={removeLocal}
            onReplied={handleStatusReplied}
          />
        )}
      </AnimatePresence>

      <MomentForm
        open={!!momentForm}
        moment={momentForm?.moment}
        contacts={contacts}
        onClose={() => setMomentForm(null)}
        onSaved={(m, isNew) => {
          upsertMoment(m);
          setMomentForm(null);
          if (isNew) navigate(`/app/moments/${m._id}`);
        }}
      />
    </div>
  );
};

export default Dashboard;
