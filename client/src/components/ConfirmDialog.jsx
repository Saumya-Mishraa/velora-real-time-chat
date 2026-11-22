import React from "react";
import Modal from "./Modal.jsx";

// Themed replacement for window.confirm, with a busy state and an error line.
const ConfirmDialog = ({ open, title, message, confirmLabel = "Confirm", danger = false, busy = false, error = "", onConfirm, onClose }) => (
  <Modal open={open} onClose={busy ? () => {} : onClose} title={title}>
    <p className="text-sm text-muted leading-relaxed">{message}</p>
    {error && (
      <p role="alert" className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
        {error}
      </p>
    )}
    <div className="flex gap-2 mt-5">
      <button
        onClick={onClose}
        disabled={busy}
        className="flex-1 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={busy}
        className={`flex-1 min-h-[44px] rounded-xl text-sm font-medium disabled:opacity-60 ${
          danger ? "bg-red-500 text-white hover:bg-red-400" : "bg-ember text-bg hover:brightness-110"
        }`}
      >
        {busy ? "Please wait…" : confirmLabel}
      </button>
    </div>
  </Modal>
);

export default ConfirmDialog;
