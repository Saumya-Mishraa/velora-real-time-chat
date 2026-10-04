import React, { useEffect, useMemo } from "react";
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, MessageCircle } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useCall } from "../context/CallContext.jsx";
import { fmtDuration } from "../utils/media.js";

const dayLabel = (date) => {
  const d = new Date(date);
  const today = new Date();
  const diff = Math.floor((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
};

const describe = (call, meId) => {
  const outgoing = call.caller.id === meId;
  const kind = call.mode === "video" ? "Video" : "Voice";
  switch (call.status) {
    case "missed":
      return outgoing
        ? { icon: PhoneOutgoing, text: `${kind} · No answer`, danger: false }
        : { icon: PhoneMissed, text: `Missed ${kind.toLowerCase()} call`, danger: true };
    case "declined":
      return { icon: outgoing ? PhoneOutgoing : PhoneMissed, text: outgoing ? `${kind} · Declined` : `Declined ${kind.toLowerCase()} call`, danger: false };
    case "busy":
      return { icon: PhoneOutgoing, text: `${kind} · Busy`, danger: false };
    case "canceled":
      return outgoing
        ? { icon: PhoneOutgoing, text: `${kind} · Canceled`, danger: false }
        : { icon: PhoneMissed, text: `Missed ${kind.toLowerCase()} call`, danger: true };
    case "failed":
      return { icon: outgoing ? PhoneOutgoing : PhoneIncoming, text: `${kind} · Failed`, danger: true };
    default:
      return {
        icon: outgoing ? PhoneOutgoing : PhoneIncoming,
        text: `${outgoing ? "Outgoing" : "Incoming"} ${kind.toLowerCase()}${call.duration ? ` · ${fmtDuration(call.duration)}` : ""}`,
        danger: false,
      };
  }
};

const CallsPanel = ({ onOpenChat, conversations }) => {
  const { user } = useAuth();
  const { history, historyLoaded, loadHistory, markCallsSeen, startCall, callState, missedCount } = useCall();

  // Opening the tab refreshes the list and clears the missed-call badge.
  useEffect(() => {
    loadHistory();
    markCallsSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (missedCount > 0) markCallsSeen();
  }, [missedCount, markCallsSeen]);

  const rows = useMemo(
    () =>
      history.map((c) => {
        const peer = c.caller.id === user.id ? c.callee : c.caller;
        return { ...c, peer, info: describe(c, user.id) };
      }),
    [history, user.id]
  );

  const callBack = (row, mode) => {
    const conversation = conversations.find((c) => c._id === row.conversation);
    if (conversation) startCall(conversation, mode);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
      <h2 className="px-3 pt-2 pb-2 text-xs uppercase tracking-wide text-muted">Recent calls</h2>
      {!historyLoaded ? (
        <p className="text-center text-muted text-sm mt-12">Loading calls…</p>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted text-sm mt-14 px-6">
          <Phone size={28} className="mx-auto mb-3 text-ember" />
          No calls yet. Open a chat and tap the phone or video icon.
        </div>
      ) : (
        rows.map((row) => {
          const Icon = row.info.icon;
          const available = conversations.some((c) => c._id === row.conversation);
          return (
            <div key={row._id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5">
              <button
                onClick={() => onOpenChat(row.conversation)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[44px]"
                aria-label={`Open chat with ${row.peer.name}`}
              >
                <Avatar name={row.peer.name} src={row.peer.avatar} size={44} />
                <div className="min-w-0">
                  <p className={`font-medium truncate ${row.info.danger ? "text-red-400" : ""}`}>{row.peer.name}</p>
                  <p className="text-xs text-muted flex items-center gap-1 truncate">
                    <Icon size={12} className={`flex-shrink-0 ${row.info.danger ? "text-red-400" : ""}`} />
                    <span className="truncate">{row.info.text}</span>
                  </p>
                  <p className="text-[11px] text-muted/80 truncate">{dayLabel(row.startedAt)}</p>
                </div>
              </button>
              {available && (
                <div className="flex items-center flex-shrink-0">
                  <button
                    onClick={() => callBack(row, "audio")}
                    disabled={callState !== "idle"}
                    aria-label={`Voice call ${row.peer.name}`}
                    className="w-10 h-10 flex items-center justify-center rounded-full text-ember hover:bg-white/5 disabled:opacity-40"
                  >
                    <Phone size={17} />
                  </button>
                  <button
                    onClick={() => callBack(row, "video")}
                    disabled={callState !== "idle"}
                    aria-label={`Video call ${row.peer.name}`}
                    className="w-10 h-10 flex items-center justify-center rounded-full text-ember hover:bg-white/5 disabled:opacity-40"
                  >
                    <Video size={17} />
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default CallsPanel;
