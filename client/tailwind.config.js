/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Each token resolves through a CSS custom property so the active
        // theme (set via [data-theme] on <html>, see index.css) can swap
        // every color in the app at once. <alpha-value> keeps Tailwind's
        // opacity modifiers (e.g. bg-ember/40) working normally.
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        sidebar: "rgb(var(--color-sidebar) / <alpha-value>)",
        chat: "rgb(var(--color-chat) / <alpha-value>)",
        ember: "rgb(var(--color-accent) / <alpha-value>)",
        amber: "rgb(var(--color-accent-2) / <alpha-value>)",
        lavender: "rgb(var(--color-accent-3) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        online: "rgb(var(--color-online) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgb(var(--color-accent) / 0.15)",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: 1, boxShadow: "0 0 0 0 rgb(var(--color-online) / 0.5)" },
          "50%": { opacity: 0.85, boxShadow: "0 0 0 4px rgb(var(--color-online) / 0)" },
        },
        "theme-pulse": {
          "0%": { opacity: 0.9 },
          "100%": { opacity: 0 },
        },
      },
      animation: {
        breathe: "breathe 2.4s ease-in-out infinite",
        "theme-pulse": "theme-pulse 0.7s ease-out forwards",
      },
    },
  },
  plugins: [],
};
