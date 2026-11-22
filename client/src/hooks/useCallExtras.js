import { useCallback, useEffect, useRef, useState } from "react";

// Call reactions + raise hand, shared by 1:1 and group calls.
//   call:reaction { callId, emoji }   (server rate-limits ~1 / 500ms / user)
//   call:hand     { callId, raised }
// Remote events arrive as { callId, userId, ... }.
export default function useCallExtras({ socket, callId, selfId, initialHands }) {
  const [reactions, setReactions] = useState([]); // [{ id, emoji, userId, x }]
  const [hands, setHands] = useState(() => ({ ...(initialHands || {}) }));
  const lastSent = useRef(0);
  const seq = useRef(0);
  const handsRef = useRef(hands);
  handsRef.current = hands;

  const pushReaction = useCallback((emoji, userId) => {
    const id = `${Date.now()}-${seq.current++}`;
    // Random horizontal lane so simultaneous reactions don't overlap exactly.
    setReactions((prev) => [...prev.slice(-24), { id, emoji, userId, x: 8 + Math.random() * 84 }]);
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3200);
  }, []);

  useEffect(() => {
    if (!socket || !callId) return undefined;
    const onReaction = (p) => p.callId === callId && pushReaction(p.emoji, p.userId);
    const onHand = (p) => p.callId === callId && setHands((h) => ({ ...h, [p.userId]: !!p.raised }));
    socket.on("call:reaction", onReaction);
    socket.on("call:hand", onHand);
    return () => {
      socket.off("call:reaction", onReaction);
      socket.off("call:hand", onHand);
    };
  }, [socket, callId, pushReaction]);

  // New call -> fresh state.
  useEffect(() => {
    setHands({ ...(initialHands || {}) });
    setReactions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const sendReaction = useCallback(
    (emoji) => {
      const now = Date.now();
      if (now - lastSent.current < 500) return; // same limit the server enforces
      lastSent.current = now;
      pushReaction(emoji, selfId); // show it locally right away
      socket?.emit("call:reaction", { callId, emoji });
    },
    [socket, callId, selfId, pushReaction]
  );

  const toggleHand = useCallback(() => {
    const raised = !handsRef.current[selfId];
    setHands((h) => ({ ...h, [selfId]: raised }));
    socket?.emit("call:hand", { callId, raised });
  }, [socket, callId, selfId]);

  return { reactions, hands, sendReaction, toggleHand, handRaised: !!hands[selfId] };
}
