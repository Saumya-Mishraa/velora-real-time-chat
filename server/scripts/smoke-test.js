#!/usr/bin/env node
/* eslint-disable no-console */
// Smoke test for the realtime features added to Velora: validations,
// view-once privacy, polls, group-call signaling, in-call extras, watch
// party sync and live-location expiry.
//
// It talks to a RUNNING server (never touches your real data if you point it
// at a throwaway database):
//
//   MONGO_URI=mongodb://127.0.0.1:27017/velora_smoke JWT_SECRET=test PORT=5055 \
//   GROUP_CALL_RING_TIMEOUT_MS=1500 LOCATION_SWEEP_MS=500 npm start     # terminal 1
//   SMOKE_URL=http://localhost:5055 \
//   SMOKE_MONGO_URI=mongodb://127.0.0.1:27017/velora_smoke npm run smoke # terminal 2
//
// SMOKE_MONGO_URI is optional: it lets the test fast-forward poll/location
// expiry and prove no coordinates remain in the database.
import { io } from "socket.io-client";
import mongoose from "mongoose";
if (process.env.SMOKE_MONGO_URI) await mongoose.connect(process.env.SMOKE_MONGO_URI);

const BASE = process.env.SMOKE_URL || "http://localhost:5000";
const stamp = Date.now().toString(36).slice(-5);
let passed = 0;
const failures = [];

const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
};
const section = (t) => console.log(`\n== ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const http = async (method, path, token, body) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
};

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ["websocket"], reconnection: false });
    s.log = {};
    s.onAny((event, ...args) => (s.log[event] ||= []).push(args[0]));
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });
const emit = (s, event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
const waitFor = async (s, event, pred = () => true, ms = 3000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const hit = (s.log[event] || []).find(pred);
    if (hit) return hit;
    await sleep(25);
  }
  return null;
};
const seen = (s, event, pred = () => true) => (s.log[event] || []).some(pred);

const register = async (label) => {
  const username = `sm_${label}${stamp}`;
  const email = `${username}@example.com`;
  const r = await http("POST", "/auth/register", null, { name: `Smoke ${label}`, username, email, password: "zebra4Pencil9", confirmPassword: "zebra4Pencil9" });
  if (r.status !== 201) throw new Error(`register ${label} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { id: r.data.user.id, token: r.data.token, username, email };
};

