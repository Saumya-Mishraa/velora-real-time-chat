// Tiny shared registry so the one-to-one call handler and the group call
// handler can tell whether someone is already busy in the *other* kind of
// call, without importing each other (avoids a circular import).
const inGroupCall = new Map(); // userId -> groupCallId

export const setUserGroupCall = (userId, callId) => inGroupCall.set(String(userId), callId);
export const clearUserGroupCall = (userId, callId) => {
  if (!callId || inGroupCall.get(String(userId)) === callId) inGroupCall.delete(String(userId));
};
export const getUserGroupCallId = (userId) => inGroupCall.get(String(userId)) || null;
