import { peersOfOneToOneCall } from "./callHandler.js";
import { peersOfGroupCall } from "./groupCallHandler.js";

// In-call extras shared by one-to-one AND group calls:
//   call:reaction          { callId, emoji }                 floating emoji, ~1 per 500ms per user
//   call:hand              { callId, raised }                raise / lower hand
//   call:whiteboard-open   { callId }                        tells peers a board was opened
//   call:whiteboard-stroke { callId, strokeId, color, size, points: [[x,y],..], end? }
//   call:whiteboard-undo   { callId, strokeId }              own strokes only
//   call:whiteboard-clear  { callId }
//   call:whiteboard-sync   { callId } -> ack { strokes }     late joiners
//
// Every handler resolves the call from the caller's own membership
// (answered 1:1 call, or live group call) so nobody can inject into a
// call they're not part of. Whiteboard state lives on the call's
// in-memory state object and disappears with the call.

const REACTION_GAP_MS = 500;
const ALLOWED_REACTIONS = new Set(["👍", "❤️", "😂", "😮", "👏", "🎉", "🔥", "😢", "🙏", "💯"]);
const MAX_POINTS_PER_BATCH = 100;
const MAX_POINTS_PER_STROKE = 3000;
const MAX_STROKES = 400;
const MAX_TOTAL_POINTS = 60000;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const resolve = (callId, userId) => {
  if (typeof callId !== "string") return null;
  return peersOfOneToOneCall(callId, userId) || peersOfGroupCall(callId, userId);
};

const boardOf = (ctx) => {
  if (!ctx.state.board) ctx.state.board = { strokes: new Map(), totalPoints: 0 };
  return ctx.state.board;
};

const relay = (io, ctx, event, payload) => ctx.peerSockets.forEach((sid) => io.to(sid).emit(event, payload));

export const registerCallExtrasHandlers = (io, socket) => {
  const userId = socket.userId;

  // Per-socket token bucket for whiteboard traffic (batches arrive ~20/s).
  let tokens = 60;
  let last = Date.now();
  const allowStroke = () => {
    const now = Date.now();
    tokens = Math.min(60, tokens + ((now - last) / 1000) * 40);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  socket.on("call:reaction", ({ callId, emoji } = {}) => {
    const ctx = resolve(callId, userId);
    if (!ctx || !ALLOWED_REACTIONS.has(emoji)) return;
    const rate = (ctx.state.reactionRate ||= {});
    const now = Date.now();
    if (now - (rate[userId] || 0) < REACTION_GAP_MS) return; // rate-limited
    rate[userId] = now;
    relay(io, ctx, "call:reaction", { callId, userId, emoji, at: now });
  });

  socket.on("call:hand", ({ callId, raised } = {}) => {
    const ctx = resolve(callId, userId);
    if (!ctx) return;
    const value = raised === true;
    if (ctx.participant) ctx.participant.hand = value; // group: late joiners get it in the join ack
    (ctx.state.hands ||= {})[userId] = value;
    relay(io, ctx, "call:hand", { callId, userId, raised: value });
  });

  socket.on("call:whiteboard-open", ({ callId } = {}) => {
    const ctx = resolve(callId, userId);
    if (!ctx) return;
    relay(io, ctx, "call:whiteboard-open", { callId, userId });
  });

  socket.on("call:whiteboard-stroke", (payload, ack) => {
    const { callId, strokeId, color, size, points, end } = payload || {};
    const ctx = resolve(callId, userId);
    if (!ctx) return ack?.({ error: "Not in this call." });
    if (!allowStroke()) return ack?.({ error: "Drawing too fast." });
    if (typeof strokeId !== "string" || strokeId.length < 1 || strokeId.length > 40) return;
    if (!COLOR_RE.test(String(color))) return;
    const brush = Number(size);
    if (!Number.isFinite(brush) || brush < 1 || brush > 48) return;
    if (!Array.isArray(points) || points.length === 0 || points.length > MAX_POINTS_PER_BATCH) return;
    const clean = [];
    for (const pt of points) {
      if (!Array.isArray(pt) || pt.length !== 2) return;
      const [x, y] = pt;
      if (typeof x !== "number" || typeof y !== "number" || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
      clean.push([Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
    }

    const board = boardOf(ctx);
    let stroke = board.strokes.get(strokeId);
    if (stroke && stroke.userId !== userId) return; // can't extend someone else's stroke
    if (!stroke) {
      if (board.strokes.size >= MAX_STROKES || board.totalPoints >= MAX_TOTAL_POINTS) {
        return ack?.({ error: "The whiteboard is full. Clear it to keep drawing." });
      }
      stroke = { id: strokeId, userId, color, size: brush, points: [] };
      board.strokes.set(strokeId, stroke);
    }
    if (stroke.points.length + clean.length > MAX_POINTS_PER_STROKE) return;
    stroke.points.push(...clean);
    board.totalPoints += clean.length;

    relay(io, ctx, "call:whiteboard-stroke", { callId, userId, strokeId, color: stroke.color, size: stroke.size, points: clean, end: end === true });
    ack?.({ ok: true });
  });

  socket.on("call:whiteboard-undo", ({ callId, strokeId } = {}) => {
    const ctx = resolve(callId, userId);
    if (!ctx) return;
    const board = boardOf(ctx);
    const stroke = board.strokes.get(strokeId);
    if (!stroke || stroke.userId !== userId) return; // own strokes only
    board.strokes.delete(strokeId);
    board.totalPoints = Math.max(0, board.totalPoints - stroke.points.length);
    relay(io, ctx, "call:whiteboard-undo", { callId, userId, strokeId });
  });

  socket.on("call:whiteboard-clear", ({ callId } = {}) => {
    const ctx = resolve(callId, userId);
    if (!ctx) return;
    const board = boardOf(ctx);
    board.strokes.clear();
    board.totalPoints = 0;
    relay(io, ctx, "call:whiteboard-clear", { callId, userId });
  });

  socket.on("call:whiteboard-sync", ({ callId } = {}, ack) => {
    const ctx = resolve(callId, userId);
    if (!ctx) return ack?.({ error: "Not in this call." });
    const board = boardOf(ctx);
    ack?.({ strokes: Array.from(board.strokes.values()) });
  });
};
