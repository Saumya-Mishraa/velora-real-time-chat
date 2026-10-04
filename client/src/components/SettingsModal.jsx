import React, { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import Modal from "./Modal.jsx";
import Avatar from "./Avatar.jsx";
import ThemeSelector from "./ThemeSelector.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../services/api.js";

const PRIVACY_FIELDS = [
  { key: "lastSeen", label: "Last seen" },
  { key: "onlineStatus", label: "Online status" },
  { key: "profilePicture", label: "Profile picture" },
  { key: "messaging", label: "Who can message me" },
];

const TABS = ["profile", "privacy", "blocked", "appearance"];

const SettingsModal = ({ open, onClose }) => {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [statusMessage, setStatusMessage] = useState(user?.statusMessage || "");
  const [privacy, setPrivacy] = useState(
    user?.privacy || { lastSeen: "everyone", onlineStatus: "everyone", profilePicture: "everyone", messaging: "everyone" }
  );
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [tab, setTab] = useState("profile");
  const [blockedUsers, setBlockedUsers] = useState([]);

  useEffect(() => {
    if (!open) return;
    setName(user?.name || "");
    setBio(user?.bio || "");
    setStatusMessage(user?.statusMessage || "");
    setPrivacy(user?.privacy || { lastSeen: "everyone", onlineStatus: "everyone", profilePicture: "everyone", messaging: "everyone" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && tab === "blocked") {
      api.get("/users/blocked").then(({ data }) => setBlockedUsers(data.blockedUsers));
    }
  }, [open, tab]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch("/users/me", { name, bio, statusMessage, privacy });
      setUser(data.user);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
    if (file.size > 5 * 1024 * 1024) return alert("Profile picture must be under 5MB.");
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { data: updated } = await api.patch("/users/me", { avatar: data.path || data.url });
      setUser(updated.user);
    } catch {
      alert("Failed to upload profile picture. Please try again.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const unblock = async (id) => {
    await api.post(`/users/${id}/unblock`);
    setBlockedUsers((prev) => prev.filter((u) => u._id !== id));
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex gap-2 mb-5 relative border-b border-white/5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-3 py-2 text-sm capitalize transition-colors flex-shrink-0 ${
              tab === t ? "text-ember" : "text-muted hover:text-ink"
            }`}
          >
            {t}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ember rounded-full" />}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-4">
          <div className="flex flex-col items-center">
            <label className="relative cursor-pointer group">
              <Avatar name={user?.name} src={user?.avatar} size={72} />
              <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={20} className="text-white" />
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} disabled={avatarUploading} />
            </label>
            {avatarUploading && <p className="text-xs text-muted mt-1">Uploading…</p>}
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-xl px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Username</label>
            <input
              disabled
              value={`@${user?.username}`}
              className="w-full bg-chat/50 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-muted"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 160))}
              rows={2}
              placeholder="Tell people a little about yourself"
              className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-xl px-4 py-2.5 text-sm resize-none"
            />
            <p className="text-[10px] text-muted text-right mt-0.5">{bio.length}/160</p>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Status</label>
            <input
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value.slice(0, 60))}
              placeholder="Available, Busy, Studying…"
              className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-xl px-4 py-2.5 text-sm"
            />
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-ember text-bg font-medium rounded-full py-2.5 hover:brightness-110 transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {tab === "privacy" && (
        <div className="space-y-4">
          {PRIVACY_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between">
              <span className="text-sm">{f.label}</span>
              <select
                value={privacy[f.key]}
                onChange={(e) => setPrivacy((p) => ({ ...p, [f.key]: e.target.value }))}
                className="bg-chat border border-white/5 rounded-lg px-2 py-1.5 text-xs outline-none"
              >
                <option value="everyone">Everyone</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
          ))}
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-ember text-bg font-medium rounded-full py-2.5 hover:brightness-110 transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {tab === "blocked" && (
        <div className="space-y-1">
          {blockedUsers.length === 0 && <p className="text-sm text-muted px-1">No blocked users.</p>}
          {blockedUsers.map((u) => (
            <div key={u._id} className="flex items-center gap-3 py-2">
              <Avatar name={u.name} src={u.avatar} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{u.name}</p>
                <p className="text-xs text-muted truncate">@{u.username}</p>
              </div>
              <button onClick={() => unblock(u._id)} className="text-xs text-ember hover:brightness-110">
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "appearance" && <ThemeSelector />}
    </Modal>
  );
};

export default SettingsModal;
