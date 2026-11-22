import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Undo2, Trash2 } from "lucide-react";

// Shared call whiteboard (1:1 and group). Strokes sync over the call's
// socket events (call:whiteboard-*) with NORMALISED 0-1 coordinates, so every
// participant's differently-sized canvas draws the same picture. Points are
// batched (~every 60ms) instead of sent per pointer-move; brush size is in
// "reference pixels" of a 1000px-wide board and scaled to the local canvas.
// Pointer events cover mouse, touch and pen with one code path.
const COLORS = ["#111111", "#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed"];
const SIZES = [3, 6, 12, 22];
const REF_WIDTH = 1000;
const BATCH_MS = 60;
const MAX_BATCH = 90;

const newId = (selfId) => `${String(selfId).slice(-4)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const WhiteboardPanel = ({ socket, callId, selfId, onClose }) => {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const strokes = useRef(new Map()); // id -> { id, userId, color, size, points }
  const mine = useRef([]); // my stroke ids, oldest first (for undo)
  const drawing = useRef(null); // { id, pending: [] }
  const flushTimer = useRef(null);
  const raf = useRef(0);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [error, setError] = useState("");
  const [, bump] = useState(0);

  const redraw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const scale = width / REF_WIDTH;
      strokes.current.forEach((s) => {
        if (!s.points.length) return;
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = Math.max(1, s.size * scale);
        if (s.points.length === 1) {
          ctx.beginPath();
          ctx.arc(s.points[0][0] * width, s.points[0][1] * height, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        ctx.beginPath();
        ctx.moveTo(s.points[0][0] * width, s.points[0][1] * height);
        for (let i = 1; i < s.points.length; i += 1) ctx.lineTo(s.points[i][0] * width, s.points[i][1] * height);
        ctx.stroke();
      });
    });
  }, []);

  // Keep the backing store matched to the displayed size (and device pixel ratio).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr));
      const h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        redraw();
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  // Late joiners: pull everything drawn so far, then follow live events.
  useEffect(() => {
    if (!socket) return undefined;
    socket.emit("call:whiteboard-sync", { callId }, (res) => {
      if (res?.strokes) {
        res.strokes.forEach((s) => strokes.current.set(s.id, s));
        redraw();
      }
    });
    const onStroke = (p) => {
      if (p.callId !== callId) return;
      let s = strokes.current.get(p.strokeId);
      if (!s) {
        s = { id: p.strokeId, userId: p.userId, color: p.color, size: p.size, points: [] };
        strokes.current.set(p.strokeId, s);
      }
      s.points.push(...p.points);
      redraw();
    };
    const onUndo = (p) => {
      if (p.callId !== callId) return;
      strokes.current.delete(p.strokeId);
      redraw();
    };
    const onClear = (p) => {
      if (p.callId !== callId) return;
      strokes.current.clear();
      mine.current = [];
      redraw();
    };
    socket.on("call:whiteboard-stroke", onStroke);
    socket.on("call:whiteboard-undo", onUndo);
    socket.on("call:whiteboard-clear", onClear);
    return () => {
      socket.off("call:whiteboard-stroke", onStroke);
      socket.off("call:whiteboard-undo", onUndo);
      socket.off("call:whiteboard-clear", onClear);
      clearTimeout(flushTimer.current);
      cancelAnimationFrame(raf.current);
    };
  }, [socket, callId, redraw]);

  const flush = useCallback(
    (end = false) => {
      const d = drawing.current;
      if (!d) return;
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
      while (d.pending.length > 0 || end) {
        const batch = d.pending.splice(0, MAX_BATCH);
        if (batch.length === 0) break;
        const last = d.pending.length === 0;
        socket?.emit("call:whiteboard-stroke", { callId, strokeId: d.id, color: d.color, size: d.size, points: batch, end: end && last }, (res) => {
          if (res?.error) setError(res.error);
        });
        if (last) break;
      }
      if (end) drawing.current = null;
    },
    [socket, callId]
  );

  const toPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setError("");
    const id = newId(selfId);
    const pt = toPoint(e);
    strokes.current.set(id, { id, userId: selfId, color, size, points: [pt] });
    mine.current.push(id);
    drawing.current = { id, color, size, pending: [pt] };
    redraw();
    flushTimer.current = setTimeout(() => flush(false), BATCH_MS);
  };
  const onPointerMove = (e) => {
    const d = drawing.current;
    if (!d) return;
    const pt = toPoint(e);
    const s = strokes.current.get(d.id);
    s.points.push(pt);
    d.pending.push(pt);
    redraw();
    if (!flushTimer.current) flushTimer.current = setTimeout(() => flush(false), BATCH_MS);
  };
  const onPointerUp = () => flush(true);

  const undo = () => {
    while (mine.current.length) {
      const id = mine.current.pop();
      if (strokes.current.has(id)) {
        strokes.current.delete(id);
        socket?.emit("call:whiteboard-undo", { callId, strokeId: id });
        redraw();
        bump((n) => n + 1);
        return;
      }
    }
  };
  const clear = () => {
    if (!window.confirm("Clear the whiteboard for everyone?")) return;
    strokes.current.clear();
    mine.current = [];
    socket?.emit("call:whiteboard-clear", { callId });
    redraw();
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[96] bg-black/75 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Shared whiteboard">
      <div className="w-full sm:max-w-3xl bg-sidebar border border-white/10 sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[100dvh] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Color">
            {COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={color === c} aria-label={`Color ${c}`} onClick={() => setColor(c)} style={{ background: c }} className={`w-8 h-8 rounded-full border-2 ${color === c ? "border-ember scale-110" : "border-white/30"}`} />
            ))}
          </div>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush size">
            {SIZES.map((sz) => (
              <button key={sz} role="radio" aria-checked={size === sz} aria-label={`Brush ${sz}`} onClick={() => setSize(sz)} className={`w-9 h-9 rounded-lg flex items-center justify-center ${size === sz ? "bg-white/15" : "hover:bg-white/10"}`}>
                <span className="rounded-full bg-ink block" style={{ width: Math.max(4, sz * 0.7), height: Math.max(4, sz * 0.7) }} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={undo} aria-label="Undo my last stroke" title="Undo my last stroke" className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-muted hover:text-ink"><Undo2 size={18} /></button>
            <button onClick={clear} aria-label="Clear whiteboard" title="Clear for everyone" className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-muted hover:text-red-400"><Trash2 size={18} /></button>
            <button onClick={onClose} aria-label="Close whiteboard" className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-muted hover:text-ink"><X size={18} /></button>
          </div>
        </div>
        <div className="p-2 sm:p-3 min-h-0">
          {/* Board is always 4:3 and as large as fits the screen. */}
          <div ref={wrapRef} className="relative w-full mx-auto bg-white rounded-xl overflow-hidden shadow-inner" style={{ aspectRatio: "4 / 3", width: "min(100%, calc((100dvh - 9rem) * 1.3333))" }}>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              style={{ touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
          {error && <p role="alert" className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default WhiteboardPanel;
