import React, { Suspense, lazy, useEffect, useState } from "react";
import { MapPin, Loader2, ExternalLink } from "lucide-react";
import { useLiveLocation } from "../context/LiveLocationContext.jsx";

// Leaflet is only fetched when a live-location message is actually shown.
const LiveLocationMap = lazy(() => import("./LiveLocationMap.jsx"));

const hhmm = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const LiveLocationCard = ({ message, isOwn }) => {
  const { stopLiveLocation, isSharing } = useLiveLocation();
  const loc = message.location || {};
  const [now, setNow] = useState(Date.now());

  // Flip to "ended" locally the moment the share expires.
  const expiresMs = loc.expiresAt ? new Date(loc.expiresAt).getTime() : 0;
  useEffect(() => {
    if (!loc.live || !expiresMs) return undefined;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [loc.live, expiresMs]);

  const live = !!loc.live && !loc.ended && expiresMs > now;
  const hasCoords = live && typeof loc.lat === "number" && typeof loc.lng === "number";
  const sharingHere = isOwn && live && isSharing(message._id);

  return (
    <div className="w-[min(18rem,100%)] min-w-[220px]" onClick={(e) => e.stopPropagation()}>
      <p className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
        <MapPin size={15} className={live ? "text-ember animate-pulse" : "opacity-60"} />
        {live ? (isOwn ? "You're sharing live location" : `${message.sender?.name || "Someone"} is sharing live location`) : "Live location ended"}
      </p>

      {live ? (
        <>
          <div className="relative h-40 rounded-xl overflow-hidden bg-black/20">
            {hasCoords ? (
              <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><Loader2 size={18} className="animate-spin" /></div>}>
                <LiveLocationMap lat={loc.lat} lng={loc.lng} accuracy={loc.accuracy} live label={`${message.sender?.name || "Live"} location`} />
              </Suspense>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs opacity-75 px-4 text-center">
                {isOwn ? "Getting your location…" : "Waiting for their location…"}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-1.5 text-xs">
            <span className="opacity-80">Live until {hhmm(expiresMs)}</span>
            {hasCoords && (
              <a href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline opacity-80 hover:opacity-100">
                OpenStreetMap <ExternalLink size={11} />
              </a>
            )}
          </div>
          {loc.updatedAt && now - loc.updatedAt > 60000 && <p className="text-[11px] opacity-70 mt-0.5">Last updated {hhmm(loc.updatedAt)}</p>}
          {isOwn && (
            <button
              type="button"
              onClick={() => stopLiveLocation(message._id)}
              className="mt-2 w-full min-h-[40px] rounded-lg bg-black/20 hover:bg-black/30 text-sm font-medium transition-colors"
            >
              Stop sharing
            </button>
          )}
          {isOwn && !sharingHere && (
            <p className="text-[11px] opacity-70 mt-1">This device isn't updating this share (it was started elsewhere or the page was reloaded). Start a new one to keep sharing.</p>
          )}
        </>
      ) : (
        <p className="text-xs opacity-70">{loc.startedAt ? `Started ${hhmm(loc.startedAt)}` : ""} · Location is no longer available.</p>
      )}
    </div>
  );
};

export default LiveLocationCard;
