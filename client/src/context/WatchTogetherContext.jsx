import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSocket } from "./SocketContext.jsx";

// Watch Together (synced YouTube).
//
// The provider listens for session changes of EVERY conversation so chats can
// show a "Watch party in progress" banner, and owns the single full-screen
// panel (opened from the chat header, the attach menu, or either call
// screen). The player + YouTube IFrame API are lazy-loaded with the panel.
const WatchPartyPanel = lazy(() => import("../components/WatchPartyPanel.jsx"));

const WatchTogetherContext = createContext({
  sessions: {},
  openWatch: () => {},
  closeWatch: () => {},
  refreshSession: () => {},
  applySession: () => {},
});

export const WatchTogetherProvider = ({ children }) => {
  const { socket } = useSocket();
  const [sessions, setSessions] = useState({}); // conversationId -> latest watch:state
  const [panel, setPanel] = useState(null); // { conversationId, members }

  useEffect(() => {
    if (!socket) return undefined;
    const onState = (s) => setSessions((prev) => ({ ...prev, [s.conversationId]: s }));
    const onEnded = ({ conversationId }) =>
      setSessions((prev) => {
        if (!prev[conversationId]) return prev;
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
    socket.on("watch:state", onState);
    socket.on("watch:ended", onEnded);
    return () => {
      socket.off("watch:state", onState);
      socket.off("watch:ended", onEnded);
    };
  }, [socket]);

  // Ask the server whether a party is running (used when a chat opens, and
  // after a reconnect, so late joiners see the banner).
  const refreshSession = useCallback(
    (conversationId) => {
      if (!socket?.connected || !conversationId) return;
      socket.emit("watch:join", { conversationId }, (res) => {
        if (res?.session) setSessions((prev) => ({ ...prev, [conversationId]: res.session }));
        else setSessions((prev) => {
          if (!prev[conversationId]) return prev;
          const next = { ...prev };
          delete next[conversationId];
          return next;
        });
      });
    },
    [socket]
  );

  const openWatch = useCallback((conversationId, members) => setPanel({ conversationId, members: members || null }), []);
  const closeWatch = useCallback(() => setPanel(null), []);

  // The host's own control acks carry the new state (the server doesn't echo
  // a controller's events back to them), so let the panel feed it in.
  const applySession = useCallback((session) => {
    if (session?.conversationId) setSessions((prev) => ({ ...prev, [session.conversationId]: session }));
  }, []);

  const value = useMemo(
    () => ({ sessions, openWatch, closeWatch, refreshSession, applySession }),
    [sessions, openWatch, closeWatch, refreshSession, applySession]
  );

  return (
    <WatchTogetherContext.Provider value={value}>
      {children}
      {panel && (
        <Suspense fallback={null}>
          <WatchPartyPanel conversationId={panel.conversationId} members={panel.members} onClose={closeWatch} />
        </Suspense>
      )}
    </WatchTogetherContext.Provider>
  );
};

export const useWatchTogether = () => useContext(WatchTogetherContext);
