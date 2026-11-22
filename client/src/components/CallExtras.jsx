import React, { Suspense, lazy, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smile, Hand, PenLine, MonitorUp, MonitorOff, MonitorPlay } from "lucide-react";
import { useWatchTogether } from "../context/WatchTogetherContext.jsx";

// In-call extras row + floating reactions, shared by the 1:1 CallScreen and
// the group call screen. The whiteboard is lazy-loaded.
const WhiteboardPanel = lazy(() => import("./WhiteboardPanel.jsx"));

export const CALL_REACTIONS = ["👍", "❤️", "😂", "😮", "👏", "🎉"];

const IconButton = ({ onClick, label, active, children, badge }) => (
  <button
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
      active ? "bg-white text-bg" : "bg-white/15 text-white hover:bg-white/25"
    }`}
  >
    {children}
    {badge && <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-ember border border-bg" />}
  </button>
);

// Emojis that float up over the whole call screen, for everyone.
export const ReactionsOverlay = ({ reactions, nameOf }) => (
  <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden" aria-hidden="true">
    <AnimatePresence>
      {reactions.map((r) => (
        <motion.div
          key={r.id}
          initial={{ y: 0, opacity: 0, scale: 0.6 }}
          animate={{ y: "-62vh", opacity: [0, 1, 1, 0], scale: [0.6, 1.15, 1, 1] }}
          transition={{ duration: 3, ease: "easeOut", times: [0, 0.12, 0.7, 1] }}
          style={{ left: `${r.x}%` }}
          className="absolute bottom-28 flex flex-col items-center"
        >
          <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
          {nameOf?.(r.userId) && <span className="text-[10px] bg-black/50 rounded-full px-1.5 py-0.5 mt-0.5 max-w-[84px] truncate">{nameOf(r.userId)}</span>}
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

const CallExtras = ({ socket, callId, conversationId, selfId, extras, screen, canScreenShare, nameOf }) => {
  const { openWatch } = useWatchTogether();
  const [showReactions, setShowReactions] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardHint, setBoardHint] = useState(null); // who opened it, when we haven't

  // A participant opened the whiteboard: offer a one-tap way in.
  useEffect(() => {
    if (!socket || !callId) return undefined;
    const onOpen = (p) => p.callId === callId && !boardOpen && setBoardHint(p.userId);
    socket.on("call:whiteboard-open", onOpen);
    return () => socket.off("call:whiteboard-open", onOpen);
  }, [socket, callId, boardOpen]);

  const openBoard = () => {
    setBoardOpen(true);
    setBoardHint(null);
    socket?.emit("call:whiteboard-open", { callId });
  };

  return (
    <>
      <AnimatePresence>
        {boardHint && !boardOpen && (
          <motion.button
            key="board-hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={openBoard}
            className="mx-auto mb-2 flex items-center gap-2 bg-ember text-bg text-sm font-medium rounded-full px-4 py-2 min-h-[40px]"
          >
            <PenLine size={14} /> {nameOf?.(boardHint) || "Someone"} opened the whiteboard · Open
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReactions && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center justify-center gap-1 mx-auto mb-2 bg-black/50 backdrop-blur rounded-full px-2 py-1 max-w-full w-fit"
            role="group"
            aria-label="Send a reaction"
          >
            {CALL_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => extras.sendReaction(emoji)}
                aria-label={`React ${emoji}`}
                className="w-10 h-10 text-2xl rounded-full hover:bg-white/15 active:scale-110 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
        <IconButton onClick={() => setShowReactions((v) => !v)} label="Reactions" active={showReactions}>
          <Smile size={20} />
        </IconButton>
        <IconButton onClick={extras.toggleHand} label={extras.handRaised ? "Lower hand" : "Raise hand"} active={extras.handRaised}>
          <Hand size={20} />
        </IconButton>
        <IconButton onClick={openBoard} label="Whiteboard" active={boardOpen} badge={!!boardHint && !boardOpen}>
          <PenLine size={20} />
        </IconButton>
        {canScreenShare && screen?.supported && (
          <IconButton onClick={screen.sharing ? screen.stop : screen.start} label={screen.sharing ? "Stop sharing" : "Share screen"} active={screen.sharing}>
            {screen.sharing ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
          </IconButton>
        )}
        <IconButton onClick={() => openWatch(conversationId)} label="Watch together">
          <MonitorPlay size={20} />
        </IconButton>
      </div>
      {screen?.error && <p role="alert" className="text-center text-xs text-red-300 mb-2">{screen.error}</p>}

      {boardOpen && (
        <Suspense fallback={null}>
          <WhiteboardPanel socket={socket} callId={callId} selfId={selfId} onClose={() => setBoardOpen(false)} />
        </Suspense>
      )}
    </>
  );
};

export default CallExtras;
