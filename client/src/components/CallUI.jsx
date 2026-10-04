import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, PhoneOff, Video, Mic, MicOff, VideoOff, SwitchCamera, ChevronDown, Maximize2, AlertCircle, X, Info,
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import { useCall } from "../context/CallContext.jsx";
import { fmtDuration, mediaUrl } from "../utils/media.js";

// Attaches a MediaStream to a <video>/<audio> element and (re)starts
// playback — srcObject is a property, not an attribute, so it needs an effect.
const useStream = (ref, stream) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    if (stream) el.play?.().catch(() => {});
  }, [ref, stream]);
};

const statusText = ({ callState, reconnecting, seconds, call }) => {
  if (reconnecting) return "Reconnecting…";
  if (callState === "calling") return "Calling…";
  if (callState === "ringing") return "Ringing…";
  if (callState === "connecting") return "Connecting…";
  if (callState === "active") return fmtDuration(seconds);
  return call?.mode === "video" ? "Video call" : "Voice call";
};

const RoundButton = ({ onClick, label, children, tone = "default", active = false, disabled }) => {
  const tones = {
    default: active ? "bg-white text-bg" : "bg-white/15 text-white hover:bg-white/25",
    danger: "bg-red-500 text-white hover:bg-red-400",
    accept: "bg-emerald-500 text-white hover:bg-emerald-400",
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

// ---------------------------------------------------------------------
// Always mounted while a call exists: plays the remote audio even when the
// big call screen is minimized or hidden.
// ---------------------------------------------------------------------
const RemoteAudio = () => {
  const { remoteStream } = useCall();
  const ref = useRef(null);
  useStream(ref, remoteStream);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
};

// ---------------------------------------------------------------------
// Incoming call banner — a card, not a blocking screen, so the person can
// keep using the chat while deciding.
// ---------------------------------------------------------------------
const IncomingCall = () => {
  const { call, acceptCall, rejectCall } = useCall();
  if (!call) return null;
  const isVideo = call.mode === "video";
  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      role="alertdialog"
      aria-label={`Incoming ${isVideo ? "video" : "voice"} call from ${call.peer?.name}`}
      className="fixed inset-x-0 top-0 z-[95] flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-md bg-sidebar/95 backdrop-blur border border-white/10 shadow-2xl rounded-2xl p-3 sm:p-4 flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <span className="absolute inset-0 rounded-full bg-ember/40 animate-ping" />
          <Avatar name={call.peer?.name} src={mediaUrl(call.peer?.avatar)} size={52} className="relative" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{call.peer?.name}</p>
          <p className="text-xs text-muted flex items-center gap-1 truncate">
            {isVideo ? <Video size={12} /> : <Phone size={12} />}
            Incoming {isVideo ? "video" : "voice"} call…
          </p>
        </div>
        <button
          onClick={rejectCall}
          aria-label="Decline call"
          className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 flex-shrink-0"
        >
          <PhoneOff size={20} />
        </button>
        <button
          onClick={acceptCall}
          aria-label="Accept call"
          className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-400 flex-shrink-0"
        >
          {isVideo ? <Video size={20} /> : <Phone size={20} />}
        </button>
      </div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------
// Full-screen call view (calling / ringing / connecting / active).
// ---------------------------------------------------------------------
const CallScreen = () => {
  const {
    call, callState, localStream, remoteStream, muted, cameraOff, remoteMedia, reconnecting, seconds,
    canSwitchCamera, facingMode, toggleMute, toggleCamera, switchCamera, endCall, setMinimized,
  } = useCall();
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const isVideo = call?.mode === "video";
  const hasRemoteVideo = !!remoteStream?.getVideoTracks().some((t) => t.readyState === "live");
  const showRemoteVideo = isVideo && hasRemoteVideo && !remoteMedia.cameraOff;

  useStream(remoteVideoRef, remoteStream);
  useStream(localVideoRef, localStream);

  if (!call) return null;
  const status = statusText({ callState, reconnecting, seconds, call });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-label={`${isVideo ? "Video" : "Voice"} call with ${call.peer?.name}`}
      className="fixed inset-0 z-[90] bg-bg text-white overflow-hidden flex flex-col"
    >
      {/* Remote video (muted element: audio plays through <RemoteAudio/>) */}
      {isVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover bg-black ${showRemoteVideo ? "" : "invisible"}`}
        />
      )}

      {/* Audio call / video not yet flowing: avatar stage */}
      {!showRemoteVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b from-sidebar via-bg to-bg">
          <div className="relative mb-6">
            {(callState === "calling" || callState === "ringing" || callState === "connecting") && (
              <>
                <span className="absolute inset-0 rounded-full bg-ember/20 animate-ping" />
                <span className="absolute -inset-4 rounded-full bg-ember/10 animate-pulse" />
              </>
            )}
            <Avatar name={call.peer?.name} src={mediaUrl(call.peer?.avatar)} size={132} className="relative ring-4 ring-white/10" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold truncate max-w-full">{call.peer?.name}</h2>
          <p className="text-white/70 mt-1 tabular-nums">{status}</p>
          {isVideo && remoteMedia.cameraOff && callState === "active" && (
            <p className="text-white/50 text-sm mt-2 flex items-center gap-1.5"><VideoOff size={14} /> Camera is off</p>
          )}
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-6 bg-gradient-to-b from-black/60 to-transparent">
        <button
          onClick={() => setMinimized(true)}
          aria-label="Minimize call"
          title="Minimize — keep chatting"
          className="w-11 h-11 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center flex-shrink-0"
        >
          <ChevronDown size={22} />
        </button>
        {showRemoteVideo && (
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{call.peer?.name}</p>
            <p className="text-xs text-white/70 tabular-nums">{status}</p>
          </div>
        )}
        {remoteMedia.muted && callState === "active" && (
          <span className="ml-auto flex items-center gap-1 text-xs bg-black/40 rounded-full px-2.5 py-1.5">
            <MicOff size={12} /> {call.peer?.name?.split(" ")[0]} is muted
          </span>
        )}
      </div>

      {/* Local preview */}
      {isVideo && localStream && (
        <div className="absolute z-20 right-3 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] w-24 h-32 min-[430px]:w-28 min-[430px]:h-40 sm:w-36 sm:h-48 rounded-xl overflow-hidden bg-black border border-white/20 shadow-xl">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""} ${cameraOff ? "invisible" : ""}`}
          />
          {cameraOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-sidebar text-white/70">
              <VideoOff size={22} />
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* Reconnecting banner */}
      <AnimatePresence>
        {reconnecting && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative z-10 mx-auto mb-3 flex items-center gap-2 bg-amber/20 text-amber text-sm rounded-full px-4 py-2"
            role="status"
          >
            <span className="w-2 h-2 rounded-full bg-amber animate-pulse" />
            Poor connection — reconnecting…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="relative z-10 px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-8 bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-start justify-center gap-3 min-[360px]:gap-5 max-w-md mx-auto">
          <RoundButton onClick={toggleMute} label={muted ? "Unmute" : "Mute"} active={muted}>
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </RoundButton>
          {isVideo && (
            <RoundButton onClick={toggleCamera} label={cameraOff ? "Camera on" : "Camera off"} active={cameraOff}>
              {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
            </RoundButton>
          )}
          {isVideo && canSwitchCamera && (
            <RoundButton onClick={switchCamera} label="Flip" disabled={cameraOff}>
              <SwitchCamera size={22} />
            </RoundButton>
          )}
          <RoundButton onClick={endCall} label={callState === "active" ? "End" : "Cancel"} tone="danger">
            <PhoneOff size={22} />
          </RoundButton>
        </div>
      </div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------
// Minimized call: a bar at the very top of the app (pushes the layout down
// via AppShell, so it never covers chat controls) + for video calls a
// draggable thumbnail of the other person.
// ---------------------------------------------------------------------
const MiniVideo = () => {
  const { remoteStream, remoteMedia, call, setMinimized } = useCall();
  const ref = useRef(null);
  useStream(ref, remoteStream);
  const [pos, setPos] = useState(null); // { x, y } from top-left; null = default corner
  const drag = useRef(null);
  const box = useRef(null);
  const hasVideo = !!remoteStream?.getVideoTracks().length && !remoteMedia.cameraOff;

  const onPointerDown = (e) => {
    const rect = box.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
    box.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    drag.current.moved = true;
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    setPos({
      x: Math.min(Math.max(8, e.clientX - drag.current.dx), window.innerWidth - w - 8),
      y: Math.min(Math.max(8, e.clientY - drag.current.dy), window.innerHeight - h - 8),
    });
  };
  const onPointerUp = () => {
    const moved = drag.current?.moved;
    drag.current = null;
    if (!moved) setMinimized(false);
  };

  return (
    <div
      ref={box}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      style={pos ? { left: pos.x, top: pos.y } : { right: 12, bottom: 96 }}
      className="fixed z-[80] w-24 h-32 sm:w-28 sm:h-40 rounded-xl overflow-hidden bg-sidebar border border-white/20 shadow-2xl touch-none cursor-grab active:cursor-grabbing"
      role="button"
      aria-label="Restore call"
    >
      <video ref={ref} autoPlay playsInline muted className={`w-full h-full object-cover ${hasVideo ? "" : "invisible"}`} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={call?.peer?.name} src={mediaUrl(call?.peer?.avatar)} size={56} />
        </div>
      )}
      <span className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
        <Maximize2 size={12} />
      </span>
    </div>
  );
};

export const CallBar = () => {
  const { call, callState, minimized, setMinimized, muted, toggleMute, endCall, seconds, reconnecting } = useCall();
  const show = !!call && minimized && callState !== "incoming";
  return (
    <>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            key="callbar"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 overflow-hidden bg-emerald-600 text-white pt-[env(safe-area-inset-top,0px)] z-[85]"
            role="status"
          >
            <div className="flex items-center gap-2 px-2 sm:px-3 h-12">
              <button
                onClick={() => setMinimized(false)}
                className="flex-1 min-w-0 h-full flex items-center gap-2.5 text-left"
                aria-label="Return to call"
              >
                {call.mode === "video" ? <Video size={16} className="flex-shrink-0" /> : <Phone size={16} className="flex-shrink-0" />}
                <span className="font-medium truncate text-sm">{call.peer?.name}</span>
                <span className="text-xs text-white/85 tabular-nums flex-shrink-0">
                  {reconnecting ? "Reconnecting…" : callState === "active" ? fmtDuration(seconds) : statusText({ callState, seconds, call })}
                </span>
                <span className="hidden min-[400px]:inline text-xs text-white/70 ml-auto flex-shrink-0">Tap to return</span>
              </button>
              <button
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center flex-shrink-0"
              >
                {muted ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
              <button
                onClick={endCall}
                aria-label="End call"
                className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center flex-shrink-0"
              >
                <PhoneOff size={17} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {show && call.mode === "video" && <MiniVideo />}
    </>
  );
};

const Notice = () => {
  const { notice, dismissNotice } = useCall();
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
          <div
            className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-2xl border backdrop-blur ${
              notice.kind === "error"
                ? "bg-red-950/90 border-red-500/30 text-red-100"
                : "bg-sidebar/95 border-white/10 text-ink"
            }`}
          >
            {notice.kind === "error" ? <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> : <Info size={16} className="mt-0.5 flex-shrink-0 text-muted" />}
            <span className="flex-1 min-w-0 break-words">{notice.text}</span>
            <button onClick={dismissNotice} aria-label="Dismiss" className="p-1 -m-1 flex-shrink-0 opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Everything call-related that overlays the app. Mounted once by AppShell.
const CallOverlay = () => {
  const { call, callState, minimized } = useCall();
  return (
    <>
      {call && <RemoteAudio />}
      <AnimatePresence>{call && callState === "incoming" && <IncomingCall key="incoming" />}</AnimatePresence>
      <AnimatePresence>
        {call && callState !== "incoming" && !minimized && <CallScreen key="screen" />}
      </AnimatePresence>
      <Notice />
    </>
  );
};

export default CallOverlay;
