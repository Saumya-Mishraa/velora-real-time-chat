import React from "react";
import { Plus, Eye } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const timeAgo = (date) => {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

// Avatar wrapped in a segmented ring: one arc per status, bright = unviewed.
export const StatusRing = ({ name, src, count, viewedCount = 0, size = 52 }) => {
  const total = Math.max(1, count);
  const r = size / 2 + 3;
  const c = 2 * Math.PI * r;
  const gap = total > 1 ? 4 : 0;
  const seg = c / total - gap;
  return (
    <div className="relative flex-shrink-0" style={{ width: size + 8, height: size + 8 }}>
      <svg className="absolute inset-0 -rotate-90" width={size + 8} height={size + 8} viewBox={`0 0 ${size + 8} ${size + 8}`} aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <circle
            key={i}
            cx={(size + 8) / 2}
            cy={(size + 8) / 2}
            r={r - 1}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            stroke={i < viewedCount ? "rgb(var(--color-muted) / 0.5)" : "rgb(var(--color-accent))"}
            strokeDasharray={`${Math.max(seg, 1)} ${c - Math.max(seg, 1)}`}
            strokeDashoffset={-(i * (c / total))}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Avatar name={name} src={src} size={size - 4} />
      </div>
    </div>
  );
};

const StatusPanel = ({ mine, feed, loaded, onAdd, onOpen }) => {
  const { user } = useAuth();
  const latestMine = mine[mine.length - 1];
  const myViews = mine.reduce((n, s) => n + (s.viewerCount || 0), 0);

  const unviewed = feed.filter((g) => !g.allViewed);
  const viewed = feed.filter((g) => g.allViewed);

  const Row = ({ group }) => (
    <button
      onClick={() => onOpen({ userId: group.user.id })}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-left min-h-[56px]"
    >
      <StatusRing
        name={group.user.name}
        src={group.user.avatar}
        count={group.statuses.length}
        viewedCount={group.statuses.filter((s) => s.viewed).length}
        size={44}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{group.user.name}</p>
        <p className="text-xs text-muted">{timeAgo(group.latestAt)}</p>
      </div>
    </button>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
      <div className="flex items-center gap-1 px-1">
        <button
          onClick={() => (mine.length ? onOpen({ userId: "mine" }) : onAdd())}
          className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 text-left min-h-[56px]"
          aria-label={mine.length ? "View my status" : "Add status"}
        >
          <div className="relative flex-shrink-0">
            {mine.length ? (
              <StatusRing name={user?.name} src={user?.avatar} count={mine.length} viewedCount={0} size={44} />
            ) : (
              <div className="p-1">
                <Avatar name={user?.name} src={user?.avatar} size={48} />
              </div>
            )}
            {!mine.length && (
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-ember text-bg flex items-center justify-center border-2 border-sidebar">
                <Plus size={12} strokeWidth={3} />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">My status</p>
            <p className="text-xs text-muted flex items-center gap-1.5 truncate">
              {mine.length ? (
                <>
                  <span>{timeAgo(latestMine.createdAt)}</span>
                  <span className="flex items-center gap-1"><Eye size={11} /> {myViews}</span>
                </>
              ) : (
                "Share a photo, video or text for 24 hours"
              )}
            </p>
          </div>
        </button>
        {mine.length > 0 && (
          <button
            onClick={onAdd}
            aria-label="Add another status"
            className="w-11 h-11 rounded-full bg-ember/15 text-ember flex items-center justify-center hover:bg-ember/25 flex-shrink-0"
          >
            <Plus size={19} />
          </button>
        )}
      </div>

      {!loaded ? (
        <p className="text-center text-muted text-sm mt-10">Loading updates…</p>
      ) : feed.length === 0 ? (
        <div className="text-center text-muted text-sm mt-12 px-6">
          No updates from your contacts right now. When someone you chat with posts a status, it'll show up here instantly.
        </div>
      ) : (
        <>
          {unviewed.length > 0 && (
            <>
              <h2 className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-muted">Recent updates</h2>
              {unviewed.map((g) => <Row key={g.user.id} group={g} />)}
            </>
          )}
          {viewed.length > 0 && (
            <>
              <h2 className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-muted">Viewed</h2>
              {viewed.map((g) => <Row key={g.user.id} group={g} />)}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default StatusPanel;
