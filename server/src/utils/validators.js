// Single source of truth for username / password / email rules.
// The client mirrors this file in client/src/utils/validators.js - keep the
// two in sync (same limits, same reserved/common lists, same messages).
//
// Every validator returns { ok, message, value } where `value` is the
// normalised input (username trimmed + lowercased, email trimmed +
// lowercased). Only registration and password-reset use them: login is
// deliberately NOT validated so people with older credentials can sign in.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt silently truncates beyond 72 bytes

export const RESERVED_USERNAMES = [
  "admin", "administrator", "root", "support", "velora", "api", "me",
  "system", "moderator", "help", "null", "undefined",
];

export const COMMON_PASSWORDS = [
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd",
  "12345678", "123456789", "1234567890", "11111111", "00000000", "87654321",
  "qwerty123", "qwertyui", "qwertyuiop", "qwerty12", "1q2w3e4r", "1qaz2wsx",
  "iloveyou", "iloveyou1", "abc12345", "abcd1234", "asdfghjk", "asdf1234",
  "letmein1", "welcome1", "welcome123", "admin123", "admin1234", "monkey123",
  "dragon123", "football1", "baseball1", "sunshine1", "princess1", "superman1",
  "master123", "login123", "changeme1", "trustno1", "whatever1", "starwars1",
];

export const USERNAME_RE = /^[a-z0-9._]+$/;

export const validateUsername = (input) => {
  const value = String(input ?? "").trim().toLowerCase();
  const fail = (message) => ({ ok: false, message, value });
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) {
    return fail(`Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.`);
  }
  if (!USERNAME_RE.test(value)) {
    return fail("Username can only contain letters, numbers, \".\" and \"_\".");
  }
  if (/^[._]|[._]$/.test(value)) return fail("Username can't start or end with \".\" or \"_\".");
  if (/\.\.|__|\._|_\./.test(value)) return fail("Username can't have two \".\" or \"_\" in a row.");
  if (RESERVED_USERNAMES.includes(value)) return fail("That username is reserved. Please pick another.");
  return { ok: true, message: null, value };
};

export const validateEmail = (input) => {
  const value = String(input ?? "").trim().toLowerCase();
  if (!value || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return { ok: false, message: "Enter a valid email address.", value };
  }
  return { ok: true, message: null, value };
};

// `context` lets the password be checked against who it belongs to.
export const validatePassword = (input, { username, email } = {}) => {
  const value = typeof input === "string" ? input : "";
  const fail = (message) => ({ ok: false, message, value });
  if (value.length < PASSWORD_MIN) return fail(`Password must be at least ${PASSWORD_MIN} characters.`);
  if (value.length > PASSWORD_MAX) return fail(`Password can be at most ${PASSWORD_MAX} characters.`);
  if (!/[A-Za-z]/.test(value)) return fail("Password must include at least one letter.");
  if (!/[0-9]/.test(value)) return fail("Password must include at least one number.");
  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.includes(lower)) return fail("That password is too common. Choose something harder to guess.");
  const uname = String(username || "").trim().toLowerCase();
  if (uname.length >= 3 && lower.includes(uname)) return fail("Password can't contain your username.");
  const local = String(email || "").trim().toLowerCase().split("@")[0];
  if (local && local.length >= 3 && lower.includes(local)) return fail("Password can't contain your email name.");
  return { ok: true, message: null, value };
};
