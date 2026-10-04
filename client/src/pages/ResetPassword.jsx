import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api.js";

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold mb-1 text-center">Set a new password</h1>
        <p className="text-muted text-sm text-center mb-8">Choose a strong new password for your account.</p>

        {done ? (
          <p className="text-online text-center text-sm">Password updated. Redirecting to login…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Reset token"
              required
              className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              required
              className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              required
              className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ember text-bg font-medium rounded-xl py-3 hover:brightness-110 transition disabled:opacity-50"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        <p className="text-sm text-muted text-center mt-6">
          <Link to="/login" className="text-ember hover:brightness-110">
            Back to login
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