(async () => {
  // ---------------------------------------------------------------- validations
  section("Validations");
  const bad = async (body) => (await http("POST", "/auth/register", null, { name: "X", confirmPassword: body.password, ...body })).status;
  check("rejects short username", (await bad({ username: "ab", email: `a${stamp}@example.com`, password: "zebra4Pencil9" })) === 400);
  check("rejects reserved username", (await bad({ username: "Admin", email: `b${stamp}@example.com`, password: "zebra4Pencil9" })) === 400);
  check("rejects '..' in username", (await bad({ username: "a..bc", email: `c${stamp}@example.com`, password: "zebra4Pencil9" })) === 400);
  check("rejects trailing underscore", (await bad({ username: "abcd_", email: `d${stamp}@example.com`, password: "zebra4Pencil9" })) === 400);
  check("rejects password without number", (await bad({ username: `okname${stamp}`, email: `e${stamp}@example.com`, password: "onlyletters" })) === 400);
  check("rejects common password", (await bad({ username: `okname${stamp}`, email: `f${stamp}@example.com`, password: "qwerty123" })) === 400);
  check("rejects password containing username", (await bad({ username: `zorro${stamp}`, email: `g${stamp}@example.com`, password: `my-zorro${stamp}-9` })) === 400);
  check("rejects 73-char password", (await bad({ username: `okname${stamp}`, email: `h${stamp}@example.com`, password: "a1".repeat(37) })) === 400);

  let A, B, C, D, E, F;
  const made = [];
  for (const l of ["a", "b", "c", "d", "e", "f"]) made.push(await register(l));
  [A, B, C, D, E, F] = made;
  check("registers with a valid username/password", !!A.token);
  const avail = await http("GET", `/auth/check-username?u=${A.username}`);
  check("check-username reports taken", avail.data?.available === false);
  const free = await http("GET", `/auth/check-username?u=free_${stamp}`);
  check("check-username reports available", free.data?.available === true);

  // login is NOT validated (legacy credentials must keep working)
  const login = await http("POST", "/auth/login", null, { identifier: A.email, password: "zebra4Pencil9" });
  check("login still works", login.status === 200);

  // ---------------------------------------------------------------- setup
  const grp = await http("POST", "/conversations/group", A.token, { name: `Smoke ${stamp}`, memberIds: [B.id, C.id, D.id, E.id] });
  const G = grp.data?.conversation?._id;
  const dm = await http("POST", "/conversations/private", A.token, { userId: B.id });
  const DM = dm.data?.conversation?._id;
  check("created group + 1:1", !!G && !!DM, JSON.stringify(grp.data)?.slice(0, 120));

  let sA = await connect(A.token), sB = await connect(B.token), sC = await connect(C.token);
  const sD = await connect(D.token), sE = await connect(E.token), sF = await connect(F.token);
  for (const s of [sA, sB, sC, sD, sE]) { await emit(s, "conversation:join", G); }
  for (const s of [sA, sB]) { await emit(s, "conversation:join", DM); }
  check("outsider can't join the group room", (await emit(sF, "conversation:join", G))?.error);

  // ---------------------------------------------------------------- view once
  section("View-once");
  const sent = await emit(sA, "message:send", {
    conversationId: DM, type: "image", text: "",
    attachment: { path: "/uploads/secret-photo.png", name: "secret-photo.png", size: 1234, mimeType: "image/png" },
    viewOnce: true,
  });
  check("view-once message accepted", !!sent?.message?._id, JSON.stringify(sent));
  const voId = sent?.message?._id;
  check("sender ack has no media url/name", !sent?.message?.attachment?.url && !sent?.message?.attachment?.name && sent?.message?.viewOnce === true);
  const pushed = await waitFor(sB, "message:new", (m) => m._id === voId);
  check("recipient socket payload has no media url/name", !!pushed && !JSON.stringify(pushed).includes("secret-photo"));
  const list = await http("GET", `/messages/${DM}`, B.token);
  check("message list hides the media url", !JSON.stringify(list.data).includes("secret-photo"));
  const listA = await http("GET", `/messages/${DM}`, A.token);
  check("sender's list hides it too", !JSON.stringify(listA.data).includes("secret-photo"));
  const convs = await http("GET", "/conversations", B.token);
  check("conversation lastMessage hides it", !JSON.stringify(convs.data).includes("secret-photo"));
  const search = await http("GET", `/messages/${DM}/search?q=secret`, B.token);
  check("search can't find it by file name", !JSON.stringify(search.data).includes("secret-photo") && (search.data?.messages || []).length === 0);
  const shared = await http("GET", `/messages/${DM}/shared`, B.token);
  check("shared-content panel excludes it", !JSON.stringify(shared.data).includes("secret-photo"));
  const star = await http("POST", `/messages/single/${voId}/star`, B.token, { starred: true });
  check("starring is refused", star.status === 400);
  const own = await http("POST", `/messages/single/${voId}/view-once`, A.token);
  check("sender can't reopen", own.status === 403);
  const stranger = await http("POST", `/messages/single/${voId}/view-once`, F.token);
  check("non-member can't open", stranger.status === 403);
  const [o1, o2] = await Promise.all([
    http("POST", `/messages/single/${voId}/view-once`, B.token),
    http("POST", `/messages/single/${voId}/view-once`, B.token),
  ]);
  const wins = [o1, o2].filter((r) => r.status === 200);
  check("exactly one simultaneous open wins", wins.length === 1 && [o1, o2].filter((r) => r.status === 409).length === 1);
  check("winner gets the url", !!wins[0]?.data?.url && wins[0].data.url.includes("secret-photo"));
  check("sender is told it was opened", !!(await waitFor(sA, "message:view-once", (e) => e.messageId === voId && e.userId === B.id)));
  const listAfter = await http("GET", `/messages/${DM}`, A.token);
  const afterMsg = (listAfter.data?.messages || []).find((m) => m._id === voId);
  check("sender sees viewedBy", afterMsg?.viewedBy?.includes(B.id));
  const listB = await http("GET", `/messages/${DM}`, B.token);
  check("recipient sees 'opened' (viewedByMe)", (listB.data?.messages || []).find((m) => m._id === voId)?.viewedByMe === true);
  const gifFlag = await emit(sA, "message:send", { conversationId: DM, type: "file", text: "", attachment: { path: "/uploads/doc.pdf", name: "doc.pdf", size: 10, mimeType: "application/pdf" }, viewOnce: true });
  check("view-once ignored for non-image/video", gifFlag?.message && gifFlag.message.viewOnce !== true);

  // ---------------------------------------------------------------- polls
  section("Polls");
  const noPollInDm = await emit(sA, "poll:create", { conversationId: DM, question: "Q?", options: ["a", "b"] });
  check("polls refused in 1:1 chats", !!noPollInDm?.error);
  check("needs 2+ options", !!(await emit(sA, "poll:create", { conversationId: G, question: "Q?", options: ["only"] }))?.error);
  check("max 6 options", !!(await emit(sA, "poll:create", { conversationId: G, question: "Q?", options: ["1", "2", "3", "4", "5", "6", "7"] }))?.error);
  check("outsider can't create", !!(await emit(sF, "poll:create", { conversationId: G, question: "Q?", options: ["a", "b"] }))?.error);
  const pc = await emit(sB, "poll:create", { conversationId: G, question: "Pizza night?", options: ["Yes", "No", "Maybe"], multiple: false, anonymous: false });
  const pollId = pc?.message?._id;
  check("poll created by member", !!pollId);
  const optIds = pc?.message?.poll?.options?.map((o) => o.id) || [];
  check("poll push has no raw voters", !JSON.stringify(pc?.message?.poll || {}).includes("voters\":[\""));
  const v1 = await emit(sC, "poll:vote", { messageId: pollId, optionIds: [optIds[0]] });
  check("member can vote", v1?.ok && v1.poll.myVotes[0] === optIds[0]);
  const upd = await waitFor(sD, "poll:updated", (e) => e.messageId === pollId);
  check("others get poll:updated", upd?.poll?.options?.[0]?.count === 1);
  check("poll:updated for D doesn't claim D voted", upd?.poll?.myVotes?.length === 0);
  check("single choice: 2 options refused", !!(await emit(sC, "poll:vote", { messageId: pollId, optionIds: [optIds[0], optIds[1]] }))?.error);
  check("unknown option refused", !!(await emit(sC, "poll:vote", { messageId: pollId, optionIds: ["nope"] }))?.error);
  const change = await emit(sC, "poll:vote", { messageId: pollId, optionIds: [optIds[1]] });
  check("changing vote moves it (one vote set per user)", change?.poll?.options[0].count === 0 && change.poll.options[1].count === 1);
  const retract = await emit(sC, "poll:vote", { messageId: pollId, optionIds: [] });
  check("retract vote", retract?.poll?.totalVoters === 0);
  check("outsider can't vote", !!(await emit(sF, "poll:vote", { messageId: pollId, optionIds: [optIds[0]] }))?.error);
  await Promise.all([emit(sC, "poll:vote", { messageId: pollId, optionIds: [optIds[2]] }), emit(sD, "poll:vote", { messageId: pollId, optionIds: [optIds[2]] }), emit(sE, "poll:vote", { messageId: pollId, optionIds: [optIds[2]] })]);
  const afterRace = await http("GET", `/messages/${G}`, A.token);
  const racePoll = (afterRace.data?.messages || []).find((m) => m._id === pollId)?.poll;
  check("simultaneous votes are all counted", racePoll?.options?.[2]?.count === 3, JSON.stringify(racePoll?.options?.map((o) => o.count)));
  check("non-creator non-admin can't close", !!(await emit(sC, "poll:close", { messageId: pollId }))?.error);
  const anon = await emit(sA, "poll:create", { conversationId: G, question: "Secret?", options: ["x", "y"], anonymous: true, multiple: true });
  const anonId = anon?.message?._id;
  const anonOpts = anon?.message?.poll?.options?.map((o) => o.id) || [];
  await emit(sB, "poll:vote", { messageId: anonId, optionIds: anonOpts });
  const anonList = await http("GET", `/messages/${G}`, C.token);
  const anonPoll = (anonList.data?.messages || []).find((m) => m._id === anonId)?.poll;
  check("anonymous poll never exposes voter ids", !!anonPoll && !JSON.stringify(anonPoll).includes(B.id) && anonPoll.options.every((o) => !("voters" in o)));
  check("multiple choice accepts 2 options", anonPoll?.options?.[0]?.count === 1 && anonPoll?.options?.[1]?.count === 1);
  check("admin (not creator) can close", !!(await emit(sA, "poll:close", { messageId: pollId }))?.ok);
  check("voting after close refused", !!(await emit(sD, "poll:vote", { messageId: pollId, optionIds: [optIds[0]] }))?.error);
  if (process.env.SMOKE_MONGO_URI) {
    const ex = await emit(sA, "poll:create", { conversationId: G, question: "Expiring?", options: ["a", "b"], expiresInMinutes: 5 });
    await mongoose.connection.db.collection("messages").updateOne({ _id: new mongoose.Types.ObjectId(ex.message._id) }, { $set: { "poll.expiresAt": new Date(Date.now() - 1000) } });
    const late = await emit(sB, "poll:vote", { messageId: ex.message._id, optionIds: [ex.message.poll.options[0].id] });
    check("voting after expiry refused", !!late?.error && /ended/i.test(late.error), late?.error);
  }

  // ---------------------------------------------------------------- group calls
  section("Group call signaling");
  await emit(sD, "conversation:join", G);
  check("can't start a group call in a 1:1", !!(await emit(sA, "group-call:start", { conversationId: DM, mode: "audio" }))?.error);
  check("outsider can't start", !!(await emit(sF, "group-call:start", { conversationId: G, mode: "audio" }))?.error);
  const start = await emit(sA, "group-call:start", { conversationId: G, mode: "video" });
  const callId = start?.callId;
  check("group call started", !!callId, JSON.stringify(start));
  check("members are rung", !!(await waitFor(sB, "group-call:ring", (r) => r.callId === callId)) && !!(await waitFor(sE, "group-call:ring", (r) => r.callId === callId)));
  check("outsider isn't rung", !seen(sF, "group-call:ring"));
  check("second call in same group refused", !!(await emit(sB, "group-call:start", { conversationId: G, mode: "audio" }))?.error);
  const st = await emit(sC, "group-call:status", { conversationId: G });
  check("late joiners can see the active call", st?.active === true && st.callId === callId);
  const jB = await emit(sB, "group-call:join", { callId });
  check("B joined and gets existing participants", jB?.ok && jB.participants.length === 1 && jB.participants[0].userId === A.id);
  const jC = await emit(sC, "group-call:join", { callId });
  const jD = await emit(sD, "group-call:join", { callId });
  check("up to 4 participants", jC?.ok && jD?.ok && jD.participants.length === 3);
  const full = await emit(sE, "group-call:join", { callId });
  check("5th participant refused with a clear message", !!full?.error && /full/i.test(full.error), full?.error);
  check("outsider can't join", !!(await emit(sF, "group-call:join", { callId }))?.error);
  check("other ringing tabs get ring-ended on timeout", !!(await waitFor(sE, "group-call:ring-ended", (r) => r.callId === callId, 4000)));
  // signaling goes to exactly one peer
  sA.log["group-call:signal"] = []; sC.log["group-call:signal"] = []; sD.log["group-call:signal"] = [];
  sB.emit("group-call:signal", { callId, to: A.id, data: { type: "offer", sdp: { type: "offer", sdp: "v=0" } } });
  check("A receives B's offer with from=B", !!(await waitFor(sA, "group-call:signal", (s) => s.from === B.id && s.data.type === "offer")));
  await sleep(150);
  check("C and D did NOT receive it", !seen(sC, "group-call:signal") && !seen(sD, "group-call:signal"));
  sF.emit("group-call:signal", { callId, to: A.id, data: { type: "offer" } });
  sB.emit("group-call:signal", { callId, to: F.id, data: { type: "offer" } });
  await sleep(150);
  check("non-participants can't inject or receive signals", !seen(sA, "group-call:signal", (s) => s.from === F.id) && !seen(sF, "group-call:signal"));
  sB.emit("group-call:media-state", { callId, muted: true, cameraOff: false, sharing: false });
  check("media-state reaches the others", !!(await waitFor(sA, "group-call:media-state", (m) => m.userId === B.id && m.muted === true)));

  section("In-call extras (group)");
  sA.emit("call:reaction", { callId, emoji: "🎉" });
  sA.emit("call:reaction", { callId, emoji: "🎉" }); // within 500ms -> dropped
  await sleep(200);
  check("reaction delivered", (sB.log["call:reaction"] || []).filter((r) => r.userId === A.id).length === 1);
  check("reaction rate limit (1 per 500ms)", (sB.log["call:reaction"] || []).length === 1);
  sA.emit("call:reaction", { callId, emoji: "💩" });
  await sleep(600);
  check("unknown emoji rejected", (sB.log["call:reaction"] || []).length === 1);
  check("outsider can't react into the call", (sF.emit("call:reaction", { callId, emoji: "👍" }), await sleep(150), !seen(sA, "call:reaction", (r) => r.userId === F.id)));
  sC.emit("call:hand", { callId, raised: true });
  check("raise hand reaches everyone", !!(await waitFor(sA, "call:hand", (h) => h.userId === C.id && h.raised === true)) && !!(await waitFor(sD, "call:hand", (h) => h.userId === C.id)));
  sB.emit("call:whiteboard-stroke", { callId, strokeId: "s1", color: "#ff0000", size: 6, points: [[0.1, 0.1], [0.2, 0.3]], end: false });
  const wb = await waitFor(sD, "call:whiteboard-stroke", (s) => s.strokeId === "s1");
  check("whiteboard stroke relays with normalised coords", wb?.points?.length === 2 && wb.userId === B.id);
  sB.emit("call:whiteboard-stroke", { callId, strokeId: "bad", color: "red", size: 6, points: [[0.1, 0.1]] });
  sB.emit("call:whiteboard-stroke", { callId, strokeId: "bad2", color: "#00ff00", size: 6, points: [[2, 0.1]] });
  await sleep(150);
  check("invalid strokes (bad color / out of 0-1) dropped", !seen(sD, "call:whiteboard-stroke", (s) => s.strokeId === "bad" || s.strokeId === "bad2"));
  const sync = await emit(sC, "call:whiteboard-sync", { callId });
  check("late joiner gets existing strokes", sync?.strokes?.some((s) => s.id === "s1"));
  sC.emit("call:whiteboard-undo", { callId, strokeId: "s1" });
  await sleep(150);
  check("can't undo someone else's stroke", (await emit(sA, "call:whiteboard-sync", { callId }))?.strokes?.some((s) => s.id === "s1"));
  sB.emit("call:whiteboard-undo", { callId, strokeId: "s1" });
  check("own stroke undo relays", !!(await waitFor(sA, "call:whiteboard-undo", (u) => u.strokeId === "s1")));
  sB.emit("call:whiteboard-clear", { callId });
  check("clear relays", !!(await waitFor(sD, "call:whiteboard-clear")));

  section("Group call end + persistence");
  sB.emit("group-call:leave", { callId }); sC.emit("group-call:leave", { callId }); sD.emit("group-call:leave", { callId });
  await sleep(200);
  check("call still alive while someone remains", (await emit(sA, "group-call:status", { conversationId: G }))?.active === true);
  sA.emit("group-call:leave", { callId });
  check("call ends when the last person leaves", !!(await waitFor(sE, "group-call:ended", (e) => e.callId === callId)));
  const hist = await http("GET", "/calls", A.token);
  const rec = (hist.data?.calls || []).find((c) => c.callId === callId);
  check("Calls tab lists the group call", rec?.isGroup === true && rec.participants.length >= 4, JSON.stringify(rec)?.slice(0, 160));
  const gm = await http("GET", `/messages/${G}`, A.token);
  check("call record message written in the group", (gm.data?.messages || []).some((m) => m.type === "call" && m.call?.callId === callId && m.call.isGroup));
  const histE = await http("GET", "/calls", E.token);
  check("missed member sees it as missed", (histE.data?.calls || []).find((c) => c.callId === callId)?.participants?.find((p) => p.user.id === E.id)?.status === "missed");

  section("Group call: no answer + reconnect grace");
  const lone = await emit(sA, "group-call:start", { conversationId: G, mode: "audio" });
  const ended = await waitFor(sA, "group-call:ended", (e) => e.callId === lone?.callId, 6000);
  check("nobody answers -> call ends as missed", ended?.status === "missed" && ended.reason === "no-answer", JSON.stringify(ended));
  const call2 = await emit(sA, "group-call:start", { conversationId: G, mode: "audio" });
  await emit(sB, "group-call:join", { callId: call2.callId });
  // B drops and comes back inside the grace window -> keeps their seat
  sB.close();
  check("peers are told B is reconnecting", !!(await waitFor(sA, "group-call:peer-reconnecting", (e) => e.userId === B.id)));
  const sB2 = await connect(B.token);
  const resumed = await emit(sB2, "group-call:resume", { callId: call2.callId });
  check("B resumes the call after reconnecting", resumed?.ok === true);
  check("peers are told B is back", !!(await waitFor(sA, "group-call:peer-resumed", (e) => e.userId === B.id)));
  await sleep(2200);
  check("B's seat survived the grace period", (await emit(sA, "group-call:status", { conversationId: G }))?.participantIds?.includes(B.id));
  // C joins then vanishes for good -> removed after the grace period
  await emit(sC, "group-call:join", { callId: call2.callId });
  sC.close();
  check("a participant who never returns is dropped", !!(await waitFor(sA, "group-call:participant-left", (e) => e.userId === C.id && e.reason === "connection-lost", 5000)));
  sA.emit("group-call:leave", { callId: call2.callId });
  sB2.emit("group-call:leave", { callId: call2.callId });
  await sleep(200);
  // fresh sockets for the remaining sections
  sB2.close();
  sB = await connect(B.token);
  sC = await connect(C.token);
  for (const s of [sB, sC]) await emit(s, "conversation:join", G);

  // ---------------------------------------------------------------- watch party
  section("Watch together");
  check("rejects non-YouTube urls", !!(await emit(sA, "watch:start", { conversationId: G, url: "https://evil.example/watch?v=dQw4w9WgXcQ" }))?.error);
  check("outsider can't start", !!(await emit(sF, "watch:start", { conversationId: G, url: "https://youtu.be/dQw4w9WgXcQ" }))?.error);
  const ws = await emit(sA, "watch:start", { conversationId: G, url: "https://youtu.be/dQw4w9WgXcQ?t=3" });
  check("host starts a party (video id parsed)", ws?.session?.videoId === "dQw4w9WgXcQ" && ws.session.hostId === A.id);
  check("members get watch:state", !!(await waitFor(sB, "watch:state", (s) => s.videoId === "dQw4w9WgXcQ")));
  const lj = await emit(sC, "watch:join", { conversationId: G });
  check("late joiner resyncs", lj?.session?.videoId === "dQw4w9WgXcQ" && typeof lj.serverNow === "number");
  check("outsider can't join", !!(await emit(sF, "watch:join", { conversationId: G }))?.error);
  check("non-controller can't control", !!(await emit(sB, "watch:control", { conversationId: G, action: "play", time: 5 }))?.error);
  const play = await emit(sA, "watch:control", { conversationId: G, action: "play", time: 42 });
  check("host play -> ack", play?.ok && play.session.playing === true && play.session.time === 42);
  const st2 = await waitFor(sB, "watch:state", (s) => s.playing === true);
  check("followers receive {videoId, playing, time, sentAt}", st2?.time === 42 && typeof st2.sentAt === "number" && typeof st2.serverNow === "number");
  sA.log["watch:state"] = [];
  await emit(sA, "watch:control", { conversationId: G, action: "seek", time: 100 });
  check("seek propagates", !!(await waitFor(sB, "watch:state", (s) => s.time === 100)));
  check("host does not get its own echo", !seen(sA, "watch:state", (s) => s.time === 100));
  check("pass control to a member", !!(await emit(sA, "watch:pass", { conversationId: G, userId: B.id }))?.ok);
  check("new controller can pause", !!(await emit(sB, "watch:control", { conversationId: G, action: "pause", time: 120 }))?.ok);
  check("old controller can't anymore", !!(await emit(sA, "watch:control", { conversationId: G, action: "play", time: 1 }))?.error);
  check("only host can change video", !!(await emit(sB, "watch:control", { conversationId: G, action: "load", url: "https://youtu.be/aqz-KE-bpKQ" }))?.error);
  check("non-host can't end", !!(await emit(sB, "watch:end", { conversationId: G }))?.error);
  check("pass target must be a member", !!(await emit(sA, "watch:pass", { conversationId: G, userId: F.id }))?.error);
  await emit(sA, "watch:end", { conversationId: G });
  check("host ends -> watch:ended", !!(await waitFor(sC, "watch:ended", (e) => e.conversationId === G)));
  const none = await emit(sC, "watch:join", { conversationId: G });
  check("no session after end", none?.session === null);

  // ---------------------------------------------------------------- live location
  section("Live location");
  check("needs explicit consent", !!(await emit(sA, "location:start", { conversationId: G, durationMinutes: 15 }))?.error);
  check("only 15 / 60 / 480 minutes", !!(await emit(sA, "location:start", { conversationId: G, durationMinutes: 5, consent: true }))?.error);
  check("outsider can't share", !!(await emit(sF, "location:start", { conversationId: G, durationMinutes: 15, consent: true }))?.error);
  await http("POST", `/users/${D.id}/block`, A.token); // A blocks D
  const ls = await emit(sA, "location:start", { conversationId: G, durationMinutes: 15, consent: true });
  const locId = ls?.message?._id;
  check("live share started", !!locId && ls.message.location.live === true);
  check("start payload carries no coordinates", !("lat" in (ls.message.location || {})));
  sA.log["location:update"] = [];
  const up = await emit(sA, "location:update", { messageId: locId, lat: 28.6139, lng: 77.209, accuracy: 12 });
  check("sender can update", up?.ok);
  check("member receives coordinates", !!(await waitFor(sB, "location:update", (u) => u.messageId === locId && u.lat === 28.6139)));
  await sleep(150);
  check("blocked user never receives them", !seen(sD, "location:update"));
  check("outsider never receives them", !seen(sF, "location:update"));
  check("non-sender can't push locations", !!(await emit(sB, "location:update", { messageId: locId, lat: 1, lng: 1 }))?.error);
  check("invalid coordinates rejected", !!(await emit(sA, "location:update", { messageId: locId, lat: 123, lng: 5 }))?.error);
  const live = await http("GET", `/messages/${G}`, B.token);
  const liveMsg = (live.data?.messages || []).find((m) => m._id === locId);
  check("members see coordinates while live (REST)", liveMsg?.location?.lat === 28.6139);
  const liveD = await http("GET", `/messages/${G}`, D.token);
  check("blocked user's REST view has no coordinates", (liveD.data?.messages || []).find((m) => m._id === locId)?.location?.lat === undefined);
  check("sender can stop", !!(await emit(sA, "location:stop", { messageId: locId }))?.ok);
  check("location:ended is broadcast", !!(await waitFor(sB, "location:ended", (e) => e.messageId === locId)));
  const stopped = await http("GET", `/messages/${G}`, B.token);
  const stoppedMsg = (stopped.data?.messages || []).find((m) => m._id === locId);
  check("after stop nothing is returned", stoppedMsg?.location?.live === false && stoppedMsg.location.lat === undefined);
  check("updates after stop are refused", (await emit(sA, "location:update", { messageId: locId, lat: 28.6, lng: 77.2 }))?.ended === true);
  await http("POST", `/users/${D.id}/unblock`, A.token);

  if (process.env.SMOKE_MONGO_URI) {
    const ls2 = await emit(sA, "location:start", { conversationId: G, durationMinutes: 15, consent: true });
    const id2 = ls2.message._id;
    await emit(sA, "location:update", { messageId: id2, lat: 19.07, lng: 72.87, accuracy: 8 });
    await mongoose.connection.db.collection("messages").updateOne({ _id: new mongoose.Types.ObjectId(id2) }, { $set: { "location.expiresAt": new Date(Date.now() - 1000) } });
    // The client timer / server sweep end it; reads are also expiry-aware immediately.
    const exp = await http("GET", `/messages/${G}`, B.token);
    check("expired share returns no coordinates immediately", (exp.data?.messages || []).find((m) => m._id === id2)?.location?.lat === undefined);
    check("server sweep announces the end", !!(await waitFor(sB, "location:ended", (e) => e.messageId === id2, 4000)));
    check("updates after expiry refused", (await emit(sA, "location:update", { messageId: id2, lat: 19.1, lng: 72.9 }))?.ended === true);
    const raw = await mongoose.connection.db.collection("messages").findOne({ _id: new mongoose.Types.ObjectId(id2) });
    check("database never held any coordinates", !JSON.stringify(raw).includes("19.07") && !JSON.stringify(raw).includes("72.87"));
    check("share marked ended in DB", raw?.location?.live === false && !!raw.location.endedAt);
  } else {
    console.log("  (set SMOKE_MONGO_URI to also test expiry + DB contents)");
  }

  for (const s of [sA, sB, sC, sD, sE, sF]) s.close();
  if (mongoose.connection.readyState) await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failed:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(2);
});
