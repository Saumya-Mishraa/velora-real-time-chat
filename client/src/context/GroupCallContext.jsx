import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useSocket } from "./SocketContext.jsx";
import { useCall } from "./CallContext.jsx";
import api from "../services/api.js";
import { startRing, stopRing, playTone } from "../utils/ringtone.js";
import useScreenShare from "../hooks/useScreenShare.js";
import useCallExtras from "../hooks/useCallExtras.js";

// ---------------------------------------------------------------------
// Group calls (voice + video): mesh WebRTC, up to 4 people.
//
// Entirely separate from the one-to-one CallContext, which keeps working
// exactly as before. Signaling is group-call:* (server/src/socket/
// groupCallHandler.js); STUN/TURN come from the same GET /api/calls/ice.
//
// Who sends the offer: the person JOINING sends an offer to every person
// already in the call, so each pair has exactly one deterministic
// initiator (no glare). Every peer connection carries an audio transceiver
// and a (sendrecv) video transceiver, so camera on/off, camera switching
// and screen sharing are replaceTrack() calls - never a renegotiation.
// ---------------------------------------------------------------------

const GroupCallContext = createContext(null);

const FAIL_AFTER_MS = 25000;
const MAX_VIDEO_BITRATE = 700_000; // keeps a 4-way mesh uplink reasonable

