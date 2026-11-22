import React from "react";
import { Check, Circle } from "lucide-react";

// Live ticking checklist used by Register and ResetPassword.
const ValidationChecklist = ({ items, className = "" }) => (
  <ul className={`space-y-1 ${className}`} aria-label="Requirements">
    {items.map((item) => (
      <li
        key={item.id}
        className={`flex items-center gap-1.5 text-xs transition-colors ${item.ok ? "text-online" : "text-muted"}`}
      >
        {item.ok ? <Check size={13} aria-hidden="true" /> : <Circle size={11} aria-hidden="true" className="ml-px mr-px" />}
        <span>{item.label}</span>
        <span className="sr-only">{item.ok ? "(done)" : "(not done yet)"}</span>
      </li>
    ))}
  </ul>
);

export default ValidationChecklist;
