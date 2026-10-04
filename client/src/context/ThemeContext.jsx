import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";

/**
 * Theme registry. Each entry's `id` must match a `[data-theme="id"]`
 * block defined in src/index.css — that's the only other place a new
 * theme needs to be registered.
 *
 * `swatch` = [background, primary accent, secondary accent] used to
 * render the preview dots and the transition-wipe color in the
 * theme selector — see components/ThemeSelector.jsx.
 */
export const THEMES = [
  {
    id: "nebula-ember",
    name: "Nebula Ember",
    tagline: "Ember orange & lavender in near-black space.",
    swatch: ["#090A0F", "#FF6B4A", "#B58CFF"],
  },
  {
    id: "sakura-dream",
    name: "Sakura Dream",
    tagline: "Soft rose and orchid, elegantly after-dark.",
    swatch: ["#140B14", "#FF6FA5", "#C99CFF"],
  },
  {
    id: "ocean-pulse",
    name: "Ocean Pulse",
    tagline: "Deep currents with an electric cyan pulse.",
    swatch: ["#060B14", "#3AA0FF", "#5FD0FF"],
  },
  {
    id: "midnight-aurora",
    name: "Midnight Aurora",
    tagline: "Green, blue and violet light in the dark.",
    swatch: ["#05070A", "#5FE2B8", "#A87CFF"],
  },
];

const STORAGE_KEY = "velora_theme";
const DEFAULT_THEME = "nebula-ember";

const isValidTheme = (id) => THEMES.some((t) => t.id === id);

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [themeId, setThemeId] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return isValidTheme(stored) ? stored : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  // When set, a full-screen radial "wipe" animates from this origin
  // to mark the theme change. Cleared automatically once it finishes.
  const [transition, setTransition] = useState(null);

  // The chosen appearance only applies inside the signed-in app (/app/*).
  // The landing page, login, signup and password pages keep Velora's
  // default look regardless of what theme the person picked in settings.
  const { pathname } = useLocation();
  const inApp = pathname === "/app" || pathname.startsWith("/app/");
  const appliedTheme = inApp ? themeId : DEFAULT_THEME;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appliedTheme);
  }, [appliedTheme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      // localStorage unavailable (private mode, etc.) — theme still
      // applies for this session, it just won't persist.
    }
  }, [themeId]);

  const setTheme = useCallback(
    (id, origin) => {
      if (!isValidTheme(id) || id === themeId) return;
      const nextTheme = THEMES.find((t) => t.id === id);
      if (origin) {
        setTransition({ x: origin.x, y: origin.y, color: nextTheme.swatch[1] });
        window.setTimeout(() => setTransition(null), 750);
      }
      setThemeId(id);
    },
    [themeId]
  );

  const value = useMemo(
    () => ({ themeId, theme: THEMES.find((t) => t.id === themeId), themes: THEMES, setTheme, transition }),
    [themeId, setTheme, transition]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
};
