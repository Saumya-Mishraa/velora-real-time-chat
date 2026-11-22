import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, PhoneOff, Video, Mic, MicOff, VideoOff, SwitchCamera, ChevronDown, Maximize2, AlertCircle, X, Info,
  Hand, MonitorUp, Users, WifiOff,
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import CallExtras, { ReactionsOverlay } from "./CallExtras.jsx";
import { useGroupCall } from "../context/GroupCallContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { fmtDuration, mediaUrl } from "../utils/media.js";

// Group call UI: incoming ring card, full-screen grid (1-4 tiles), minimized
// bar, and the "Join call" banner used inside a group chat. Styling follows
// CallUI.jsx (same tokens / button sizes) so both feel like one feature.

const useStream = (ref, stream) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    if (stream) el.play?.().catch(() => {});
  }, [ref, stream]);
};

const RoundButton = ({ onClick, label, children, tone = "default", active = false, disabled }) => {
  const tones = {
    default: active ? "bg-white text-bg" : "bg-white/15 text-white hover:bg-white/25",
    danger: "bg-red-500 text-white hover:bg-red-400",
  };
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={tone === "default" ? active : undefined}
        className={`w-12 h-12 min-[360px]:w-14 min-[360px]:h-14 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${tones[tone]}`}
      >
        {children}
      </button>
      <span className="text-[11px] text-white/80 text-center leading-tight">{label}</span>
    </div>
  );
};

// One hidden <audio> per remote person: audio keeps playing when minimized.
const RemoteAudios = () => {
  const { participants } = useGroupCall();
  return (
    <>
      {participants.map((p) => (
        <PeerAudio key={p.userId} stream={p.stream} />
      ))}
    </>
  );
};
const PeerAudio = ({ stream }) => {
  const ref = useRef(null);
  useStream(ref, stream);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
};

const Tile = ({ name, avatar, stream, showVideo, mirror, muted, cameraOff, sharing, hand, status, isSelf }) => {
  const ref = useRef(null);
  useStream(ref, showVideo ? stream : null);
  return (
    <div className="relative min-h-0 min-w-0 rounded-2xl overflow-hidden bg-sidebar border border-white/10">
      {showVideo ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full bg-black ${sharing ? "object-contain" : "object-cover"} ${mirror ? "-scale-x-100" : ""}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-sidebar to-bg">
          <Avatar name={name} src={mediaUrl(avatar)} size={72} className="ring-2 ring-white/10" />
        </div>
      )}

      {status && status !== "connected" && !isSelf && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1 text-xs text-white/90">
          <WifiOff size={16} />
          {status === "failed" ? "Connection lost" : status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
        </div>
      )}

      {hand && (
        <span className="absolute top-2 left-2 w-8 h-8 rounded-full bg-amber text-bg flex items-center justify-center shadow-lg" title="Hand raised" aria-label={`${name} raised a hand`}>
          <Hand size={16} />
        </span>
      )}
      {sharing && (
        <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] bg-ember text-bg rounded-full px-2 py-1 font-medium">
          <MonitorUp size={11} /> Sharing
        </span>
      )}

      <div className="absolute bottom-0 inset-x-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-t from-black/70 to-transparent text-white text-xs">
        <span className="truncate font-medium">{isSelf ? `${name} (You)` : name}</span>
        <span className="ml-auto flex items-center gap-1 flex-shrink-0">
          {muted && <MicOff size={13} className="text-red-300" aria-label="Muted" />}
          {cameraOff && !sharing && <VideoOff size={13} className="text-white/70" aria-label="Camera off" />}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
