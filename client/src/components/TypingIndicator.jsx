import React from "react";
import { motion } from "framer-motion";

// Three particles that rise, scale, and blur at slightly offset timings,
// instead of a generic static three-dot bounce.
const dot = {
  animate: (i) => ({
    y: [0, -6, 0],
    scale: [0.85, 1.15, 0.85],
    opacity: [0.5, 1, 0.5],
    filter: ["blur(0px)", "blur(0.3px)", "blur(0px)"],
    transition: {
      duration: 1.1,
      repeat: Infinity,
      delay: i * 0.18,
      ease: "easeInOut",
    },
  }),
};

const TypingIndicator = ({ name }) => (
  <div className="flex items-center gap-2 px-4 py-2 text-muted text-sm">
    <div className="flex gap-1 bg-chat border border-white/5 rounded-full px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          custom={i}
          animate="animate"
          variants={dot}
          className="w-1.5 h-1.5 rounded-full bg-ember inline-block"
        />
      ))}
    </div>
    {name && <span>{name} is typing…</span>}
  </div>
);

export default TypingIndicator;
