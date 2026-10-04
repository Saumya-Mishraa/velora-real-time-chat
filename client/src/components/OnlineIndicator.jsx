import React from "react";

const OnlineIndicator = ({ online, size = 10, className = "" }) => (
  <span
    style={{ width: size, height: size }}
    className={`rounded-full border-2 border-sidebar ${
      online ? "bg-online animate-breathe" : "bg-muted/50"
    } ${className}`}
  />
);

export default OnlineIndicator;
