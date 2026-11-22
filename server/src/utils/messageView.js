import { liveLocationFor } from "../socket/locationStore.js";

// Per-viewer shaping of a message before it leaves the server. EVERY path
// that returns or emits messages (list, create, search, pinned, starred,
// conversation list lastMessage, reply previews, socket message:new) goes
// through shapeMessage so private data can't leak from a forgotten route:
//
//  - view-once media: attachment.url / name are stripped for everybody,
//    sender included. The URL only ever leaves through the single-use
//    endpoint POST /api/messages/single/:id/view-once.
//  - polls: raw `voters` ids are replaced by counts (+ voter ids only for
//    non-anonymous polls) and the viewer's own `myVotes`.
//  - live location: coordinates are attached from memory only while the
//    share is live and only for viewers who aren't blocked either way.

const idOf = (v) => String(v?._id || v?.id || v);

export const pollIsExpired = (poll, now = Date.now()) =>
  !!poll?.expiresAt && new Date(poll.expiresAt).getTime() <= now;

export const pollIsClosed = (poll, now = Date.now()) => !!poll?.closed || pollIsExpired(poll, now);

export const shapePoll = (poll, viewerId) => {
  const options = (poll.options || []).map((o) => {
    const voters = (o.voters || []).map(idOf);
    return {
      id: o.id,
      text: o.text,
      count: voters.length,
      ...(poll.anonymous ? {} : { voters }),
    };
  });
  const everyone = new Set();
  (poll.options || []).forEach((o) => (o.voters || []).forEach((v) => everyone.add(idOf(v))));
  const mine = (poll.options || []).filter((o) => (o.voters || []).some((v) => idOf(v) === String(viewerId))).map((o) => o.id);
  return {
    question: poll.question,
    options,
    multiple: !!poll.multiple,
    anonymous: !!poll.anonymous,
    expiresAt: poll.expiresAt || null,
    closed: pollIsClosed(poll),
    closedBy: poll.closedBy ? idOf(poll.closedBy) : null,
    totalVoters: everyone.size,
    myVotes: viewerId ? mine : [],
  };
};

const shapeLocation = (message, { hideLocation } = {}) => {
  const loc = message.location || {};
  const now = Date.now();
  const live = !!loc.live && !!loc.expiresAt && new Date(loc.expiresAt).getTime() > now && !loc.endedAt;
  const out = {
    live,
    startedAt: loc.startedAt || null,
    expiresAt: loc.expiresAt || null,
    ended: !live,
  };
  if (live && !hideLocation) {
    const coords = liveLocationFor(message._id, now);
    if (coords) Object.assign(out, coords);
  }
  return out;
};

export const shapeMessage = (m, viewerId, opts = {}) => {
  if (!m) return m;
  const obj = m.toObject ? m.toObject() : { ...m };

  if (obj.viewOnce) {
    // Never expose where the media lives. Keep only what a placeholder needs.
    obj.attachment = { mimeType: obj.attachment?.mimeType || "" };
    obj.viewedBy = (obj.viewedBy || []).map(idOf);
    obj.viewedByMe = obj.viewedBy.includes(String(viewerId));
    // A caption could still be shown; the media may not be.
  }

  if (obj.type === "poll" && obj.poll) obj.poll = shapePoll(obj.poll, viewerId);

  if (obj.type === "location" && obj.location) {
    const senderId = idOf(obj.sender);
    const hide = !!opts.noCoords || (senderId !== String(viewerId) && !!opts.blockedIds?.has(senderId));
    obj.location = shapeLocation(obj, { hideLocation: hide });
  }

  // Reply previews embed the whole referenced message - shape it too.
  if (obj.replyTo && typeof obj.replyTo === "object" && (obj.replyTo.viewOnce || obj.replyTo.type === "poll" || obj.replyTo.type === "location")) {
    obj.replyTo = shapeMessage(obj.replyTo, viewerId, opts);
  }
  return obj;
};

// Viewer-neutral variant for room broadcasts (new messages): nobody has
// voted / viewed yet and no coordinates exist, so one payload fits all.
export const shapeMessageForBroadcast = (m) => shapeMessage(m, null);

export const needsBlockSet = (messages) => messages.some((m) => m?.type === "location" && m?.location?.live);
