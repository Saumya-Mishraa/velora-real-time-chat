// In-memory store for LIVE location coordinates.
//
// Privacy by design: coordinates are never written to MongoDB. A share is
// just { lat, lng, accuracy, updatedAt } here, keyed by message id, and is
// dropped the moment the share is stopped or expires. After that nothing
// about where the person was exists on the server, and nothing can be
// returned from it (see liveLocationFor, which re-checks expiry on read).
const shares = new Map(); // messageId -> share

export const startShare = (messageId, share) => {
  shares.set(String(messageId), { ...share, lat: null, lng: null, accuracy: null, updatedAt: null });
};

export const getShare = (messageId) => shares.get(String(messageId)) || null;

export const updateShare = (messageId, { lat, lng, accuracy }) => {
  const s = shares.get(String(messageId));
  if (!s) return null;
  s.lat = lat;
  s.lng = lng;
  s.accuracy = accuracy ?? null;
  s.updatedAt = Date.now();
  return s;
};

export const stopShare = (messageId) => shares.delete(String(messageId));

export const expiredShares = (now = Date.now()) => {
  const out = [];
  for (const [id, s] of shares) if (s.expiresAt <= now) out.push({ messageId: id, ...s });
  return out;
};

// Current coordinates for a message, or null when there are none / the
// share has ended or expired. Safe to call from any read path.
export const liveLocationFor = (messageId, now = Date.now()) => {
  const s = shares.get(String(messageId));
  if (!s || s.expiresAt <= now || s.lat == null) return null;
  return { lat: s.lat, lng: s.lng, accuracy: s.accuracy, updatedAt: s.updatedAt };
};
