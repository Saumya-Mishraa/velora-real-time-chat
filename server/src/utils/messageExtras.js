import User from "../models/User.js";

// Extra per-message fields the client can send along with a message:
// forwarded copies, GIF / sticker flags and @mentions. Shared by the
// socket "message:send" handler and the REST createMessage fallback so
// both paths store exactly the same thing.

const MAX_MENTIONS = 50;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Mentions only exist in group chats, only for current members, and
// never for the sender themselves.
export const sanitizeMentionIds = (ids, conversation, senderId) => {
  if (!conversation?.isGroup || !Array.isArray(ids)) return [];
  const members = new Set(conversation.members.map(String));
  const out = new Set();
  for (const raw of ids) {
    const id = String(raw?._id || raw?.id || raw || "");
    if (id && id !== String(senderId) && members.has(id)) out.add(id);
    if (out.size >= MAX_MENTIONS) break;
  }
  return Array.from(out);
};

// Re-derives mentions from the text (used when a message is edited, so an
// edit never leaves a stale mention behind).
export const deriveMentionIds = async (text, conversation, senderId) => {
  if (!conversation?.isGroup || !text || !String(text).includes("@")) return [];
  const users = await User.find({ _id: { $in: conversation.members } }).select("username");
  const names = users
    .filter((u) => u.username && String(u._id) !== String(senderId))
    .sort((a, b) => b.username.length - a.username.length);
  if (!names.length) return [];
  const byName = new Map(names.map((u) => [u.username.toLowerCase(), String(u._id)]));
  const re = new RegExp(`(^|[^\\w@])@(${names.map((u) => escapeRe(u.username)).join("|")})(?![\\w])`, "gi");
  const ids = new Set();
  let match;
  while ((match = re.exec(String(text))) !== null) {
    const id = byName.get(match[2].toLowerCase());
    if (id) ids.add(id);
  }
  return Array.from(ids);
};

// Builds the optional fields to merge into Message.create().
export const buildMessageExtras = (body, { type, conversation, senderId }) => {
  const extras = {};
  if (body?.forwarded === true) extras.forwarded = true;
  if (type === "image") {
    if (body?.sticker === true) extras.sticker = true;
    else if (body?.gif === true) extras.gif = true;
  }
  // View-once is only valid for photos / videos (not GIFs, stickers, files, voice).
  if ((type === "image" || type === "video") && body?.viewOnce === true && !extras.gif && !extras.sticker) {
    extras.viewOnce = true;
  }
  const mentions = sanitizeMentionIds(body?.mentions, conversation, senderId);
  if (mentions.length) extras.mentions = mentions;
  return extras;
};
