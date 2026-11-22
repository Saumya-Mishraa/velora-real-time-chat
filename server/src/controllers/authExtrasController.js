import User from "../models/User.js";
import { validateUsername } from "../utils/validators.js";

// GET /api/auth/check-username?u=name  ->  { available, valid, message }
// Public (used on the Register form before an account exists), so it is
// rate-limited per IP to make bulk username enumeration impractical.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map(); // ip -> { count, resetAt }

const limited = (ip) => {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
};

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
}, WINDOW_MS).unref();

export const checkUsername = async (req, res) => {
  try {
    if (limited(req.ip || "unknown")) {
      return res.status(429).json({ message: "Too many checks. Please slow down." });
    }
    const check = validateUsername(req.query.u);
    if (!check.ok) return res.json({ available: false, valid: false, message: check.message });
    const taken = await User.exists({ username: check.value });
    res.json({ available: !taken, valid: true, message: taken ? "That username is already taken." : null });
  } catch (err) {
    res.status(500).json({ message: "Couldn't check that username." });
  }
};
