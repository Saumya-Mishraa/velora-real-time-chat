import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  // The socket lives in state (not just a ref) so every consumer
  // re-renders with the live instance once it exists — reading
  // socketRef.current during render handed consumers `null` until some
  // unrelated re-render, which is how listeners were being attached late.
  const [socket, setSocket] = useState(null);
  const [connectionState, setConnectionState] = useState("offline");

  useEffect(() => {
    if (!token || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnectionState("offline");
      return;
    }

    setConnectionState("connecting");

    // The backend URL was hardcoded here, completely bypassing the
    // "/socket.io" proxy already configured in vite.config.js for local
    // dev (which points at http://localhost:5000). That meant local dev
    // always talked to the deployed Render backend/DB instead of the
    // local one, no matter what was running locally. VITE_SOCKET_URL lets
    // this be set explicitly per environment; without it, dev uses the
    // same origin (so Vite's proxy handles it) and everything else falls
    // back to the existing deployed URL, so production behavior is
    // unchanged by default.
    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.DEV ? "/" : "https://nuvora-5171.onrender.com");

    const socket = io(SOCKET_URL, {
      auth: { token },
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => setConnectionState("connected"));
    socket.on("disconnect", () => setConnectionState("connecting"));
    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setConnectionState("connecting");
    });

    socketRef.current = socket;
    setSocket(socket);

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
        setSocket(null);
      }
    };
    // Keyed on the user's id, not the user object: profile edits replace
    // the object and must not tear down and rebuild the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  return (
    <SocketContext.Provider value={{ socket, connectionState }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);