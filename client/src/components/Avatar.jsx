import React from "react";
import { mediaUrl } from "../utils/media.js";

const colors = [
  "rgb(var(--color-avatar-1))",
  "rgb(var(--color-avatar-2))",
  "rgb(var(--color-avatar-3))",
  "rgb(var(--color-avatar-4))",
  "rgb(var(--color-avatar-5))",
];

const initials = (name = "?") =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const colorFor = (seed = "") => {
  const idx = seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
};

const Avatar = ({ src, name, size = 40, className = "" }) => {
  const dim = { width: size, height: size };
  if (src) {
    return (
      <img
        src={mediaUrl(src)}
        alt={name}
        style={dim}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={{ ...dim, background: colorFor(name) }}
      className={`rounded-full flex items-center justify-center flex-shrink-0 text-bg font-display font-semibold ${className}`}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials(name)}</span>
    </div>
  );
};

export default Avatar;
