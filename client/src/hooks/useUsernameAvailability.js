import { useEffect, useState } from "react";
import api from "../services/api.js";
import { validateUsername } from "../utils/validators.js";

// Debounced "available / taken" hint for the Register form.
// status: "idle" | "checking" | "available" | "taken" | "error"
export default function useUsernameAvailability(username, delay = 450) {
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const check = validateUsername(username);
    if (!username || !check.ok) {
      setStatus("idle");
      return undefined;
    }
    setStatus("checking");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/auth/check-username", { params: { u: check.value }, signal: controller.signal });
        setStatus(data.available ? "available" : "taken");
      } catch (err) {
        if (err?.code !== "ERR_CANCELED") setStatus("error"); // hint only: never blocks signup
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [username, delay]);

  return status;
}
