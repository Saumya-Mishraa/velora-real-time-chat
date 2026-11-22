import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Lock } from "lucide-react";
import { useSocket } from "../context/SocketContext.jsx";

const timeLeft = (expiresAt) => {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m left`;
  return `${Math.floor(hrs / 24)}d left`;
};

// Poll message card: percentage bars, live updates, change/retract vote.
const PollCard = ({ message, isOwn, isAdmin = false, members = [] }) => {
  const { socket } = useSocket();
  const poll = message.poll;
  const [pending, setPending] = useState(null); // optimistic option ids while a vote is in flight
  const [error, setError] = useState("");
  const [, tick] = useState(0);

  // Re-evaluate expiry without waiting for a server push.
  useEffect(() => {
    if (!poll?.expiresAt || poll.closed) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [poll?.expiresAt, poll?.closed]);

  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [String(m.id || m._id), m.name]));
    return (id) => map.get(String(id)) || "Someone";
  }, [members]);

  if (!poll) return null;
  const expired = !!poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now();
  const closed = poll.closed || expired;
  const mine = pending ?? poll.myVotes ?? [];
  const total = poll.totalVoters || 0;
  const canClose = !closed && (isOwn || isAdmin);

  const vote = (optionId) => {
    if (closed || !socket?.connected) return setError(closed ? "" : "You're offline. Try again in a moment.");
    let next;
    if (poll.multiple) next = mine.includes(optionId) ? mine.filter((id) => id !== optionId) : [...mine, optionId];
    else next = mine.includes(optionId) ? [] : [optionId]; // tapping your choice again retracts it
    setPending(next);
    setError("");
    socket.emit("poll:vote", { messageId: message._id, optionIds: next }, (res) => {
      setPending(null);
      if (res?.error) setError(res.error);
    });
  };

  const close = (e) => {
    e.stopPropagation();
    socket?.emit("poll:close", { messageId: message._id }, (res) => res?.error && setError(res.error));
  };

  const left = poll.expiresAt && !closed ? timeLeft(poll.expiresAt) : null;

  return (
    <div className="w-[min(18rem,100%)] min-w-[220px]" onClick={(e) => e.stopPropagation()}>
      <p className="text-[11px] opacity-70 flex items-center gap-1 mb-1">
        <BarChart3 size={12} /> Poll{poll.anonymous ? " · Anonymous" : ""}{poll.multiple ? " · Multiple answers" : ""}
      </p>
      <p className="text-sm font-semibold mb-2 break-words">{poll.question}</p>

      <div className="space-y-1.5" role={poll.multiple ? "group" : "radiogroup"} aria-label={poll.question}>
        {poll.options.map((opt) => {
          const selected = mine.includes(opt.id);
          const count = opt.count || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={opt.id}>
              <button
                type="button"
                role={poll.multiple ? "checkbox" : "radio"}
                aria-checked={selected}
                disabled={closed}
                onClick={() => vote(opt.id)}
                className={`relative w-full text-left rounded-lg overflow-hidden min-h-[40px] px-3 py-2 border transition-colors ${
                  selected ? (isOwn ? "border-bg/60" : "border-ember") : isOwn ? "border-bg/20" : "border-white/10"
                } ${closed ? "cursor-default" : "hover:brightness-110"}`}
              >
                <span
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${isOwn ? "bg-bg/25" : "bg-ember/25"}`}
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
                <span className="relative flex items-center gap-2 text-sm">
                  <span className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${poll.multiple ? "rounded" : "rounded-full"} ${selected ? (isOwn ? "bg-bg text-ember border-bg" : "bg-ember text-bg border-ember") : "border-current opacity-60"}`}>
                    {selected && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0 break-words">{opt.text}</span>
                  <span className="text-xs tabular-nums opacity-80 flex-shrink-0">{pct}%</span>
                </span>
              </button>
              {!poll.anonymous && opt.voters?.length > 0 && (
                <p className="text-[10px] opacity-70 px-1 mt-0.5 truncate">{opt.voters.map(nameOf).join(", ")}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 text-[11px] opacity-80">
        <span>{total} {total === 1 ? "vote" : "votes"}{left ? ` · ${left}` : ""}</span>
        {closed ? (
          <span className="flex items-center gap-1"><Lock size={11} /> {expired && !poll.closed ? "Ended" : "Closed"}</span>
        ) : (
          <span className="flex items-center gap-3">
            {mine.length > 0 && (
              <button type="button" className="underline" onClick={(e) => { e.stopPropagation(); setPending([]); socket?.emit("poll:vote", { messageId: message._id, optionIds: [] }, (res) => { setPending(null); if (res?.error) setError(res.error); }); }}>
                Retract vote
              </button>
            )}
            {canClose && <button type="button" className="underline" onClick={close}>Close poll</button>}
          </span>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
};

export default PollCard;