const mediaErrorMessage = (err, video) => {
  const what = video ? "camera and microphone" : "microphone";
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

export const GroupCallProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { callState: oneToOneState } = useCall();
  const selfId = String(user?.id || "");

  const [phase, setPhase] = useState("idle"); // idle | joining | active
  const [info, setInfo] = useState(null); // { callId, conversationId, mode, startedAt, groupName }
  const [participants, setParticipants] = useState([]); // remote people only
  const [localStream, setLocalStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(true);
  const [incoming, setIncoming] = useState(null);
  const [activeCalls, setActiveCalls] = useState({}); // conversationId -> group-call:state
  const [notice, setNotice] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [initialHands, setInitialHands] = useState({});
  const [seconds, setSeconds] = useState(0);

  const infoRef = useRef(null);
  const phaseRef = useRef("idle");
  const localRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const peersRef = useRef(new Map()); // userId -> { pc, initiator, queued, stream, chain, failTimer, localAttached }
  const iceRef = useRef([]);
  const mutedRef = useRef(false);
  const cameraOffRef = useRef(true);
  const facingRef = useRef("user");
  const noticeTimer = useRef(null);
  const ringTimer = useRef(null);
  const socketRef = useRef(socket);
  socketRef.current = socket;
  infoRef.current = info;
  phaseRef.current = phase;

  const showNotice = useCallback((kind, text, ms = 5000) => {
    clearTimeout(noticeTimer.current);
    setNotice({ kind, text });
    if (ms) noticeTimer.current = setTimeout(() => setNotice(null), ms);
  }, []);

  // ---- participants helpers -------------------------------------------
  const patchParticipant = useCallback((userId, patch) => {
    setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, ...patch } : p)));
  }, []);
  const upsertParticipant = useCallback((p) => {
    setParticipants((prev) =>
      prev.some((x) => x.userId === p.userId)
        ? prev.map((x) => (x.userId === p.userId ? { ...x, ...p } : x))
        : [...prev, { status: "connecting", stream: null, ...p }]
    );
  }, []);

  // ---- screen share (replaceTrack on every peer's video sender) ----------
  const screenRef = useRef(null);
  const screen = useScreenShare({
    getPeerConnections: () => Array.from(peersRef.current.values()).map((p) => p.pc),
    getCameraTrack: () => (cameraOffRef.current ? null : cameraTrackRef.current),
    onChange: (sharing) => {
      const c = infoRef.current;
      if (c) socketRef.current?.emit("group-call:media-state", { callId: c.callId, muted: mutedRef.current, cameraOff: cameraOffRef.current, sharing });
    },
  });
  screenRef.current = screen;

  const extras = useCallExtras({ socket, callId: info?.callId, selfId, initialHands });

  // ---- peer connections ---------------------------------------------------
  const sendSignal = (to, data) => {
    const c = infoRef.current;
    if (c) socketRef.current?.emit("group-call:signal", { callId: c.callId, to, data });
  };

  const currentVideoTrack = () =>
    screenRef.current?.previewStream?.getVideoTracks()[0] || (cameraOffRef.current ? null : cameraTrackRef.current);

  const tuneVideoSender = (sender) => {
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = MAX_VIDEO_BITRATE;
      sender.setParameters(params).catch(() => {});
    } catch {
      /* optional optimisation */
    }
  };

  // Local audio + video onto a peer connection. The offerer creates its
  // transceivers; the answerer re-uses the ones created from the offer.
  const attachLocalTracks = (peer) => {
    if (peer.localAttached) return;
    peer.localAttached = true;
    const local = localRef.current;
    const { pc } = peer;
    local?.getAudioTracks().forEach((t) => pc.addTrack(t, local));
    let vt = pc.getTransceivers().find((t) => t.receiver?.track?.kind === "video");
    if (!vt) vt = pc.addTransceiver("video", { direction: "sendrecv", streams: local ? [local] : [] });
    vt.direction = "sendrecv";
    const track = currentVideoTrack();
    if (track) vt.sender.replaceTrack(track).catch(() => {});
    tuneVideoSender(vt.sender);
  };

  const closePeer = useCallback((userId) => {
    const peer = peersRef.current.get(userId);
    if (!peer) return;
    clearTimeout(peer.failTimer);
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.oniceconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch {
      /* already closed */
    }
    peersRef.current.delete(userId);
  }, []);

  const negotiate = async (userId, { iceRestart = false } = {}) => {
    const peer = peersRef.current.get(userId);
    if (!peer || peer.pc.signalingState === "closed") return;
    try {
      const offer = await peer.pc.createOffer({ iceRestart });
      await peer.pc.setLocalDescription(offer);
      sendSignal(userId, { type: "offer", sdp: peer.pc.localDescription });
    } catch (err) {
      console.error("group call offer failed", err);
    }
  };

  const createPeer = (userId, initiator) => {
    const existing = peersRef.current.get(userId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceRef.current, bundlePolicy: "max-bundle", iceCandidatePoolSize: 2 });
    const peer = { pc, initiator, queued: [], stream: new MediaStream(), chain: Promise.resolve(), failTimer: null, localAttached: false };
    peersRef.current.set(userId, peer);

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(userId, { type: "candidate", candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (!peer.stream.getTracks().some((t) => t.id === e.track.id)) peer.stream.addTrack(e.track);
      patchParticipant(userId, { stream: new MediaStream(peer.stream.getTracks()) });
    };
    const onState = () => {
      const state = pc.connectionState;
      const ice = pc.iceConnectionState;
      if (state === "connected" || ice === "connected" || ice === "completed") {
        clearTimeout(peer.failTimer);
        patchParticipant(userId, { status: "connected" });
      } else if (ice === "disconnected") {
        patchParticipant(userId, { status: "reconnecting" });
      } else if (state === "failed" || ice === "failed") {
        patchParticipant(userId, { status: "reconnecting" });
        if (peer.initiator) negotiate(userId, { iceRestart: true });
        clearTimeout(peer.failTimer);
        peer.failTimer = setTimeout(() => patchParticipant(userId, { status: "failed" }), FAIL_AFTER_MS);
      }
    };
    pc.onconnectionstatechange = onState;
    pc.oniceconnectionstatechange = onState;

    if (initiator) attachLocalTracks(peer);
    return peer;
  };

  const flushQueued = async (peer) => {
    const queued = peer.queued.splice(0);
    for (const c of queued) {
      try {
        await peer.pc.addIceCandidate(c);
      } catch {
        /* stale candidate */
      }
    }
  };

  const handleSignal = useCallback(({ callId, from, data }) => {
    const c = infoRef.current;
    if (!c || callId !== c.callId || !data) return;
    const peer = peersRef.current.get(from) || (data.type === "offer" ? createPeer(from, false) : null);
    if (!peer) return;
    // Serialise per peer: an offer, its candidates and any restart arrive back to back.
    peer.chain = peer.chain
      .then(async () => {
        const { pc } = peer;
        if (data.type === "offer") {
          await pc.setRemoteDescription(data.sdp);
          attachLocalTracks(peer);
          await flushQueued(peer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(from, { type: "answer", sdp: pc.localDescription });
        } else if (data.type === "answer") {
          await pc.setRemoteDescription(data.sdp);
          await flushQueued(peer);
        } else if (data.type === "candidate" && data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else peer.queued.push(data.candidate);
        }
      })
      .catch((err) => console.error("group call signal failed", err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- local media -----------------------------------------------------
  const acquireMedia = async (wantVideo, facing = "user") => {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      const err = new Error("unsupported");
      err.name = window.isSecureContext ? "NotFoundError" : "SecurityError";
      throw err;
    }
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    let stream;
    let gotVideo = false;
    if (wantVideo) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio, video: { facingMode: { ideal: facing }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24 } } });
        gotVideo = true;
      } catch (err) {
        if (err?.name === "NotAllowedError" || err?.name === "SecurityError") throw err;
        // No camera: carry on with audio only rather than not joining at all.
        stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      }
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    }
    localRef.current = stream;
    cameraTrackRef.current = stream.getVideoTracks()[0] || null;
    setLocalStream(stream);
    cameraOffRef.current = !gotVideo;
    setCameraOff(!gotVideo);
    mutedRef.current = false;
    setMuted(false);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitchCamera(devices.filter((d) => d.kind === "videoinput").length > 1);
    } catch {
      setCanSwitchCamera(false);
    }
    return { stream, gotVideo };
  };

  const getIce = async () => {
    try {
      const { data } = await api.get("/calls/ice");
      iceRef.current = data.iceServers;
    } catch {
      iceRef.current = [{ urls: "stun:stun.l.google.com:19302" }];
    }
  };

  const teardown = useCallback(() => {
    clearTimeout(ringTimer.current);
    stopRing();
    Array.from(peersRef.current.keys()).forEach(closePeer);
    screenRef.current?.stop?.();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    cameraTrackRef.current = null;
    setLocalStream(null);
    setParticipants([]);
    setInfo(null);
    setPhase("idle");
    setMinimized(false);
    setCameraOff(true);
    setMuted(false);
    setInitialHands({});
    setSeconds(0);
  }, [closePeer]);

  // ---- public actions -------------------------------------------------
  const busyMessage = () => {
    if (oneToOneState !== "idle") return "Finish your current call first.";
    if (phaseRef.current !== "idle") return "You're already in a group call.";
    return "";
  };

  const startGroupCall = useCallback(
    async (conversationId, mode, groupName = "") => {
      const busy = busyMessage();
      if (busy) return showNotice("error", busy);
      if (!socketRef.current?.connected) return showNotice("error", "You're offline. Reconnect and try again.");
      setPhase("joining");
      try {
        await acquireMedia(mode === "video");
        await getIce();
      } catch (err) {
        teardown();
        return showNotice("error", mediaErrorMessage(err, mode === "video"));
      }
      socketRef.current.emit("group-call:start", { conversationId, mode }, (res) => {
        if (res?.error) {
          teardown();
          return showNotice("error", res.error);
        }
        setInfo({ callId: res.callId, conversationId, mode, startedAt: new Date(res.startedAt).getTime(), groupName });
        setParticipants([]);
        setPhase("active");
        playTone("connected");
      });
    },
    [oneToOneState, showNotice, teardown] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const joinGroupCall = useCallback(
    async (callId, { mode = "audio", conversationId, groupName = "" } = {}) => {
      const busy = busyMessage();
      if (busy) return showNotice("error", busy);
      if (!socketRef.current?.connected) return showNotice("error", "You're offline. Reconnect and try again.");
      stopRing();
      setIncoming(null);
      setPhase("joining");
      let gotVideo = false;
      try {
        ({ gotVideo } = await acquireMedia(mode === "video"));
        await getIce();
      } catch (err) {
        teardown();
        return showNotice("error", mediaErrorMessage(err, mode === "video"));
      }
      socketRef.current.emit("group-call:join", { callId }, (res) => {
        if (res?.error) {
          teardown();
          return showNotice("error", res.error);
        }
        const roster = res.participants.map((p) => ({ ...p, status: "connecting", stream: null }));
        const hands = {};
        res.participants.forEach((p) => p.hand && (hands[p.userId] = true));
        setInitialHands(hands);
        setInfo({ callId: res.callId, conversationId: res.conversationId || conversationId, mode: res.mode, startedAt: new Date(res.startedAt).getTime(), groupName });
        setParticipants(roster);
        setPhase("active");
        playTone("connected");
        // I'm the newcomer: I offer to everyone already here.
        res.participants.forEach((p) => {
          createPeer(p.userId, true);
          negotiate(p.userId);
        });
        socketRef.current.emit("group-call:media-state", { callId: res.callId, muted: mutedRef.current, cameraOff: cameraOffRef.current, sharing: false });
        if (mode === "video" && !gotVideo) showNotice("info", "Joined without a camera.");
      });
    },
    [oneToOneState, showNotice, teardown] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const leaveGroupCall = useCallback(() => {
    const c = infoRef.current;
    if (c) socketRef.current?.emit("group-call:leave", { callId: c.callId });
    playTone("end");
    teardown();
  }, [teardown]);

  const broadcastMedia = (m, cam, sharing) => {
    const c = infoRef.current;
    if (c) socketRef.current?.emit("group-call:media-state", { callId: c.callId, muted: m, cameraOff: cam, sharing: sharing ?? !!screenRef.current?.sharing });
  };

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    broadcastMedia(next, cameraOffRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setVideoOnSenders = async (track) => {
    await Promise.all(
      Array.from(peersRef.current.values()).flatMap((p) =>
        p.pc.getTransceivers().filter((t) => t.receiver?.track?.kind === "video").map((t) => t.sender.replaceTrack(track).catch(() => {}))
      )
    );
  };

  const toggleCamera = useCallback(async () => {
    if (!infoRef.current) return;
    if (cameraOffRef.current) {
      // Turning ON (works even in a voice call: the video transceiver is already negotiated).
      try {
        if (!cameraTrackRef.current || cameraTrackRef.current.readyState === "ended") {
          const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingRef.current }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24 } } });
          cameraTrackRef.current = fresh.getVideoTracks()[0];
          localRef.current?.addTrack(cameraTrackRef.current);
          setLocalStream(new MediaStream(localRef.current.getTracks()));
        }
        cameraTrackRef.current.enabled = true;
        cameraOffRef.current = false;
        setCameraOff(false);
        if (!screenRef.current?.sharing) await setVideoOnSenders(cameraTrackRef.current);
        broadcastMedia(mutedRef.current, false);
      } catch (err) {
        showNotice("error", mediaErrorMessage(err, true));
      }
    } else {
      cameraOffRef.current = true;
      if (cameraTrackRef.current) cameraTrackRef.current.enabled = false;
      setCameraOff(true);
      broadcastMedia(mutedRef.current, true);
    }
  }, [showNotice]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = useCallback(async () => {
    if (cameraOffRef.current || screenRef.current?.sharing) return;
    const next = facingRef.current === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: next }, width: { ideal: 960 }, height: { ideal: 540 } } });
      const track = fresh.getVideoTracks()[0];
      await setVideoOnSenders(track);
      const local = localRef.current;
      local?.getVideoTracks().forEach((t) => {
        t.stop();
        local.removeTrack(t);
      });
      local?.addTrack(track);
      cameraTrackRef.current = track;
      setLocalStream(new MediaStream(local.getTracks()));
      facingRef.current = next;
      setFacingMode(next);
    } catch {
      showNotice("error", "Couldn't switch cameras on this device.");
    }
  }, [showNotice]);

  const acceptIncoming = useCallback(() => {
    if (!incoming) return;
    joinGroupCall(incoming.callId, { mode: incoming.mode, conversationId: incoming.conversationId, groupName: incoming.groupName });
  }, [incoming, joinGroupCall]);

  const declineIncoming = useCallback(() => {
    if (!incoming) return;
    socketRef.current?.emit("group-call:decline", { callId: incoming.callId });
    clearTimeout(ringTimer.current);
    stopRing();
    setIncoming(null);
  }, [incoming]);

  // Ask the server whether a call is running in this chat (join banner).
  const refreshStatus = useCallback((conversationId) => {
    const sock = socketRef.current;
    if (!sock?.connected || !conversationId) return;
    sock.emit("group-call:status", { conversationId }, (res) => {
      setActiveCalls((prev) => {
        const next = { ...prev };
        if (res?.active) next[conversationId] = res;
        else delete next[conversationId];
        return next;
      });
    });
  }, []);

  // ---- socket events ----------------------------------------------------
  useEffect(() => {
    if (!socket) return undefined;

    const onRing = (r) => {
      // Busy (either kind of call) or already ringing: the server only rings idle users, but tabs race.
      if (phaseRef.current !== "idle" || oneToOneState !== "idle") return;
      setIncoming(r);
      startRing("incoming");
      navigator.vibrate?.([200, 100, 200]);
      clearTimeout(ringTimer.current);
      ringTimer.current = setTimeout(() => {
        stopRing();
        setIncoming((cur) => (cur?.callId === r.callId ? null : cur));
      }, (r.ringTimeoutMs || 35000) + 1000);
    };
    const dismissRing = ({ callId }) => {
      setIncoming((cur) => {
        if (cur?.callId === callId) {
          clearTimeout(ringTimer.current);
          stopRing();
          return null;
        }
        return cur;
      });
    };
    const onState = (s) => {
      setActiveCalls((prev) => {
        const next = { ...prev };
        if (s.active) next[s.conversationId] = s;
        else delete next[s.conversationId];
        return next;
      });
    };
    const onEnded = (e) => {
      dismissRing(e);
      if (infoRef.current?.callId === e.callId) {
        playTone("end");
        teardown();
        if (e.reason === "no-answer") showNotice("info", "No one joined the call.");
        else if (e.reason === "connection-lost") showNotice("error", "The call was disconnected.");
      }
    };
    const onJoined = ({ callId, participant }) => {
      if (infoRef.current?.callId !== callId) return;
      upsertParticipant({ ...participant, status: "connecting" }); // they will send us an offer
      playTone("connected");
    };
    const onLeft = ({ callId, userId }) => {
      if (infoRef.current?.callId !== callId) return;
      closePeer(userId);
      setParticipants((prev) => prev.filter((p) => p.userId !== userId));
    };
    const onMedia = ({ callId, userId, muted: m, cameraOff: cam, sharing }) => {
      if (infoRef.current?.callId === callId) patchParticipant(userId, { muted: m, cameraOff: cam, sharing });
    };
    const onReconnecting = ({ callId, userId }) => infoRef.current?.callId === callId && patchParticipant(userId, { status: "reconnecting" });
    const onResumed = ({ callId, userId }) => {
      if (infoRef.current?.callId !== callId) return;
      const peer = peersRef.current.get(userId);
      if (peer?.initiator) negotiate(userId, { iceRestart: true });
    };
    const onNoAnswer = ({ callId }) => infoRef.current?.callId === callId && showNotice("info", "No one answered.");
    // After a socket reconnect, re-attach to the call (the server held our seat for a grace period).
    const onConnect = () => {
      const c = infoRef.current;
      if (c) {
        socket.emit("group-call:resume", { callId: c.callId }, (res) => {
          if (res?.error) {
            teardown();
            showNotice("error", "The call has ended.");
          } else {
            Array.from(peersRef.current.entries()).forEach(([uid, peer]) => peer.initiator && negotiate(uid, { iceRestart: true }));
          }
        });
        socket.emit("group-call:media-state", { callId: c.callId, muted: mutedRef.current, cameraOff: cameraOffRef.current, sharing: !!screenRef.current?.sharing });
      }
    };

    socket.on("group-call:ring", onRing);
    socket.on("group-call:ring-ended", dismissRing);
    socket.on("group-call:handled", dismissRing);
    socket.on("group-call:state", onState);
    socket.on("group-call:ended", onEnded);
    socket.on("group-call:participant-joined", onJoined);
    socket.on("group-call:participant-left", onLeft);
    socket.on("group-call:signal", handleSignal);
    socket.on("group-call:media-state", onMedia);
    socket.on("group-call:peer-reconnecting", onReconnecting);
    socket.on("group-call:peer-resumed", onResumed);
    socket.on("group-call:no-answer", onNoAnswer);
    socket.io.on("reconnect", onConnect);
    return () => {
      socket.off("group-call:ring", onRing);
      socket.off("group-call:ring-ended", dismissRing);
      socket.off("group-call:handled", dismissRing);
      socket.off("group-call:state", onState);
      socket.off("group-call:ended", onEnded);
      socket.off("group-call:participant-joined", onJoined);
      socket.off("group-call:participant-left", onLeft);
      socket.off("group-call:signal", handleSignal);
      socket.off("group-call:media-state", onMedia);
      socket.off("group-call:peer-reconnecting", onReconnecting);
      socket.off("group-call:peer-resumed", onResumed);
      socket.off("group-call:no-answer", onNoAnswer);
      socket.io.off("reconnect", onConnect);
    };
  }, [socket, oneToOneState, handleSignal, teardown, showNotice, closePeer, patchParticipant, upsertParticipant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer.
  useEffect(() => {
    if (phase !== "active" || !info?.startedAt) return undefined;
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - info.startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, info?.startedAt]);

  // Closing the tab / logging out: release the seat promptly.
  useEffect(() => {
    const onUnload = () => infoRef.current && socketRef.current?.emit("group-call:leave", { callId: infoRef.current.callId });
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      teardown();
    };
  }, [teardown]);

  const value = useMemo(
    () => ({
      phase,
      inGroupCall: phase !== "idle",
      info,
      participants,
      localStream,
      muted,
      cameraOff,
      incoming,
      activeCalls,
      notice,
      dismissNotice: () => setNotice(null),
      minimized,
      setMinimized,
      canSwitchCamera,
      facingMode,
      seconds,
      screen,
      extras,
      startGroupCall,
      joinGroupCall,
      leaveGroupCall,
      toggleMute,
      toggleCamera,
      switchCamera,
      acceptIncoming,
      declineIncoming,
      refreshStatus,
    }),
    [
      phase, info, participants, localStream, muted, cameraOff, incoming, activeCalls, notice, minimized, canSwitchCamera,
      facingMode, seconds, screen, extras, startGroupCall, joinGroupCall, leaveGroupCall, toggleMute, toggleCamera,
      switchCamera, acceptIncoming, declineIncoming, refreshStatus,
    ]
  );

  return <GroupCallContext.Provider value={value}>{children}</GroupCallContext.Provider>;
};

export const useGroupCall = () => {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error("useGroupCall must be used inside <GroupCallProvider>");
  return ctx;
};
