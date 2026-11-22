import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "./SocketContext.jsx";

// Sender side of live location. Lives at app level (not inside the chat
// window) so a share keeps updating while the person navigates around Velora.
//
// - Nothing is requested from the browser until the consent dialog is
//   confirmed (see LiveLocationDialog).
// - navigator.geolocation.watchPosition feeds a throttle: send every
//   ~8s, or sooner after ~10m of movement (never faster than every 2.5s).
// - The share stops by itself at expiry (client timer here, server sweep
//   there); the sender can also stop any time.
const LiveLocationContext = createContext({
  supported: false,
  startLiveLocation: async () => ({ error: "Not available." }),
  stopLiveLocation: () => {},
  isSharing: () => false,
});

const SEND_EVERY_MS = 8000;
const MIN_GAP_MS = 2500;
const MOVE_THRESHOLD_M = 10;

const distanceM = (a, b) => {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const geoErrorText = (err) => {
  if (!err) return "Couldn't get your location.";
  if (err.code === 1) return "Location permission was denied. Allow location access for this site in your browser settings, then try again.";
  if (err.code === 2) return "Your device couldn't determine its location. Check that location services are on.";
  if (err.code === 3) return "Getting your location timed out. Please try again.";
  return "Couldn't get your location.";
};

export const LiveLocationProvider = ({ children }) => {
  const { socket } = useSocket();
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const sharesRef = useRef(new Map()); // messageId -> { watchId, timer, expiresAt, lastSent }
  const [activeIds, setActiveIds] = useState([]);

  const supported = typeof navigator !== "undefined" && "geolocation" in navigator && (typeof window === "undefined" || window.isSecureContext !== false);

  const stopLocal = useCallback((messageId) => {
    const share = sharesRef.current.get(messageId);
    if (!share) return;
    navigator.geolocation.clearWatch(share.watchId);
    clearTimeout(share.timer);
    sharesRef.current.delete(messageId);
    setActiveIds(Array.from(sharesRef.current.keys()));
  }, []);

  const stopLiveLocation = useCallback(
    (messageId) => {
      socketRef.current?.emit("location:stop", { messageId });
      stopLocal(messageId);
    },
    [stopLocal]
  );

  const sendPosition = useCallback(
    (messageId, pos) => {
      const share = sharesRef.current.get(messageId);
      if (!share) return;
      const now = Date.now();
      const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const since = now - share.lastSent;
      const moved = share.lastPoint ? distanceM(share.lastPoint, point) : Infinity;
      if (since < MIN_GAP_MS) return;
      if (since < SEND_EVERY_MS && moved < MOVE_THRESHOLD_M) return;
      share.lastSent = now;
      share.lastPoint = point;
      socketRef.current?.emit("location:update", { messageId, ...point, accuracy: pos.coords.accuracy }, (res) => {
        if (res?.ended) stopLocal(messageId);
      });
    },
    [stopLocal]
  );

  const startLiveLocation = useCallback(
    async (conversationId, minutes) => {
      if (!supported) return { error: "Your browser doesn't support sharing live location here (it needs a secure connection and location access)." };
      const sock = socketRef.current;
      if (!sock?.connected) return { error: "You're offline. Reconnect and try again." };

      // 1) Ask the browser first: a denied permission shouldn't leave an empty share behind.
      let first;
      try {
        first = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 })
        );
      } catch (err) {
        return { error: geoErrorText(err) };
      }

      // 2) Tell the server (explicit consent flag is re-checked there).
      const res = await new Promise((resolve) =>
        sock.emit("location:start", { conversationId, durationMinutes: minutes, consent: true }, resolve)
      );
      if (!res || res.error || !res.message) return { error: res?.error || "Couldn't start sharing." };

      const messageId = res.message._id;
      const expiresAt = new Date(res.expiresAt || res.message.location?.expiresAt).getTime();
      const share = { watchId: null, timer: null, expiresAt, lastSent: 0, lastPoint: null };
      sharesRef.current.set(messageId, share);
      setActiveIds(Array.from(sharesRef.current.keys()));

      sendPosition(messageId, first);
      share.watchId = navigator.geolocation.watchPosition(
        (pos) => sendPosition(messageId, pos),
        (err) => {
          // Permission revoked mid-share: stop cleanly instead of silently going stale.
          if (err.code === 1) stopLiveLocation(messageId);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
      );
      share.timer = setTimeout(() => stopLiveLocation(messageId), Math.max(0, expiresAt - Date.now()));
      return { ok: true, messageId };
    },
    [supported, sendPosition, stopLiveLocation]
  );

  // The server can also end a share (expiry sweep / started a newer one).
  useEffect(() => {
    if (!socket) return undefined;
    const onEnded = ({ messageId }) => stopLocal(messageId);
    socket.on("location:ended", onEnded);
    return () => socket.off("location:ended", onEnded);
  }, [socket, stopLocal]);

  // Leaving the app (logout / tab unmount) ends any watches.
  useEffect(
    () => () => {
      sharesRef.current.forEach((s) => {
        navigator.geolocation?.clearWatch(s.watchId);
        clearTimeout(s.timer);
      });
      sharesRef.current.clear();
    },
    []
  );

  const value = useMemo(
    () => ({ supported, startLiveLocation, stopLiveLocation, isSharing: (id) => activeIds.includes(String(id)) }),
    [supported, startLiveLocation, stopLiveLocation, activeIds]
  );
  return <LiveLocationContext.Provider value={value}>{children}</LiveLocationContext.Provider>;
};

export const useLiveLocation = () => useContext(LiveLocationContext);
