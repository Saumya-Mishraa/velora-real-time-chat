import React, { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import Avatar from "./Avatar.jsx";
import api from "../services/api.js";

const formatDateTime = (date) =>
  date
    ? new Date(date).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const MessageInfoModal = ({ messageId, sentAt, onClose }) => {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!messageId) return;
    setLoading(true);
    setError("");
    api
      .get(`/messages/single/${messageId}/info`)
      .then(({ data }) => setInfo(data))
      .catch((err) => setError(err?.response?.data?.message || "Failed to load message info."))
      .finally(() => setLoading(false));
  }, [messageId]);

  return (
    <Modal open={!!messageId} onClose={onClose} title="Message info">
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Sent</span>
            <span>{formatDateTime(sentAt || info?.sentAt)}</span>
          </div>

          {info?.isGroup ? (
            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-2">
                Seen by ({info.seenBy.length})
              </p>
              {info.seenBy.length === 0 && <p className="text-sm text-muted">No one yet.</p>}
              {info.seenBy.map((u) => (
                <div key={u._id} className="flex items-center gap-2 py-1.5">
                  <Avatar name={u.name} src={u.avatar} size={26} />
                  <span className="text-sm">{u.name}</span>
                </div>
              ))}
              <p className="text-xs text-muted uppercase tracking-wide mb-2 mt-4">
                Delivered ({info.deliveredTo.length})
              </p>
              {info.deliveredTo.length === 0 && <p className="text-sm text-muted">No one yet.</p>}
              {info.deliveredTo.map((u) => (
                <div key={u._id} className="flex items-center gap-2 py-1.5">
                  <Avatar name={u.name} src={u.avatar} size={26} />
                  <span className="text-sm">{u.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Delivered</span>
                <span>
                  {info.deliveredTo.length > 0 || info.seenBy.length > 0
                    ? "Delivered"
                    : "Not yet delivered"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Seen</span>
                <span>{info.seenBy.length > 0 ? "Seen" : "Not yet seen"}</span>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default MessageInfoModal;
