
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

    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.DEV
        ? "/"
        : "https://velora-real-time-chat.onrender.com");

    const socketInstance = io(SOCKET_URL, {
      auth: { token },

      path: "/socket.io",

      transports: ["websocket", "polling"],

      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    const handleConnect = () => {
      console.log("Velora socket connected:", socketInstance.id);
      setConnectionState("connected");
    };

    const handleDisconnect = (reason) => {
      console.log("Velora socket disconnected:", reason);

      setConnectionState(
        reason === "io client disconnect"
          ? "offline"
          : "connecting"
      );
    };

    const handleConnectError = (error) => {
      console.error("Velora socket connection error:", error.message);
      setConnectionState("connecting");
    };

    socketInstance.on("connect", handleConnect);
    socketInstance.on("disconnect", handleDisconnect);
    socketInstance.on("connect_error", handleConnectError);

    return () => {
      socketInstance.off("connect", handleConnect);
      socketInstance.off("disconnect", handleDisconnect);
      socketInstance.off("connect_error", handleConnectError);

      socketInstance.disconnect();

      if (socketRef.current === socketInstance) {
        socketRef.current = null;
        setSocket(null);
        setConnectionState("offline");
      }
    };
  }, [token, user?.id]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connectionState,
        isConnected: connectionState === "connected",
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error(
      "useSocket must be used within a SocketProvider"
    );
  }

  return context;
};
