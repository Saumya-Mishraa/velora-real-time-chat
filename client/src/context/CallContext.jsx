import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useSocket } from "./SocketContext.jsx";
import api from "../services/api.js";
import { startRing, stopRing, playTone } from "../utils/ringtone.js";

// ---------------------------------------------------------------------
// Real audio/video calling.
//
//   media:      WebRTC peer connection (browser <-> browser)
//   signaling:  Socket.IO (call:* events, see server/src/socket/callHandler.js)
//   ICE:        STUN always; TURN credentials come from GET /api/calls/ice
//               when the server is configured with TURN_* env vars
//
// States:
//   idle -> calling -> ringing -> connecting -> active
//   idle -> incoming -> connecting -> active
//   any  -> ended (brief notice) -> idle
// ---------------------------------------------------------------------

const CallContext = createContext(null);
export const useCall = () => useContext(CallContext);

const GRACE_BEFORE_FAIL_MS = 20000;
const NOTICE_MS = 3200;

const userBrief = (u) => ({ id: u.id || u._id, name: u.name, username: u.username, avatar: u.avatar || "" });

const mediaErrorMessage = (err, mode) => {
  const what = mode === "video" ? "camera and microphone" : "microphone";
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return `Velora doesn't have permission to use your ${what}. Allow access in your browser's site settings and try again.`;
    case "NotFoundError":
    case "OverconstrainedError":
      return `No ${what} was found on this device.`;
    case "NotReadableError":
    case "AbortError":
      return `Your ${what} is being used by another app. Close it and try again.`;
    default:
      return `Couldn't access your ${what}.`;
  }
};

