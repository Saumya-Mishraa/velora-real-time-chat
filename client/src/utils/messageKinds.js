// Message kinds that are stored as plain "image" messages but should look
// different: GIFs and stickers. The server may persist explicit `gif` /
// `sticker` flags; until then the attachment name prefix identifies them.

export const isSticker = (m) => !!m && (m.sticker === true || /^sticker-/i.test(m.attachment?.name || ""));
export const isGif = (m) => !!m && !isSticker(m) && (m.gif === true || /^giphy-/i.test(m.attachment?.name || ""));

// Can this message be forwarded? (not calls, moments, status replies, deleted)
export const canForward = (m) =>
  !!m &&
  !m.deletedForEveryone &&
  !m.deleted &&
  m.type !== "call" &&
  // View-once media, polls and live locations can never be forwarded.
  !m.viewOnce &&
  m.type !== "poll" &&
  m.type !== "location" &&
  !m.shared &&
  !m.statusReply?.statusId &&
  (m.type === "text" ? !!m.text : !!m.attachment?.url);

export const buildForwardPayload = (m) => {
  const payload = { type: m.type, text: m.text || "", forwarded: true };
  if (isSticker(m)) payload.sticker = true;
  if (isGif(m)) payload.gif = true;
  if (m.type !== "text" && m.attachment?.url) {
    payload.attachment = {
      path: m.attachment.url,
      name: m.attachment.name,
      size: m.attachment.size,
      mimeType: m.attachment.mimeType,
      ...(m.attachment.duration ? { duration: m.attachment.duration } : {}),
    };
  }
  return payload;
};

// One-line description: { kind, text }
export const describeMessage = (m) => {
  if (!m) return { kind: "text", text: "" };
  if (m.deletedForEveryone || m.deleted) return { kind: "deleted", text: "This message was deleted." };
  if (m.viewOnce) return { kind: m.type, text: `${m.type === "video" ? "Video" : "Photo"} · View once` };
  if (m.type === "poll") return { kind: "poll", text: `Poll: ${m.poll?.question || m.text || ""}`.trim() };
  if (m.type === "location") return { kind: "location", text: "Live location" };
  if (m.type === "image") {
    if (isSticker(m)) return { kind: "sticker", text: "Sticker" };
    if (isGif(m)) return { kind: "gif", text: "GIF" };
    return { kind: "image", text: m.text || "Photo" };
  }
  if (m.type === "video") return { kind: "video", text: m.text || "Video" };
  if (m.type === "voice") return { kind: "voice", text: "Voice message" };
  if (m.type === "audio") return { kind: "audio", text: m.attachment?.name || "Audio" };
  if (m.type === "file") return { kind: "file", text: m.attachment?.name || "File" };
  if (m.type === "call") return { kind: "call", text: "Call" };
  if (m.shared?.kind === "moment") return { kind: "moment", text: `Moment · ${m.shared.title}` };
  return { kind: "text", text: m.text || "Attachment" };
};

export const isStarredBy = (m, userId) => {
  if (!m) return false;
  if (typeof m.starred === "boolean") return m.starred;
  return (m.starredBy || []).some((u) => String(u?._id || u?.id || u) === String(userId));
};

export const withStar = (m, userId, value) => {
  const next = { ...m, starred: value };
  if (Array.isArray(m.starredBy)) {
    const rest = m.starredBy.filter((u) => String(u?._id || u?.id || u) !== String(userId));
    next.starredBy = value ? [...rest, userId] : rest;
  }
  return next;
};
