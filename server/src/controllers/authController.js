import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { toPublicUrl } from "../utils/mediaUrl.js";

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const publicUser = (user, req) => ({
  id: user._id,
  name: user.name,
  username: user.username,
  email: user.email,
  avatar: toPublicUrl(user.avatar, req),
  bio: user.bio,
  statusMessage: user.statusMessage,
  status: user.status,
  lastSeen: user.lastSeen,
  privacy: user.privacy,
  blockedUsers: user.blockedUsers,
});

export const register = async (req, res) => {
  try {
    const { name, username, email, password, confirmPassword } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
    });
    if (existing) {
      return res.status(409).json({ message: "Email or username already in use." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashed,
      avatar: req.body.avatar || "",
    });

    const token = signToken(user._id);
    res.status(201).json({ token, user: publicUser(user, req) });
  } catch (err) {
    res.status(500).json({ message: "Registration failed.", error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = email or username

    if (!identifier || !password) {
      return res.status(400).json({ message: "Email/username and password are required." });
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }],
    }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    user.status = "online";
    user.lastSeen = new Date();
    await user.save();

    const token = signToken(user._id);
    res.json({ token, user: publicUser(user, req) });
  } catch (err) {
    res.status(500).json({ message: "Login failed.", error: err.message });
  }
};

export const logout = async (req, res) => {
  try {
    req.user.status = "offline";
    req.user.lastSeen = new Date();
    await req.user.save();
    res.json({ message: "Logged out." });
  } catch (err) {
    res.status(500).json({ message: "Logout failed.", error: err.message });
  }
};

export const me = async (req, res) => {
  res.json({ user: publicUser(req.user, req) });
};

// NOTE: Forgot/reset password below are intentionally stubbed. Sending real
// reset emails needs a mail provider (SMTP/SendGrid/etc). This generates a
// short-lived token and returns it directly instead of emailing it, so you
// can see the flow working end-to-end without extra infrastructure.
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user) {
      // Don't leak whether the email exists.
      return res.json({ message: "If that email exists, a reset link has been generated." });
    }
    const resetToken = jwt.sign({ id: user._id, purpose: "reset" }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    res.json({
      message: "Reset token generated (no email service configured, returned directly).",
      resetToken,
    });
  } catch (err) {
    res.status(500).json({ message: "Could not process request.", error: err.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== "reset") throw new Error("Invalid token purpose");

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    user.password = await bcrypt.hash(password, 10);
    await user.save();
    res.json({ message: "Password updated successfully." });
  } catch (err) {
    res.status(400).json({ message: "Invalid or expired reset token." });
  }
};