const IncomingGroupCall = () => {
  const { incoming, acceptIncoming, declineIncoming } = useGroupCall();
  if (!incoming) return null;
  const isVideo = incoming.mode === "video";
  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      role="alertdialog"
      aria-label={`Incoming group ${isVideo ? "video" : "voice"} call in ${incoming.groupName}`}
      className="fixed inset-x-0 top-0 z-[95] flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pointer-events-none"
    >
      <div className="immersive pointer-events-auto w-full max-w-md bg-sidebar/95 backdrop-blur border border-white/10 shadow-2xl rounded-2xl p-3 sm:p-4 flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <span className="absolute inset-0 rounded-full bg-ember/40 animate-ping" />
          <Avatar name={incoming.groupName} src={mediaUrl(incoming.groupAvatar)} size={52} className="relative" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{incoming.groupName}</p>
          <p className="text-xs text-muted flex items-center gap-1 truncate">
            {isVideo ? <Video size={12} /> : <Phone size={12} />}
            {incoming.from?.name} started a group {isVideo ? "video" : "voice"} call
          </p>
        </div>
        <button onClick={declineIncoming} aria-label="Decline call" className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 flex-shrink-0">
          <PhoneOff size={20} />
        </button>
        <button onClick={acceptIncoming} aria-label="Join call" className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-400 flex-shrink-0">
          {isVideo ? <Video size={20} /> : <Phone size={20} />}
        </button>
      </div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------
const GroupCallScreen = () => {
  const {
    info, participants, localStream, muted, cameraOff, seconds, canSwitchCamera, facingMode, screen, extras,
    toggleMute, toggleCamera, switchCamera, leaveGroupCall, setMinimized,
  } = useGroupCall();
  const { user } = useAuth();
  const { socket } = useSocket();
  if (!info) return null;

  const tiles = 1 + participants.length;
  const isVideo = info.mode === "video";
  const nameOf = (id) => (String(id) === String(user.id) ? "You" : participants.find((p) => p.userId === String(id))?.name);
  // 1 tile: full; 2: stacked on phones / side by side from sm; 3-4: 2x2.
  const gridCols = tiles <= 1 ? "grid-cols-1" : tiles === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2";
  const selfStream = screen.sharing ? screen.previewStream : localStream;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-label={`Group ${isVideo ? "video" : "voice"} call in ${info.groupName}`}
      className="immersive fixed inset-0 z-[90] bg-bg text-white overflow-hidden flex flex-col"
    >
      <div className="relative z-10 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3">
        <button onClick={() => setMinimized(true)} aria-label="Minimize call" title="Minimize — keep chatting" className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-shrink-0">
          <ChevronDown size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{info.groupName || "Group call"}</p>
          <p className="text-xs text-white/70 tabular-nums flex items-center gap-1.5">
            <Users size={12} /> {tiles}/4 · {fmtDuration(seconds)}
            {participants.length === 0 && " · Waiting for others…"}
          </p>
        </div>
      </div>

      {/* Responsive tile grid */}
      <div className={`relative flex-1 min-h-0 grid ${gridCols} auto-rows-fr gap-2 px-2 pb-2`}>
        <Tile
          isSelf
          name={user.name}
          avatar={user.avatar}
          stream={selfStream}
          showVideo={!!selfStream && (screen.sharing || !cameraOff)}
          mirror={facingMode === "user" && !screen.sharing}
          muted={muted}
          cameraOff={cameraOff}
          sharing={screen.sharing}
          hand={extras.hands[String(user.id)]}
        />
        {participants.map((p) => (
          <Tile
            key={p.userId}
            name={p.name}
            avatar={p.avatar}
            stream={p.stream}
            showVideo={!!p.stream && !!p.stream.getVideoTracks().length && (!p.cameraOff || p.sharing)}
            muted={p.muted}
            cameraOff={p.cameraOff}
            sharing={p.sharing}
            hand={extras.hands[p.userId]}
            status={p.status}
          />
        ))}
      </div>

      <ReactionsOverlay reactions={extras.reactions} nameOf={nameOf} />

      <div className="relative z-10 px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 bg-gradient-to-t from-black/70 to-transparent">
        <CallExtras
          socket={socket}
          callId={info.callId}
          conversationId={info.conversationId}
          selfId={String(user.id)}
          extras={extras}
          screen={screen}
          canScreenShare
          nameOf={nameOf}
        />
        <div className="flex items-start justify-center gap-3 min-[360px]:gap-5 max-w-md mx-auto">
          <RoundButton onClick={toggleMute} label={muted ? "Unmute" : "Mute"} active={muted}>
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </RoundButton>
          <RoundButton onClick={toggleCamera} label={cameraOff ? "Camera on" : "Camera off"} active={cameraOff}>
            {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
          </RoundButton>
          {canSwitchCamera && !cameraOff && !screen.sharing && (
            <RoundButton onClick={switchCamera} label="Flip">
              <SwitchCamera size={22} />
            </RoundButton>
          )}
          <RoundButton onClick={leaveGroupCall} label="Leave" tone="danger">
            <PhoneOff size={22} />
          </RoundButton>
        </div>
      </div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------
// Minimized: bar at the very top of the app (rendered by AppShell, pushes the layout).
export const GroupCallBar = () => {
  const { info, minimized, setMinimized, muted, toggleMute, leaveGroupCall, seconds, participants } = useGroupCall();
  const show = !!info && minimized;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="gcallbar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="flex-shrink-0 overflow-hidden bg-emerald-600 text-white pt-[env(safe-area-inset-top,0px)] z-[85]"
          role="status"
        >
          <div className="flex items-center gap-2 px-2 sm:px-3 h-12">
            <button onClick={() => setMinimized(false)} className="flex-1 min-w-0 h-full flex items-center gap-2.5 text-left" aria-label="Return to group call">
              <Users size={16} className="flex-shrink-0" />
              <span className="font-medium truncate text-sm">{info.groupName || "Group call"}</span>
              <span className="text-xs text-white/85 tabular-nums flex-shrink-0">{fmtDuration(seconds)} · {participants.length + 1}</span>
              <span className="hidden min-[400px]:inline text-xs text-white/70 ml-auto flex-shrink-0">Tap to return</span>
            </button>
            <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center flex-shrink-0">
              {muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button onClick={leaveGroupCall} aria-label="Leave call" className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center flex-shrink-0">
              <PhoneOff size={17} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const GroupNotice = () => {
  const { notice, dismissNotice } = useGroupCall();
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.text}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          role={notice.kind === "error" ? "alert" : "status"}
          className="fixed z-[97] left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] w-[calc(100vw-1.5rem)] max-w-md"
        >
          <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-2xl border backdrop-blur ${notice.kind === "error" ? "bg-red-950/90 border-red-500/30 text-red-100" : "bg-sidebar/95 border-white/10 text-ink"}`}>
            {notice.kind === "error" ? <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> : <Info size={16} className="mt-0.5 flex-shrink-0 text-muted" />}
            <span className="flex-1 min-w-0 break-words">{notice.text}</span>
            <button onClick={dismissNotice} aria-label="Dismiss" className="p-1 -m-1 flex-shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// "Join call" banner shown at the top of a group chat while a call is live.
export const GroupCallBanner = ({ conversationId, groupName }) => {
  const { activeCalls, phase, info, joinGroupCall, refreshStatus } = useGroupCall();
  const { socket } = useSocket();
  const active = activeCalls[conversationId];

  // Learn about a call that started before this chat was opened.
  useEffect(() => {
    refreshStatus(conversationId);
    if (!socket) return undefined;
    const again = () => refreshStatus(conversationId);
    socket.io.on("reconnect", again);
    return () => socket.io.off("reconnect", again);
  }, [conversationId, socket, refreshStatus]);

  if (!active) return null;
  const mine = phase !== "idle" && info?.callId === active.callId;
  if (mine) return null;
  const full = active.participantIds.length >= (active.max || 4);
  return (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-2 bg-emerald-600/15 border-b border-emerald-500/30" role="status">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
      <p className="flex-1 min-w-0 text-sm truncate">
        {active.mode === "video" ? "Video" : "Voice"} call in progress · {active.participantIds.length}/{active.max || 4}
      </p>
      <button
        onClick={() => joinGroupCall(active.callId, { mode: active.mode, conversationId, groupName })}
        disabled={phase !== "idle" || full}
        className="bg-emerald-500 text-white text-sm font-medium rounded-full px-4 min-h-[36px] hover:bg-emerald-400 disabled:opacity-50 flex-shrink-0"
      >
        {full ? "Full" : "Join call"}
      </button>
    </div>
  );
};

const GroupCallOverlay = () => {
  const { info, phase, minimized, incoming } = useGroupCall();
  return (
    <>
      {info && <RemoteAudios />}
      <AnimatePresence>{incoming && phase === "idle" && <IncomingGroupCall key="g-incoming" />}</AnimatePresence>
      <AnimatePresence>{info && !minimized && <GroupCallScreen key="g-screen" />}</AnimatePresence>
      <GroupNotice />
    </>
  );
};

export default GroupCallOverlay;
