import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api.js";

const sortFeed = (feed) =>
  [...feed].sort((a, b) => {
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    return new Date(b.latestAt) - new Date(a.latestAt);
  });

const regroup = (group) => ({
  ...group,
  allViewed: group.statuses.every((s) => s.viewed),
  latestAt: group.statuses[group.statuses.length - 1]?.createdAt,
});

// Status data + all of its real-time wiring. Mounted once by the Dashboard
// so the "unviewed" badge stays correct whichever tab is open.
export const useStatusFeed = (socket) => {
  const [mine, setMine] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get("/status");
      setMine(data.mine);
      setFeed(data.feed);
    } catch {
      // keep whatever we have
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!socket) return undefined;

    const onNew = ({ status }) => {
      setFeed((prev) => {
        const idx = prev.findIndex((g) => g.user.id === status.author.id);
        if (idx === -1) {
          return sortFeed([...prev, regroup({ user: status.author, statuses: [status] })]);
        }
        const group = prev[idx];
        if (group.statuses.some((s) => s._id === status._id)) return prev;
        const next = [...prev];
        next[idx] = regroup({ ...group, statuses: [...group.statuses, status] });
        return sortFeed(next);
      });
    };
    const onMine = ({ status }) =>
      setMine((prev) => (prev.some((s) => s._id === status._id) ? prev : [...prev, status]));
    const onViewed = ({ statusId, viewer, viewedAt, viewerCount }) =>
      setMine((prev) =>
        prev.map((s) =>
          s._id !== statusId || s.viewers?.some((v) => v.user.id === viewer.id)
            ? s
            : { ...s, viewerCount, viewers: [...(s.viewers || []), { user: viewer, viewedAt }] }
        )
      );
    const onSeen = ({ statusId }) =>
      setFeed((prev) =>
        sortFeed(
          prev.map((g) =>
            g.statuses.some((s) => s._id === statusId)
              ? regroup({ ...g, statuses: g.statuses.map((s) => (s._id === statusId ? { ...s, viewed: true } : s)) })
              : g
          )
        )
      );
    const onRemoved = ({ statusId }) => {
      setMine((prev) => prev.filter((s) => s._id !== statusId));
      setFeed((prev) =>
        prev
          .map((g) => ({ ...g, statuses: g.statuses.filter((s) => s._id !== statusId) }))
          .filter((g) => g.statuses.length > 0)
          .map(regroup)
      );
    };

    socket.on("status:new", onNew);
    socket.on("status:mine", onMine);
    socket.on("status:viewed", onViewed);
    socket.on("status:seen", onSeen);
    socket.on("status:removed", onRemoved);
    socket.io.on("reconnect", reload);
    return () => {
      socket.off("status:new", onNew);
      socket.off("status:mine", onMine);
      socket.off("status:viewed", onViewed);
      socket.off("status:seen", onSeen);
      socket.off("status:removed", onRemoved);
      socket.io.off("reconnect", reload);
    };
  }, [socket, reload]);

  // 24h expiry: drop statuses locally the moment they lapse.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const alive = (s) => new Date(s.expiresAt).getTime() > now;
      setMine((prev) => (prev.every(alive) ? prev : prev.filter(alive)));
      setFeed((prev) =>
        prev.every((g) => g.statuses.every(alive))
          ? prev
          : prev.map((g) => ({ ...g, statuses: g.statuses.filter(alive) })).filter((g) => g.statuses.length).map(regroup)
      );
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const markViewed = useCallback((statusId) => {
    setFeed((prev) =>
      prev.map((g) =>
        g.statuses.some((s) => s._id === statusId && !s.viewed)
          ? regroup({ ...g, statuses: g.statuses.map((s) => (s._id === statusId ? { ...s, viewed: true } : s)) })
          : g
      )
    );
    api.post(`/status/${statusId}/view`).catch(() => {});
  }, []);

  const removeLocal = useCallback((statusId) => {
    setMine((prev) => prev.filter((s) => s._id !== statusId));
  }, []);

  const unviewedCount = useMemo(() => feed.filter((g) => !g.allViewed).length, [feed]);

  return { mine, feed, loaded, reload, markViewed, removeLocal, unviewedCount };
};
