import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";

const ThemeSelector = () => {
  const { themeId, themes, setTheme } = useTheme();

  const pick = (id) => (e) => {
    setTheme(id, { x: e.clientX, y: e.clientY });
  };

  return (
    <div>
      <p className="text-xs text-muted mb-3">
        Pick the mood for your whole workspace — chat, sidebar, modals and more update together.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {themes.map((t) => {
          const active = t.id === themeId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={pick(t.id)}
              aria-pressed={active}
              className={`relative text-left rounded-2xl p-3.5 border transition-colors bg-chat/50 hover:bg-chat ${
                active ? "border-ember/50" : "border-white/5 hover:border-white/10"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="theme-active-ring"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-2xl ring-2 ring-ember/60 pointer-events-none"
                />
              )}

              <div className="flex items-center justify-between mb-3">
                <div className="flex -space-x-1.5">
                  {t.swatch.map((c, i) => (
                    <span
                      key={i}
                      style={{ background: c }}
                      className="w-5 h-5 rounded-full border-2 border-sidebar block"
                    />
                  ))}
                </div>
                {active && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    className="w-5 h-5 rounded-full bg-ember flex items-center justify-center flex-shrink-0"
                  >
                    <Check size={12} className="text-bg" strokeWidth={3} />
                  </motion.span>
                )}
              </div>

              <p className="font-display text-sm font-semibold">{t.name}</p>
              <p className="text-xs text-muted mt-0.5 leading-snug">{t.tagline}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeSelector;
