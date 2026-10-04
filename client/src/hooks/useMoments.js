import { useCallback, useEffect, useState } from "react";
import api from "../services/api.js";

const byDate = (a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt);

// Moments list + real-time updates (owner and members both see changes
// the instant someone adds, edits, shares or deletes).
export const useMoments = (socket) => {
  const [moments, setMoments] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get("/moments");
      setMoments(data.moments);
    } catch {
      // keep existing
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!socket) return undefined;
    const onUpdated = ({ moment }) =>
      setMoments((prev) => {
        const exists = prev.some((m) => m._id === moment._id);
        const next = exists ? prev.map((m) => (m._id === moment._id ? { ...m, ...moment } : m)) : [moment, ...prev];
        return next.sort(byDate);
      });
    const onDeleted = ({ momentId }) => setMoments((prev) => prev.filter((m) => m._id !== momentId));
    socket.on("moment:updated", onUpdated);
    socket.on("moment:deleted", onDeleted);
    socket.io.on("reconnect", reload);
    return () => {
      socket.off("moment:updated", onUpdated);
      socket.off("moment:deleted", onDeleted);
      socket.io.off("reconnect", reload);
    };
  }, [socket, reload]);

  const upsert = useCallback(
    (moment) =>
      setMoments((prev) => {
        const exists = prev.some((m) => m._id === moment._id);
        const { items, ...summary } = moment; // list keeps the lightweight shape
        const next = exists ? prev.map((m) => (m._id === moment._id ? { ...m, ...summary } : m)) : [summary, ...prev];
        return next.sort(byDate);
      }),
    []
  );

  return { moments, loaded, reload, upsert };
};
