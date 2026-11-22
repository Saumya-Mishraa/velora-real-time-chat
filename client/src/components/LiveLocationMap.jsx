import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet + OpenStreetMap tiles (no API key). This module is lazy-loaded by
// LiveLocationCard so Leaflet stays out of the main bundle. A divIcon is used
// for the marker so we don't depend on Leaflet's default image assets, which
// bundlers tend to break.
const LiveLocationMap = ({ lat, lng, accuracy, live, label }) => {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const followRef = useRef(true);

  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([lat, lng], 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    const icon = L.divIcon({
      className: "",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: '<span style="display:block;width:22px;height:22px;border-radius:9999px;background:rgb(var(--color-accent));border:3px solid #fff;box-shadow:0 0 0 4px rgba(0,0,0,.18)"></span>',
    });
    markerRef.current = L.marker([lat, lng], { icon, title: label || "Live location", keyboard: false }).addTo(map);
    circleRef.current = L.circle([lat, lng], { radius: accuracy || 0, weight: 1, opacity: 0.4, fillOpacity: 0.08 }).addTo(map);
    // Stop auto-following once the viewer pans/zooms by hand.
    map.on("dragstart zoomstart", (e) => {
      if (e.originalEvent || e.type === "dragstart") followRef.current = false;
    });
    mapRef.current = map;
    // Container may still be animating in; recompute size once settled.
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    markerRef.current?.setLatLng([lat, lng]);
    circleRef.current?.setLatLng([lat, lng]).setRadius(accuracy || 0);
    if (live && followRef.current) mapRef.current.panTo([lat, lng], { animate: true });
  }, [lat, lng, accuracy, live]);

  return <div ref={elRef} className="w-full h-full" role="application" aria-label={label || "Map"} />;
};

export default LiveLocationMap;
