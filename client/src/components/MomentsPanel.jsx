import React from "react";
import { Plus, Sparkles, Users } from "lucide-react";
import { mediaUrl } from "../utils/media.js";

export const countsLabel = (c = {}) =>
  `${c.photos || 0} Photos · ${c.videos || 0} Videos · ${c.memories || 0} Memories`;

const fmtDate = (d) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

const MomentsPanel = ({ moments, loaded, activeId, onSelect, onCreate }) => (
  <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
    <button
      onClick={onCreate}
      className="w-full min-h-[48px] mb-3 mt-1 rounded-xl border border-dashed border-ember/40 text-ember hover:bg-ember/5 flex items-center justify-center gap-2 text-sm font-medium"
    >
      <Plus size={16} /> New Moment
    </button>

    {!loaded ? (
      <p className="text-center text-muted text-sm mt-10">Loading Moments…</p>
    ) : moments.length === 0 ? (
      <div className="text-center text-muted text-sm mt-10 px-4">
        <Sparkles size={28} className="mx-auto mb-3 text-ember" />
        Keep the trips, nights and little things worth remembering — photos, videos and written memories in one place.
      </div>
    ) : (
      <div className="space-y-2.5">
        {moments.map((m) => (
          <button
            key={m._id}
            onClick={() => onSelect(m)}
            aria-current={activeId === m._id ? "true" : undefined}
            className={`w-full text-left rounded-2xl overflow-hidden border transition-colors ${
              activeId === m._id ? "border-ember/60" : "border-white/5 hover:border-white/15"
            }`}
          >
            <div className="relative h-24 sm:h-28 bg-chat">
              {m.cover ? (
                <img src={mediaUrl(m.cover)} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-ember/20 via-lavender/10 to-transparent">
                  <Sparkles size={26} className="text-ember/70" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3">
                <p className="font-display font-semibold truncate text-white">{m.title}</p>
              </div>
            </div>
            <div className="px-3 py-2 bg-chat/60 flex items-center gap-2">
              <p className="text-xs text-muted truncate flex-1 min-w-0">{countsLabel(m.counts)}</p>
              {m.members.length > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-muted flex-shrink-0">
                  <Users size={11} /> {m.members.length + 1}
                </span>
              )}
              <span className="text-[11px] text-muted flex-shrink-0">{fmtDate(m.date)}</span>
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
);

export default MomentsPanel;
