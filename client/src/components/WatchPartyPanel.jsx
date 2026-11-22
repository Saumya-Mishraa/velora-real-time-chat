import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Play, Crown, Users, Link2, Loader2, Volume2, VolumeX, Hand } from "lucide-react";
import { useSocket } from "../context/SocketContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useWatchTogether } from "../context/WatchTogetherContext.jsx";
import api from "../services/api.js";
import { parseYouTubeId } from "../utils/youtube.js";

// ---- YouTube IFrame Player API loader (once per page) ---------------------
let ytPromise = null;
const loadYouTube = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytPromise) {
    ytPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => {
        ytPromise = null;
        reject(new Error("Couldn't load the YouTube player."));
      };
      document.head.appendChild(tag);
    });
  }
  return ytPromise;
};

const DRIFT_TOLERANCE_S = 1.2; // follower is re-synced if more than this off
const SEEK_DETECT_S = 1.5; // controller jumped by more than this -> a seek
const HEARTBEAT_MS = 5000;
const APPLY_GUARD_MS = 900; // ignore our own player's events right after we drove it

// Watch Together panel: host/controller drives, everyone else follows.
// Sync model: the server stores { time, playing, sentAt } where `time` is the
// position at server instant `sentAt`. Followers add (serverClock - sentAt)
// while playing, which compensates network latency. Feedback loops are
// avoided by ignoring our own player events for a short guard window after
// we drive it from a remote state.
const WatchPartyPanel = ({ conversationId, members: membersProp, onClose }) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { sessions, applySession, refreshSession } = useWatchTogether();
  const session = sessions[conversationId] || null;
  const selfId = String(user.id);
  const isHost = session && String(session.hostId) === selfId;
  const isController = session && String(session.controllerId) === selfId;

  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const pendingRef = useRef(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const isControllerRef = useRef(false);
  isControllerRef.current = !!isController;
  const offsetRef = useRef(0); // serverClock = Date.now() + offset
  const guardUntil = useRef(0);
  const lastKnown = useRef({ time: 0, at: Date.now(), playing: false });
  const currentVideo = useRef(null);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsTap, setNeedsTap] = useState(false);
  const [muted, setMuted] = useState(false);
  const [members, setMembers] = useState(membersProp);
  const [showPass, setShowPass] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const [ended, setEnded] = useState(false);
  const hadSession = useRef(false);
  if (session) hadSession.current = true;

  const serverNow = () => Date.now() + offsetRef.current;

  // ---- clock offset (best of a few round trips, refreshed periodically) ----
  const syncClock = useCallback(() => {
    if (!socket?.connected) return;
    let best = null;
    let left = 3;
    const probe = () => {
      const t0 = Date.now();
      socket.emit("watch:sync", (res) => {
        const rtt = Date.now() - t0;
        if (res?.serverNow && (!best || rtt < best.rtt)) {
          best = { rtt, offset: res.serverNow - (t0 + rtt / 2) };
          offsetRef.current = best.offset;
        }
        left -= 1;
        if (left > 0) setTimeout(probe, 120);
      });
    };
    probe();
  }, [socket]);

  useEffect(() => {
    syncClock();
    refreshSession(conversationId); // late joiner: get the authoritative position
    const id = setInterval(syncClock, 30000);
    return () => {
      clearInterval(id);
      socket?.emit("watch:leave", { conversationId });
    };
  }, [syncClock, refreshSession, conversationId, socket]);

  // If the chat's member list wasn't handed to us, fetch it when "Pass control" is used.
  const ensureMembers = useCallback(async () => {
    if (members) return;
    try {
      const { data } = await api.get("/conversations");
      const convo = (data.conversations || []).find((c) => String(c._id) === String(conversationId));
      setMembers(convo?.members || []);
    } catch {
      setMembers([]);
    }
  }, [members, conversationId]);

  // ---- driving the player from a server state ------------------------------
  const applyState = useCallback((s) => {
    const p = playerRef.current;
    if (!p || !readyRef.current) {
      pendingRef.current = s;
      return;
    }
    guardUntil.current = Date.now() + APPLY_GUARD_MS;
    const target = s.playing ? s.time + Math.max(0, (serverNow() - s.sentAt) / 1000) : s.time;
    if (currentVideo.current !== s.videoId) {
      currentVideo.current = s.videoId;
      p.loadVideoById({ videoId: s.videoId, startSeconds: target });
      if (!s.playing) setTimeout(() => { guardUntil.current = Date.now() + APPLY_GUARD_MS; p.pauseVideo(); }, 500);
    } else {
      const cur = p.getCurrentTime?.() ?? 0;
      if (Math.abs(cur - target) > DRIFT_TOLERANCE_S) p.seekTo(target, true);
      const st = p.getPlayerState?.();
      if (s.playing && st !== 1 && st !== 3) p.playVideo();
      if (!s.playing && st === 1) p.pauseVideo();
    }
    lastKnown.current = { time: target, at: Date.now(), playing: !!s.playing };
    if (s.playing) {
      // Browsers may block autoplay with sound until a tap: offer one.
      setTimeout(() => {
        const st = playerRef.current?.getPlayerState?.();
        if (sessionRef.current?.playing && st !== 1 && st !== 3) setNeedsTap(true);
      }, 1600);
    } else setNeedsTap(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const emitControl = useCallback(
    (action, extra = {}) => {
      const p = playerRef.current;
      const time = p?.getCurrentTime?.() ?? 0;
      socket?.emit("watch:control", { conversationId, action, time, ...extra }, (res) => {
        if (res?.error) setError(res.error);
        else if (res?.session) applySession(res.session);
      });
    },
    [socket, conversationId, applySession]
  );

  // ---- create the player once there is a session ----------------------------
  const videoId = session?.videoId;
  useEffect(() => {
    if (!videoId || playerRef.current) return undefined;
    let cancelled = false;
    loadYouTube()
      .then((YT) => {
        if (cancelled || !mountRef.current) return;
        const el = document.createElement("div");
        mountRef.current.appendChild(el);
        currentVideo.current = sessionRef.current?.videoId || videoId;
        playerRef.current = new YT.Player(el, {
          videoId: currentVideo.current,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1, modestbranding: 1, origin: window.location.origin },
          events: {
            onReady: () => {
              readyRef.current = true;
              const s = pendingRef.current || sessionRef.current;
              pendingRef.current = null;
              if (s) applyState(s);
            },
            onStateChange: (e) => {
              if (Date.now() < guardUntil.current || !isControllerRef.current) return;
              if (e.data === 1) {
                lastKnown.current = { time: playerRef.current.getCurrentTime(), at: Date.now(), playing: true };
                emitControl("play");
              } else if (e.data === 2 || e.data === 0) {
                lastKnown.current = { time: playerRef.current.getCurrentTime(), at: Date.now(), playing: false };
                emitControl("pause");
              }
            },
            onError: () => setError("This video can't be played here (it may be private or not embeddable)."),
          },
        });
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [videoId, applyState, emitControl]);

  // Destroy the player when the panel goes away.
  useEffect(
    () => () => {
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
      readyRef.current = false;
    },
    []
  );

  // Follow server state (other people's controls, pass/start broadcasts, host acks).
  useEffect(() => {
    if (session) applyState(session);
  }, [session?.videoId, session?.playing, session?.time, session?.sentAt, session?.controllerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Controller: detect seeks (the API has no seek event) + send heartbeats.
  useEffect(() => {
    if (!isController) return undefined;
    const poll = setInterval(() => {
      const p = playerRef.current;
      if (!p || !readyRef.current || Date.now() < guardUntil.current) return;
      const cur = p.getCurrentTime?.() ?? 0;
      const k = lastKnown.current;
      const expected = k.playing ? k.time + (Date.now() - k.at) / 1000 : k.time;
      if (Math.abs(cur - expected) > SEEK_DETECT_S) {
        emitControl("seek");
        lastKnown.current = { time: cur, at: Date.now(), playing: p.getPlayerState?.() === 1 };
      } else {
        lastKnown.current = { time: cur, at: Date.now(), playing: p.getPlayerState?.() === 1 };
      }
    }, 500);
    const beat = setInterval(() => {
      const p = playerRef.current;
      if (p && readyRef.current && p.getPlayerState?.() === 1) emitControl("heartbeat", { playing: true });
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(poll);
      clearInterval(beat);
    };
  }, [isController, emitControl]);

  // Session ended by the host (or the host dropped for good).
  useEffect(() => {
    if (!session && hadSession.current) setEnded(true);
  }, [session]);

  const start = (e) => {
    e.preventDefault();
    setError("");
    if (!parseYouTubeId(url)) return setError("Paste a valid YouTube link (youtube.com or youtu.be).");
    setBusy(true);
    socket?.emit("watch:start", { conversationId, url }, (res) => {
      setBusy(false);
      if (res?.error) setError(res.error);
      else if (res?.session) applySession(res.session);
    });
  };

  const changeVideo = (e) => {
    e.preventDefault();
    setError("");
    if (!parseYouTubeId(url)) return setError("Paste a valid YouTube link (youtube.com or youtu.be).");
    emitControl("load", { url });
    setUrl("");
    setShowChange(false);
  };

  const pass = (memberId) => {
    setShowPass(false);
    socket?.emit("watch:pass", { conversationId, userId: memberId }, (res) => res?.error && setError(res.error));
  };

  const end = () => {
    if (!window.confirm("End the watch party for everyone?")) return;
    socket?.emit("watch:end", { conversationId }, (res) => res?.error && setError(res.error));
  };

  const tapToSync = () => {
    setNeedsTap(false);
    playerRef.current?.playVideo?.();
    if (sessionRef.current) applyState(sessionRef.current);
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isMuted()) p.unMute();
    else p.mute();
    setMuted(p.isMuted());
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nameOf = (id) => (members || []).find((m) => String(m.id || m._id) === String(id))?.name;
  const candidates = (members || []).filter((m) => String(m.id || m._id) !== selfId);

  return (
    <div className="fixed inset-0 z-[97] bg-black/80 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Watch together">
      <div className="w-full sm:max-w-3xl bg-sidebar border border-white/10 sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[100dvh] pb-[env(safe-area-inset-bottom,0px)] overflow-y-auto">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <Play size={16} className="text-ember flex-shrink-0" />
          <h2 className="font-display font-semibold flex-1 min-w-0 truncate">Watch together</h2>
          {session && (
            <span className="text-[11px] flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
              {isController ? <><Crown size={11} /> You control</> : <><Users size={11} /> Following{nameOf(session.controllerId) ? ` ${nameOf(session.controllerId)}` : ""}</>}
            </span>
          )}
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {ended && !session ? (
          <div className="p-6 text-center">
            <p className="text-sm mb-3">The watch party has ended.</p>
            <button onClick={onClose} className="bg-ember text-bg rounded-xl px-5 py-2.5 min-h-[44px] font-medium">Close</button>
          </div>
        ) : !session ? (
          <form onSubmit={start} className="p-4 space-y-3">
            <p className="text-sm text-muted">Paste a YouTube link. Everyone in this chat can join and watch in sync.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 min-w-0">
                <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=…"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-label="YouTube link"
                  className="w-full bg-chat border border-white/5 focus:border-ember/50 outline-none rounded-xl pl-9 pr-3 py-3 text-base sm:text-sm placeholder:text-muted"
                />
              </div>
              <button type="submit" disabled={busy || !url.trim()} className="bg-ember text-bg font-medium rounded-xl px-5 py-3 min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
                {busy && <Loader2 size={15} className="animate-spin" />} Start party
              </button>
            </div>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </form>
        ) : (
          <div className="p-2 sm:p-3 flex flex-col gap-3">
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
              <div ref={mountRef} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full [&>div]:w-full [&>div]:h-full" />
              {/* Followers can't poke the player: the host's state is the source of truth. */}
              {!isController && <div className="absolute inset-0 z-10" aria-hidden="true" />}
              {needsTap && (
                <button onClick={tapToSync} className="absolute inset-0 z-20 bg-black/60 flex flex-col items-center justify-center gap-2 text-white">
                  <span className="w-14 h-14 rounded-full bg-ember text-bg flex items-center justify-center"><Play size={26} /></span>
                  <span className="text-sm">Tap to join in</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isController && (
                <button onClick={toggleMute} className="min-h-[40px] px-3 rounded-full bg-white/10 hover:bg-white/15 text-sm flex items-center gap-1.5">
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />} {muted ? "Unmute" : "Mute"}
                </button>
              )}
              {isHost && (
                <>
                  <div className="relative">
                    <button onClick={() => { ensureMembers(); setShowPass((v) => !v); }} className="min-h-[40px] px-3 rounded-full bg-white/10 hover:bg-white/15 text-sm flex items-center gap-1.5" aria-haspopup="menu" aria-expanded={showPass}>
                      <Hand size={15} /> Pass control
                    </button>
                    {showPass && (
                      <div role="menu" className="absolute bottom-full mb-2 left-0 z-30 w-56 max-h-56 overflow-y-auto bg-sidebar border border-white/10 rounded-xl shadow-2xl py-1">
                        {String(session.controllerId) !== selfId && (
                          <button role="menuitem" onClick={() => pass(selfId)} className="w-full text-left px-3 py-2.5 min-h-[44px] text-sm hover:bg-white/5">Take control back</button>
                        )}
                        {members === null || members === undefined ? (
                          <p className="px-3 py-2 text-xs text-muted">Loading…</p>
                        ) : candidates.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-muted">No one else to pass to.</p>
                        ) : (
                          candidates.map((m) => (
                            <button key={m.id || m._id} role="menuitem" onClick={() => pass(String(m.id || m._id))} className="w-full text-left px-3 py-2.5 min-h-[44px] text-sm hover:bg-white/5 truncate">
                              {m.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setShowChange((v) => !v)} className="min-h-[40px] px-3 rounded-full bg-white/10 hover:bg-white/15 text-sm">Change video</button>
                  <button onClick={end} className="min-h-[40px] px-3 rounded-full bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm ml-auto">End party</button>
                </>
              )}
            </div>

            {isHost && showChange && (
              <form onSubmit={changeVideo} className="flex flex-col sm:flex-row gap-2">
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="New YouTube link" inputMode="url" aria-label="New YouTube link" className="flex-1 min-w-0 bg-chat border border-white/5 focus:border-ember/50 outline-none rounded-xl px-3 py-2.5 text-base sm:text-sm placeholder:text-muted" />
                <button type="submit" className="bg-ember text-bg font-medium rounded-xl px-4 py-2.5 min-h-[44px]">Load</button>
              </form>
            )}
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchPartyPanel;
