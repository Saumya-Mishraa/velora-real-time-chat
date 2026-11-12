
import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const dotVariants = {
  animate: (i) => ({
    y: [0, -5, 0],
    scale: [0.85, 1.15, 0.85],
    opacity: [0.45, 1, 0.45],
    transition: {
      duration: 1.1,
      repeat: Infinity,
      repeatType: "loop",
      delay: i * 0.16,
      ease: "easeInOut",
    },
  }),
};

const TypingIndicator = ({ name }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 min-w-0"
      role="status"
      aria-live="polite"
      aria-label={name ? `${name} is typing` : "Someone is typing"}
    >
      <div className="flex items-center gap-1.5 bg-chat border border-white/5 rounded-full px-3.5 py-2 shadow-sm">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            custom={i}
            variants={dotVariants}
            animate={shouldReduceMotion ? {} : "animate"}
            className="w-1.5 h-1.5 rounded-full bg-ember inline-block"
            style={
              shouldReduceMotion
                ? { opacity: 0.8 }
                : undefined
            }
          />
        ))}
      </div>

      {name && (
        <span className="text-muted text-xs sm:text-sm truncate">
          <span className="text-primary font-medium">{name}</span>
          {" is typing…"}
        </span>
      )}
    </div>
  );
};

export default TypingIndicator;
