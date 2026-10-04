import React, { useState } from "react";
import Modal from "./Modal.jsx";
import Avatar from "./Avatar.jsx";
import api from "../services/api.js";

const NewChatModal = ({ open, onClose, onCreated }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const search = async (q) => {
    setQuery(q);
    if (!q.trim()) return setResults([]);
    setSearching(true);
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setResults(data.users);
    } finally {
      setSearching(false);
    }
  };

  const startChat = async (userId) => {
    const { data } = await api.post("/conversations/private", { userId });
    onCreated(data.conversation);
    setQuery("");
    setResults([]);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New conversation">
      <input
        autoFocus
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search by name, username or email"
        className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-full px-4 py-2.5 text-sm placeholder:text-muted mb-3"
      />
      <div className="max-h-72 overflow-y-auto space-y-1">
        {searching && <p className="text-sm text-muted px-2">Searching…</p>}
        {!searching && query && results.length === 0 && (
          <p className="text-sm text-muted px-2">No people found.</p>
        )}
        {results.map((u) => (
          <button
            key={u.id}
            onClick={() => startChat(u.id)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors text-left"
          >
            <Avatar name={u.name} src={u.avatar} size={36} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{u.name}</p>
              <p className="text-xs text-muted truncate">@{u.username}</p>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
};

export default NewChatModal;
