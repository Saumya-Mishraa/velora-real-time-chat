import React, { useState } from "react";
import Modal from "./Modal.jsx";
import Avatar from "./Avatar.jsx";
import api from "../services/api.js";

const NewGroupModal = ({ open, onClose, onCreated }) => {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);

  const search = async (q) => {
    setQuery(q);
    if (!q.trim()) return setResults([]);
    const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
    setResults(data.users);
  };

  const toggle = (user) => {
    setSelected((prev) =>
      prev.find((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user]
    );
  };

  const create = async () => {
    if (!name.trim() || selected.length === 0) return;
    const { data } = await api.post("/conversations/group", {
      name,
      memberIds: selected.map((u) => u.id),
    });
    onCreated(data.conversation);
    setName("");
    setSelected([]);
    setResults([]);
    setQuery("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Create group">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name"
        className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-full px-4 py-2.5 text-sm placeholder:text-muted mb-3"
      />

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map((u) => (
            <span
              key={u.id}
              onClick={() => toggle(u)}
              className="text-xs bg-ember/15 text-ember px-3 py-1 rounded-full cursor-pointer"
            >
              {u.name} ✕
            </span>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Add members"
        className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-full px-4 py-2.5 text-sm placeholder:text-muted mb-3"
      />

      <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
        {results.map((u) => (
          <button
            key={u.id}
            onClick={() => toggle(u)}
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors text-left ${
              selected.find((s) => s.id === u.id) ? "bg-ember/10" : "hover:bg-white/5"
            }`}
          >
            <Avatar name={u.name} src={u.avatar} size={32} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{u.name}</p>
              <p className="text-xs text-muted truncate">@{u.username}</p>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={create}
        disabled={!name.trim() || selected.length === 0}
        className="w-full bg-ember text-bg font-medium rounded-full py-2.5 disabled:opacity-40 hover:brightness-110 transition"
      >
        Create group
      </button>
    </Modal>
  );
};

export default NewGroupModal;
