import React, { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import Modal from "./Modal.jsx";
import Avatar from "./Avatar.jsx";
import api from "../services/api.js";
import { errorMessage } from "../utils/media.js";

const toInputDate = (d) => {
  const date = d ? new Date(d) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Create / edit a Moment's details and who it's shared with.
const MomentForm = ({ open, moment, contacts, onClose, onSaved }) => {
  const editing = !!moment;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(toInputDate());
  const [members, setMembers] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(moment?.title || "");
    setDescription(moment?.description || "");
    setDate(toInputDate(moment?.date));
    setMembers(new Set((moment?.members || []).map((m) => m.id)));
    setError("");
  }, [open, moment]);

  const toggle = (id) =>
    setMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!title.trim()) return setError("Give your Moment a title.");
    setSaving(true);
    setError("");
    try {
      const body = { title: title.trim(), description: description.trim(), date, memberIds: Array.from(members) };
      const { data } = editing ? await api.patch(`/moments/${moment._id}`, body) : await api.post("/moments", body);
      onSaved(data.moment, !editing);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save this Moment."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title={editing ? "Edit Moment" : "New Moment"}>
      <label className="block text-xs uppercase tracking-wide text-muted mb-1.5" htmlFor="moment-title">Title</label>
      <input
        id="moment-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="Trip to Manali"
        className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-xl px-3.5 py-2.5 text-base sm:text-sm"
      />

      <label className="block text-xs uppercase tracking-wide text-muted mt-4 mb-1.5" htmlFor="moment-desc">Description</label>
      <textarea
        id="moment-desc"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="What's this one about?"
        className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-xl px-3.5 py-2.5 text-base sm:text-sm resize-none"
      />

      <label className="block text-xs uppercase tracking-wide text-muted mt-4 mb-1.5" htmlFor="moment-date">Date</label>
      <input
        id="moment-date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full bg-chat border border-white/5 focus:border-ember/40 outline-none rounded-xl px-3.5 py-2.5 text-base sm:text-sm [color-scheme:dark]"
      />

      <fieldset className="mt-4">
        <legend className="text-xs uppercase tracking-wide text-muted mb-1.5">
          Share with <span className="normal-case">(optional — they can view and add to it)</span>
        </legend>
        <div className="max-h-44 overflow-y-auto rounded-xl border border-white/5 bg-chat">
          {contacts.length === 0 ? (
            <p className="text-sm text-muted p-3">Start a chat with someone to share Moments with them.</p>
          ) : (
            contacts.map((c) => (
              <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer min-h-[48px]">
                <input type="checkbox" checked={members.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4 accent-[rgb(var(--color-accent))]" />
                <Avatar name={c.name} src={c.avatar} size={30} />
                <span className="text-sm truncate">{c.name}</span>
              </label>
            ))
          )}
        </div>
      </fieldset>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-3 py-2">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      <button
        onClick={save}
        disabled={saving || !title.trim()}
        className="mt-5 w-full min-h-[48px] rounded-xl bg-ember text-bg font-medium flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-40"
      >
        {saving && <Loader2 size={16} className="animate-spin" />}
        {editing ? "Save changes" : "Create Moment"}
      </button>
    </Modal>
  );
};

export default MomentForm;
