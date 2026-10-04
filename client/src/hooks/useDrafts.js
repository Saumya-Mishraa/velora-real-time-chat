import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext.jsx";

// Drafts are per user + per conversation and live in localStorage, so
// they survive leaving the chat, refreshing the page and closing the tab.
// A tiny external store keeps every consumer in sync — the composer, the
// sidebar's "Draft:" preview, and other open tabs (via the `storage`
// event) — without a context re-render of the whole tree.

const keyFor = (userId) => `velora_drafts:${userId}`;
const listeners = new Set();
let cache = { userId: null, map: {} };

const read = (userId) => {
  if (!userId) return {};
  try {
    return JSON.parse(localStorage.getItem(keyFor(userId)) || "{}") || {};
  } catch {
    return {};
  }
};

const ensure = (userId) => {
  if (cache.userId !== userId) cache = { userId, map: read(userId) };
  return cache.map;
};

const emit = () => listeners.forEach((l) => l());

const persist = (userId, map) => {
  cache = { userId, map };
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(keyFor(userId));
    else localStorage.setItem(keyFor(userId), JSON.stringify(map));
  } catch {
    // Storage full / unavailable: the in-memory copy still works this session.
  }
  emit();
};

export const setDraftFor = (userId, conversationId, text) => {
  if (!userId || !conversationId) return;
  const map = { ...ensure(userId) };
  if (text && text.trim()) map[conversationId] = { text, updatedAt: Date.now() };
  else delete map[conversationId];
  persist(userId, map);
};

export const clearDraftFor = (userId, conversationId) => setDraftFor(userId, conversationId, "");

const subscribe = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// Whole-map snapshot (for the chat list).
export const useDrafts = () => {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === keyFor(userId)) {
        cache = { userId, map: read(userId) };
        emit();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  return useSyncExternalStore(
    subscribe,
    () => ensure(userId),
    () => ({})
  );
};

// One conversation's draft text + setters.
export const useDraft = (conversationId) => {
  const { user } = useAuth();
  const userId = user?.id;
  const drafts = useDrafts();
  const text = drafts[conversationId]?.text || "";

  const setText = useCallback(
    (value) => setDraftFor(userId, conversationId, value),
    [userId, conversationId]
  );
  const clear = useCallback(() => clearDraftFor(userId, conversationId), [userId, conversationId]);
  return [text, setText, clear];
};
