import User from "../models/User.js";

// Same rule the socket layer uses (blocked in either direction), shared
// here so REST controllers and the new socket handlers don't re-implement it.
export const blockedEitherWayIds = async (userId) => {
  const me = await User.findById(userId).select("blockedUsers");
  const blockedByMe = (me?.blockedUsers || []).map(String);
  const blockedMe = await User.find({ blockedUsers: userId }).select("_id");
  return new Set([...blockedByMe, ...blockedMe.map((u) => String(u._id))]);
};
