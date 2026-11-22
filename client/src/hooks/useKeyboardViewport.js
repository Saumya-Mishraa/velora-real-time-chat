import { useEffect } from "react";

// On-screen keyboard handling for phones (< lg only; desktop untouched).
//
// Android Chrome honours `interactive-widget=resizes-content` (see
// index.html), so there the layout already shrinks and this hook does
// nothing. iOS Safari ignores it and keeps the layout viewport full height,
// so the keyboard would cover the composer. When the *visual* viewport is
// noticeably shorter than the layout viewport we publish its size/offset as
// CSS variables + data-kb="open" on <html>; index.css (max-width: 1023px)
// uses them to size the app shell to the visible area and to drop the
// home-indicator padding while the keyboard is up.
const KEYBOARD_THRESHOLD = 100; // px; ignores URL-bar collapse jitter

export default function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const root = document.documentElement;

    const clear = () => {
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vv-top");
      delete root.dataset.kb;
    };
    const apply = () => {
      const covered = window.innerHeight - vv.height;
      if (mq.matches && covered > KEYBOARD_THRESHOLD) {
        root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
        root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
        root.dataset.kb = "open";
      } else {
        clear();
      }
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    mq.addEventListener("change", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      mq.removeEventListener("change", apply);
      window.removeEventListener("orientationchange", apply);
      clear();
    };
  }, []);
}
