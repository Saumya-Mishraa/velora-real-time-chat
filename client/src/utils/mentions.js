// @mention helpers (group chats).
//
// A mention is written in the text as "@username" (usernames are unique
// and lowercase). The text stays the source of truth: highlighting and
// the `mentions` id list are both derived from it, so editing a message
// never leaves a stale mention behind.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const memberId = (m) => String(m?.id || m?._id || "");

const buildRegex = (members = []) => {
  const names = members
    .map((m) => m?.username)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  if (!names.length) return null;
  // group 1 = the character before "@" (so "a@b.com" isn't a mention),
  // group 2 = the matched username.
  return new RegExp(`(^|[^\\w@])@(${names.join("|")})(?![\\w])`, "gi");
};

// -> [{ type: "text", value } | { type: "mention", value, member }]
export const splitMentions = (text = "", members = []) => {
  const re = buildRegex(members);
  if (!re || !text.includes("@")) return [{ type: "text", value: text }];
  const byName = new Map(members.map((m) => [String(m.username).toLowerCase(), m]));
  const parts = [];
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    const start = match.index + match[1].length;
    const end = start + 1 + match[2].length;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "mention", value: text.slice(start, end), member: byName.get(match[2].toLowerCase()) });
    last = end;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
};

export const extractMentionIds = (text = "", members = [], selfId = "") => {
  const ids = new Set();
  splitMentions(text, members).forEach((p) => {
    if (p.type === "mention" && p.member) {
      const id = memberId(p.member);
      if (id && id !== String(selfId)) ids.add(id);
    }
  });
  return Array.from(ids);
};

// Does this message mention the given user? Prefers the server-provided
// `mentions` list, falls back to scanning the text.
export const mentionsUser = (message, user) => {
  if (!message || !user) return false;
  const uid = String(user.id || user._id || "");
  if (Array.isArray(message.mentions) && message.mentions.length) {
    return message.mentions.some((m) => String(m?._id || m?.id || m) === uid);
  }
  if (!message.text || !user.username) return false;
  return new RegExp(`(^|[^\\w@])@${escapeRe(user.username)}(?![\\w])`, "i").test(message.text);
};

// Is the caret right after an "@query"? -> { start, query } | null
export const getMentionQuery = (text = "", caret = 0) => {
  const before = text.slice(0, caret);
  const m = /(^|[\s(])@([^\s@]{0,32})$/.exec(before);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
};
