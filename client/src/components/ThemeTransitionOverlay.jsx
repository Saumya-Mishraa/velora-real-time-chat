import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "../context/ThemeContext.jsx";

/**
 * Renders a soft radial color wipe expanding from the point the user
 * tapped a theme swatch — a small, deliberate flourish rather than an
 * instant color snap or a full-page fade. Purely decorative and never
 * intercepts clicks (pointer-events: none).
 */
const ThemeTransitionOverlay = () => {
  const { transition } = useTheme();

  return (
    <AnimatePresence>
      {transition && (
        <motion.div
          key={`${transition.x}-${transition.y}-${transition.color}`}
          initial={{ clipPath: `circle(0px at ${transition.x}px ${transition.y}px)`, opacity: 0.55 }}
          animate={{ clipPath: `circle(160% at ${transition.x}px ${transition.y}px)`, opacity: 0.28 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          style={{ background: transition.color }}
          className="fixed inset-0 z-[999] pointer-events-none mix-blend-soft-light"
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  );
};

export default ThemeTransitionOverlay;
