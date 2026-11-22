// Tiny per-key async mutex. Used where a read-modify-write must not interleave
// with itself (one person opening a view-once photo twice at once; many people
// voting on the same poll at once). It serialises work inside ONE server
// process; the database-level guards (conditional updates) remain in place for
// the multi-instance case.
const tails = new Map();

export const withKeyLock = async (key, fn) => {
  const prev = tails.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  tails.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
};
