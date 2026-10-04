// userId -> Set of socket ids (a user can have multiple tabs/devices open).
// Kept in its own module so the message handler, call handler and REST
// controllers can all share it without importing each other.
export const onlineUsers = new Map();

export const addSocket = (userId, socketId) => {
  const key = String(userId);
  if (!onlineUsers.has(key)) onlineUsers.set(key, new Set());
  onlineUsers.get(key).add(socketId);
};

export const removeSocket = (userId, socketId) => {
  const key = String(userId);
  const set = onlineUsers.get(key);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(key);
    return true; // fully offline now
  }
  return false;
};

export const getSocketIds = (userId) => Array.from(onlineUsers.get(String(userId)) || []);
export const isUserOnline = (userId) => onlineUsers.has(String(userId));

// Pushes a real-time event to every connected socket of one user (all
// their open tabs/devices).
export const emitToUser = (io, userId, event, payload) => {
  onlineUsers.get(String(userId))?.forEach((sid) => io.to(sid).emit(event, payload));
};

export const emitToUsers = (io, userIds, event, payload) => {
  new Set(userIds.map(String)).forEach((id) => emitToUser(io, id, event, payload));
};

// Makes every already-connected socket of the given users join (or leave)
// a conversation room right away instead of waiting for a reconnect.
export const joinUsersToConversation = (io, memberIds, conversationId) => {
  const room = `conversation:${conversationId}`;
  memberIds.forEach((memberId) => {
    getSocketIds(memberId).forEach((sid) => io.sockets.sockets.get(sid)?.join(room));
  });
};

export const leaveUsersFromConversation = (io, memberIds, conversationId) => {
  const room = `conversation:${conversationId}`;
  memberIds.forEach((memberId) => {
    getSocketIds(memberId).forEach((sid) => io.sockets.sockets.get(sid)?.leave(room));
  });
};
