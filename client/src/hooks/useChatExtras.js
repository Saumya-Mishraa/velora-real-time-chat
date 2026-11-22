import { useEffect } from "react";

// Live updates for the newer message kinds, kept out of ChatWindow:
//  - poll:updated        -> replace the poll (per-viewer shaped by the server)
//  - message:view-once   -> someone opened a view-once photo/video
//  - location:update     -> live coordinates for a sharing message
//  - location:ended      -> sharing stopped / expired (coordinates dropped)
export default function useChatExtras(socket, conversationId, setMessages, currentUserId) {
  useEffect(() => {
    if (!socket || !conversationId) return undefined;
    const patch = (messageId, fn) =>
      setMessages((prev) => {
        let changed = false;
        const next = prev.map((m) => {
          if (String(m._id) !== String(messageId)) return m;
          changed = true;
          return fn(m);
        });
        return changed ? next : prev;
      });

    const onPoll = ({ messageId, conversationId: cid, poll }) => {
      if (String(cid) !== String(conversationId)) return;
      patch(messageId, (m) => ({ ...m, poll }));
    };
    const onViewOnce = ({ messageId, conversationId: cid, userId }) => {
      if (String(cid) !== String(conversationId)) return;
      patch(messageId, (m) => ({
        ...m,
        viewedBy: Array.from(new Set([...(m.viewedBy || []).map(String), String(userId)])),
        viewedByMe: m.viewedByMe || String(userId) === String(currentUserId),
      }));
    };
    const onLocation = ({ messageId, conversationId: cid, lat, lng, accuracy, updatedAt }) => {
      if (String(cid) !== String(conversationId)) return;
      patch(messageId, (m) => ({ ...m, location: { ...(m.location || {}), lat, lng, accuracy, updatedAt } }));
    };
    const onLocationEnded = ({ messageId, conversationId: cid }) => {
      if (String(cid) !== String(conversationId)) return;
      patch(messageId, (m) => ({
        ...m,
        location: { live: false, ended: true, startedAt: m.location?.startedAt, expiresAt: m.location?.expiresAt },
      }));
    };

    socket.on("poll:updated", onPoll);
    socket.on("message:view-once", onViewOnce);
    socket.on("location:update", onLocation);
    socket.on("location:ended", onLocationEnded);
    return () => {
      socket.off("poll:updated", onPoll);
      socket.off("message:view-once", onViewOnce);
      socket.off("location:update", onLocation);
      socket.off("location:ended", onLocationEnded);
    };
  }, [socket, conversationId, setMessages, currentUserId]);
}
