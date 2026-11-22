import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

// Message reaction picker.
//
// Root cause of "the picker vanishes too early" (MessageBubble.jsx):
//  1. The picker lived INSIDE the hover-driven actions menu, and the whole
//     message row closed both on mouse-leave. The picker floated ~10px
//     above the menu, so moving the pointer from the menu up to an emoji
//     crossed a dead zone, fired mouse-leave on the row and unmounted the
//     menu (and the picker with it).
//  2. A capturing window "scroll"/"resize" listener closed the menu on any
//     scroll (new message arriving, the keyboard opening on phones).
//  3. On touch, the emulated mouseenter opened the menu and the click that
//     followed toggled it straight back off.
//
// Fix: the picker is its own portal'd layer. Its lifetime is no longer tied
// to hover, scroll or resize - it closes only when an emoji is picked, on a
// press outside it, or on Esc. While open it follows its anchor instead of
// closing, is clamped inside the viewport, and only one picker can be open
// at a time (module-level broadcast below).

export const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "👏"];

const OPEN_EVENT = "velora:reaction-picker-open";
let nextId = 1;
export const useReactionPickerId = () => {
  const ref = useRef(null);
  if (ref.current === null) ref.current = `rp-${nextId++}`;
  return ref.current;
};

// Call when a picker opens: every other picker closes itself.
export const announcePickerOpen = (id) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));

const ReactionPicker = ({ id, anchorRef, fallbackRef, align = "start", anchorKey, emojis = REACTION_EMOJIS, onPick, onClose }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const place = () => {
    const el = ref.current;
    const anchor = anchorRef?.current || fallbackRef?.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : window.innerHeight;

    let left = align === "end" ? a.right - w : a.left;
    left = Math.min(Math.max(left, margin), Math.max(margin, vw - w - margin));
    // Above the anchor; if that would leave the screen, drop below it.
    let top = a.top - h - 6;
    if (top < margin) top = Math.min(a.bottom + 6, vh - h - margin);
    top = Math.max(margin, top);
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  };

  useLayoutEffect(() => {
    place();
    const raf = requestAnimationFrame(place); // anchor may finish positioning a frame later
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey, align]);

  // Follow the anchor (never close) on scroll / resize / keyboard changes.
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on: outside press (mouse + touch), Esc, or another picker opening.
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      // The "React" button toggles us itself; let its own handler decide.
      if (e.target.closest?.("[data-reaction-toggle]")) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    const onOther = (e) => {
      if (e.detail !== id) onClose?.();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener(OPEN_EVENT, onOther);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener(OPEN_EVENT, onOther);
    };
  }, [id, onClose]);

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label="Choose a reaction"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
      // pb/pt padding via the pseudo bridge keeps the hover path to the menu unbroken
      className="z-[70] flex items-center gap-0.5 bg-sidebar border border-white/10 rounded-full px-1.5 py-1 shadow-xl max-w-[calc(100vw-1rem)]"
      onClick={(e) => e.stopPropagation()}
    >
      {emojis.map((emoji) => (
        <button
          key={emoji}
          role="menuitem"
          onClick={() => onPick?.(emoji)}
          aria-label={`React ${emoji}`}
          className="w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-white/10 hover:scale-125 active:scale-110 transition-transform"
        >
          {emoji}
        </button>
      ))}
    </motion.div>,
    document.body
  );
};

export default ReactionPicker;