export const CallProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  // ---- public state -----------------------------------------------------
  const [call, setCall] = useState(null); // see shape in resetCall/beginCall
  const [callState, setCallState] = useState("idle");
  const [minimized, setMinimized] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState({ muted: false, cameraOff: false });
  const [reconnecting, setReconnecting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState(null); // { kind: "info" | "error", text }
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [missedSeenAt, setMissedSeenAt] = useState(() => Number(localStorage.getItem("velora_calls_seen") || 0));

  // ---- refs (the WebRTC machinery, kept out of React state) -----------
  const callRef = useRef(null);
  const stateRef = useRef("idle");
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const pendingCandidates = useRef([]);
  const localReady = useRef(null); // Promise resolved when local media is acquired (callee)
  const connectedAtRef = useRef(null);
  const failTimer = useRef(null);
  const tickTimer = useRef(null);
  const noticeTimer = useRef(null);
  const iceCache = useRef({ at: 0, servers: null });
  const mutedRef = useRef(false);
  const cameraOffRef = useRef(false);
  const facingRef = useRef("user");
  const userRef = useRef(user);
  userRef.current = user;

  const setState = (s) => {
    stateRef.current = s;
    setCallState(s);
  };

  const showNotice = useCallback((kind, text, ms = NOTICE_MS) => {
    clearTimeout(noticeTimer.current);
    setNotice({ kind, text });
    if (ms) noticeTimer.current = setTimeout(() => setNotice(null), ms);
  }, []);

  // ---- teardown -------------------------------------------------------
  // Everything a call owns is released here: peer connection, every media
  // track (so the camera/mic indicator goes off), timers and ringtones.
  const cleanup = useCallback(() => {
    stopRing();
    clearTimeout(failTimer.current);
    clearInterval(tickTimer.current);
    failTimer.current = null;
    tickTimer.current = null;

    const pc = pcRef.current;
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      try {
        pc.getSenders().forEach((s) => s.track && s.track.stop());
        pc.close();
      } catch {
        // already closed
      }
      pcRef.current = null;
    }
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    remoteRef.current?.getTracks().forEach((t) => t.stop());
    remoteRef.current = null;
    pendingCandidates.current = [];
    localReady.current = null;
    connectedAtRef.current = null;
    mutedRef.current = false;
    cameraOffRef.current = false;
    facingRef.current = "user";

    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setRemoteMedia({ muted: false, cameraOff: false });
    setReconnecting(false);
    setSeconds(0);
    setMinimized(false);
    setFacingMode("user");
    setCanSwitchCamera(false);
  }, []);

  const resetCall = useCallback(() => {
    cleanup();
    callRef.current = null;
    setCall(null);
    setState("idle");
  }, [cleanup]);

  const finish = useCallback(
    (noticeKind, noticeText, { sound = true } = {}) => {
      if (sound) playTone("end");
      resetCall();
      if (noticeText) showNotice(noticeKind, noticeText);
    },
    [resetCall, showNotice]
  );

  // ---- media ----------------------------------------------------------
  const acquireMedia = async (mode, facing = "user") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error("unsupported");
      err.name = "NotFoundError";
      throw err;
    }
    if (!window.isSecureContext) {
      const err = new Error("insecure");
      err.name = "SecurityError";
      throw err;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video:
        mode === "video"
          ? { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
          : false,
    });
    localRef.current = stream;
    setLocalStream(stream);
    if (mode === "video") {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCanSwitchCamera(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch {
        setCanSwitchCamera(false);
      }
    }
    return stream;
  };

  const getIceServers = async () => {
    const fresh = iceCache.current.servers && Date.now() - iceCache.current.at < 10 * 60 * 1000;
    if (fresh) return iceCache.current.servers;
    try {
      const { data } = await api.get("/calls/ice");
      iceCache.current = { at: Date.now(), servers: data.iceServers };
      return data.iceServers;
    } catch {
      // Public STUN fallback so a transient API error doesn't block calling.
      return [{ urls: ["stun:stun.l.google.com:19302"] }];
    }
  };

  const sendSignal = (data) => {
    const c = callRef.current;
    if (c && socket) socket.emit("call:signal", { callId: c.callId, data });
  };

  const markConnected = () => {
    if (connectedAtRef.current) return;
    connectedAtRef.current = Date.now();
    setState("active");
    clearTimeout(failTimer.current);
    setReconnecting(false);
    playTone("connected");
    clearInterval(tickTimer.current);
    tickTimer.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000));
    }, 500);
  };

  const hangupFromFailure = useCallback(
    (text) => {
      const c = callRef.current;
      if (c) socket?.emit("call:end", { callId: c.callId });
      finish("error", text);
    },
    [socket, finish]
  );

  const restartIce = useCallback(async () => {
    const pc = pcRef.current;
    const c = callRef.current;
    // Only the caller makes offers, so only the caller restarts ICE; the
    // callee just answers the new offer.
    if (!pc || !c || c.direction !== "outgoing" || pc.signalingState !== "stable") return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      sendSignal({ type: "offer", sdp: pc.localDescription.sdp });
    } catch (err) {
      console.error("ICE restart failed:", err);
    }
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const armFailTimer = useCallback(() => {
    clearTimeout(failTimer.current);
    failTimer.current = setTimeout(() => {
      if (stateRef.current === "active" || stateRef.current === "connecting") {
        hangupFromFailure("The connection was lost and couldn't be restored.");
      }
    }, GRACE_BEFORE_FAIL_MS);
  }, [hangupFromFailure]);

  const createPeer = useCallback(async () => {
    if (pcRef.current) return pcRef.current;
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle", iceCandidatePoolSize: 2 });
    pcRef.current = pc;

    remoteRef.current = new MediaStream();
    setRemoteStream(remoteRef.current);

    pc.ontrack = (e) => {
      const stream = remoteRef.current;
      if (!stream) return;
      if (!stream.getTracks().some((t) => t.id === e.track.id)) stream.addTrack(e.track);
      // New MediaStream identity so <video>/<audio> pick up added tracks.
      setRemoteStream(new MediaStream(stream.getTracks()));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal({ candidate: e.candidate.toJSON() });
    };

    const onConn = () => {
      const ice = pc.iceConnectionState;
      const conn = pc.connectionState;
      if (ice === "connected" || ice === "completed" || conn === "connected") {
        markConnected();
        setReconnecting(false);
        clearTimeout(failTimer.current);
      } else if (ice === "disconnected") {
        if (stateRef.current === "active") {
          setReconnecting(true);
          armFailTimer();
        }
      } else if (ice === "failed" || conn === "failed") {
        if (stateRef.current === "active" || stateRef.current === "connecting") {
          setReconnecting(true);
          restartIce();
          armFailTimer();
        }
      }
    };
    pc.oniceconnectionstatechange = onConn;
    pc.onconnectionstatechange = onConn;

    localRef.current?.getTracks().forEach((track) => pc.addTrack(track, localRef.current));
    return pc;
  }, [armFailTimer, restartIce, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const flushCandidates = async (pc) => {
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch (err) {
        console.warn("addIceCandidate failed:", err);
      }
    }
  };

  // ---- caller side ------------------------------------------------------
  const startCall = useCallback(
    async (conversation, mode) => {
      if (stateRef.current !== "idle") {
        showNotice("info", "You're already in a call.");
        return;
      }
      if (!socket?.connected) {
        showNotice("error", "You're offline. Reconnect and try again.");
        return;
      }
      const peerMember = conversation.members.find((m) => (m.id || m._id) !== userRef.current.id);
      if (!peerMember) return;
      const peer = userBrief(peerMember);

      callRef.current = {
        callId: null,
        conversationId: conversation._id,
        mode,
        direction: "outgoing",
        peer,
      };
      setCall(callRef.current);
      setMinimized(false);
      setState("calling");

      try {
        await acquireMedia(mode);
      } catch (err) {
        finish("error", mediaErrorMessage(err, mode), { sound: false });
        return;
      }

      socket.emit("call:invite", { conversationId: conversation._id, mode }, (res) => {
        if (stateRef.current === "idle") return; // canceled while the request was in flight
        if (res?.error) return finish("error", res.error, { sound: false });
        if (res?.busy) return finish("info", `${peer.name} is on another call.`);
        callRef.current = { ...callRef.current, callId: res.callId };
        setCall(callRef.current);
        setState(res.ringing ? "ringing" : "calling");
        startRing("outgoing");
        if (!res.ringing) showNotice("info", `${peer.name} is offline — they'll see a missed call.`, 5000);
      });
    },
    [socket, finish, showNotice]
  );

  // ---- callee side -------------------------------------------------------
  const acceptCall = useCallback(async () => {
    const c = callRef.current;
    if (!c || stateRef.current !== "incoming") return;
    stopRing();
    setState("connecting");
    setMinimized(false);
    try {
      localReady.current = acquireMedia(c.mode);
      await localReady.current;
    } catch (err) {
      socket?.emit("call:reject", { callId: c.callId });
      finish("error", mediaErrorMessage(err, c.mode), { sound: false });
      return;
    }
    socket?.emit("call:accept", { callId: c.callId }, (res) => {
      if (res?.error) finish("info", res.error, { sound: false });
    });
    armFailTimer();
  }, [socket, finish, armFailTimer]);

  const rejectCall = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    socket?.emit("call:reject", { callId: c.callId });
    finish("info", null, { sound: false });
  }, [socket, finish]);

  const endCall = useCallback(() => {
    const c = callRef.current;
    if (c?.callId) socket?.emit("call:end", { callId: c.callId });
    finish("info", null);
  }, [socket, finish]);

  // ---- in-call controls --------------------------------------------------
  const broadcastMedia = (m, cam) => {
    const c = callRef.current;
    if (c?.callId) socket?.emit("call:media-state", { callId: c.callId, muted: m, cameraOff: cam });
  };

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    broadcastMedia(next, cameraOffRef.current);
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCamera = useCallback(() => {
    if (callRef.current?.mode !== "video") return;
    const next = !cameraOffRef.current;
    cameraOffRef.current = next;
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
    broadcastMedia(mutedRef.current, next);
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = useCallback(async () => {
    const c = callRef.current;
    const pc = pcRef.current;
    if (!c || c.mode !== "video" || !pc) return;
    const nextFacing = facingRef.current === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const newTrack = fresh.getVideoTracks()[0];
      newTrack.enabled = !cameraOffRef.current;
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(newTrack);
      localRef.current?.getVideoTracks().forEach((t) => {
        t.stop();
        localRef.current.removeTrack(t);
      });
      localRef.current?.addTrack(newTrack);
      setLocalStream(new MediaStream(localRef.current.getTracks()));
      facingRef.current = nextFacing;
      setFacingMode(nextFacing);
    } catch (err) {
      showNotice("error", "Couldn't switch cameras on this device.");
    }
  }, [showNotice]);

  // ---- signaling listeners ------------------------------------------------
  useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = (data) => {
      if (stateRef.current !== "idle") return; // server already reports busy to the caller
      callRef.current = {
        callId: data.callId,
        conversationId: data.conversationId,
        mode: data.mode,
        direction: "incoming",
        peer: data.caller,
      };
      setCall(callRef.current);
      setMinimized(false);
      setState("incoming");
      startRing("incoming");
      if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(`${data.caller.name} is calling`, {
            body: data.mode === "video" ? "Incoming video call" : "Incoming voice call",
            tag: `call-${data.callId}`,
            requireInteraction: true,
          });
          n.onclick = () => window.focus();
        } catch {
          // notifications unavailable
        }
      }
    };

    const onRinging = () => {
      if (stateRef.current === "calling") setState("ringing");
    };

    // Caller: the callee picked up -> build the connection and send the offer.
    const onAccepted = async ({ callId }) => {
      const c = callRef.current;
      if (!c || c.callId !== callId) return;
      stopRing();
      setState("connecting");
      try {
        const pc = await createPeer();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: "offer", sdp: pc.localDescription.sdp });
        armFailTimer();
      } catch (err) {
        console.error("Failed to start the connection:", err);
        hangupFromFailure("Couldn't establish the call connection.");
      }
    };

    const onSignal = async ({ callId, data }) => {
      const c = callRef.current;
      if (!c || c.callId !== callId || !data) return;
      try {
        if (data.type === "offer") {
          // Callee: make sure our mic/camera are ready before answering.
          if (localReady.current) await localReady.current;
          const pc = await createPeer();
          await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: "answer", sdp: pc.localDescription.sdp });
        } else if (data.type === "answer") {
          const pc = pcRef.current;
          if (!pc) return;
          await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
          await flushCandidates(pc);
        } else if (data.candidate) {
          const pc = pcRef.current;
          if (pc && pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else pendingCandidates.current.push(data.candidate);
        }
      } catch (err) {
        console.error("Signaling error:", err);
        hangupFromFailure("Couldn't establish the call connection.");
      }
    };

    const onMediaState = ({ callId, muted: m, cameraOff: cam }) => {
      if (callRef.current?.callId === callId) setRemoteMedia({ muted: !!m, cameraOff: !!cam });
    };

    const onEnded = ({ callId, status, reason }) => {
      const c = callRef.current;
      if (!c || (c.callId && c.callId !== callId)) return;
      const iAmCaller = c.direction === "outgoing";
      const name = c.peer?.name || "They";
      let text = null;
      let kind = "info";
      if (status === "declined" && iAmCaller) text = `${name} declined the call.`;
      else if (status === "missed" && iAmCaller) text = `${name} didn't answer.`;
      else if (status === "missed") text = `Missed ${c.mode === "video" ? "video" : "voice"} call from ${name}.`;
      else if (status === "busy") text = `${name} is on another call.`;
      else if (reason === "connection-lost") {
        text = "The call ended because the connection was lost.";
        kind = "error";
      }
      finish(kind, text);
    };

    // Answered/declined on another tab or device of mine.
    const onHandled = ({ callId }) => {
      if (callRef.current?.callId === callId && stateRef.current === "incoming") {
        finish("info", null, { sound: false });
      }
    };

    // Callee returned after a socket drop: the caller re-offers with fresh ICE.
    const onPeerResumed = ({ callId }) => {
      if (callRef.current?.callId !== callId) return;
      restartIce();
    };
    const onPeerReconnecting = ({ callId }) => {
      if (callRef.current?.callId === callId && stateRef.current === "active") setReconnecting(true);
    };

    // This socket reconnected mid-call: re-attach to the server-side call.
    const onConnect = () => {
      const c = callRef.current;
      if (!c?.callId) return;
      if (stateRef.current === "active" || stateRef.current === "connecting") {
        socket.emit("call:resume", { callId: c.callId });
        if (c.direction === "outgoing") restartIce();
      }
    };

    const onBusyNotice = ({ caller, mode }) => {
      showNotice("info", `${caller.name} tried to ${mode === "video" ? "video call" : "call"} you while you were on another call.`, 5000);
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:ringing", onRinging);
    socket.on("call:accepted", onAccepted);
    socket.on("call:signal", onSignal);
    socket.on("call:media-state", onMediaState);
    socket.on("call:ended", onEnded);
    socket.on("call:handled", onHandled);
    socket.on("call:peer-resumed", onPeerResumed);
    socket.on("call:peer-reconnecting", onPeerReconnecting);
    socket.on("call:busy-notice", onBusyNotice);
    socket.on("connect", onConnect);

    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:ringing", onRinging);
      socket.off("call:accepted", onAccepted);
      socket.off("call:signal", onSignal);
      socket.off("call:media-state", onMediaState);
      socket.off("call:ended", onEnded);
      socket.off("call:handled", onHandled);
      socket.off("call:peer-resumed", onPeerResumed);
      socket.off("call:peer-reconnecting", onPeerReconnecting);
      socket.off("call:busy-notice", onBusyNotice);
      socket.off("connect", onConnect);
    };
  }, [socket, createPeer, armFailTimer, hangupFromFailure, restartIce, finish, showNotice]);

  // ---- history / missed-call indicator ------------------------------------
  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/calls");
      setHistory(data.calls);
    } catch {
      // keep what we have
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (user?.id) loadHistory();
  }, [user?.id, loadHistory]);

  useEffect(() => {
    if (!socket) return undefined;
    const onRecord = (record) => {
      setHistory((prev) => (prev.some((c) => c.callId === record.callId) ? prev : [record, ...prev]));
    };
    const onReconnect = () => loadHistory();
    socket.on("call:record", onRecord);
    socket.io.on("reconnect", onReconnect);
    return () => {
      socket.off("call:record", onRecord);
      socket.io.off("reconnect", onReconnect);
    };
  }, [socket, loadHistory]);

  const missedCount = useMemo(
    () =>
      history.filter(
        (c) => c.status === "missed" && c.callee?.id === user?.id && new Date(c.startedAt).getTime() > missedSeenAt
      ).length,
    [history, user?.id, missedSeenAt]
  );

  const markCallsSeen = useCallback(() => {
    const now = Date.now();
    localStorage.setItem("velora_calls_seen", String(now));
    setMissedSeenAt(now);
  }, []);

  // ---- safety nets ----------------------------------------------------------
  // Closing the tab or navigating away must not leave the other person
  // ringing / a camera on: tell the server, release devices.
  useEffect(() => {
    const onUnload = () => {
      const c = callRef.current;
      if (c?.callId) socket?.emit("call:end", { callId: c.callId });
      cleanup();
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [socket, cleanup]);

  // Logging out / unmounting with a live call.
  useEffect(
    () => () => {
      const c = callRef.current;
      if (c?.callId) socket?.emit("call:end", { callId: c.callId });
      cleanup();
      clearTimeout(noticeTimer.current);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // If the signaling socket is gone for good while ringing, don't hang.
  useEffect(() => {
    if (!socket && stateRef.current !== "idle") finish("error", "You were disconnected.", { sound: false });
  }, [socket, finish]);

  const value = useMemo(
    () => ({
      call,
      callState,
      inCall: callState !== "idle",
      minimized,
      setMinimized,
      localStream,
      remoteStream,
      muted,
      cameraOff,
      remoteMedia,
      reconnecting,
      seconds,
      notice,
      dismissNotice: () => setNotice(null),
      canSwitchCamera,
      facingMode,
      history,
      historyLoaded,
      loadHistory,
      missedCount,
      markCallsSeen,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      toggleCamera,
      switchCamera,
    }),
    [
      call, callState, minimized, localStream, remoteStream, muted, cameraOff, remoteMedia, reconnecting,
      seconds, notice, canSwitchCamera, facingMode, history, historyLoaded, loadHistory, missedCount,
      markCallsSeen, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleCamera, switchCamera,
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};
