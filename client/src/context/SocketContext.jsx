import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token, user } = useAuth();

  const socketRef = useRef(null);

  // The socket lives in state so every consumer re-renders
  // with the live instance once it exists.
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

    // Use VITE_SOCKET_URL when explicitly provided.
    // During local development, "/" uses the Vite proxy.
    // In production, connect directly to the Velora backend.
    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.DEV
        ? "/"
        : "https://velora-real-time-chat.onrender.com");

    const socket = io(SOCKET_URL, {
      auth: {
        token,
      },
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      setConnectionState("connected");
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setConnectionState("connecting");
    });

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

    // Keyed on user id rather than the whole user object.
    // Profile edits should not rebuild the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  return (
    <SocketContext.Provider value={{ socket, connectionState }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);