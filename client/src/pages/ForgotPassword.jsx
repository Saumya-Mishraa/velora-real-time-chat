import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api.js";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setSent(true);
      if (data.resetToken) setDevToken(data.resetToken);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold mb-1 text-center">Reset your password</h1>
        <p className="text-muted text-sm text-center mb-8">
          Enter your email and we'll help you get back in.
        </p>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-ink">
              If that email exists, a reset link has been generated.
            </p>
            {devToken && (
              <div className="bg-sidebar border border-white/5 rounded-xl p-4 text-left">
                <p className="text-xs text-muted mb-2">
                  No email service is configured in this environment, so here's the reset token directly:
                </p>
                <Link to={`/reset-password?token=${devToken}`} className="text-ember text-sm break-all hover:brightness-110">
                  Continue to reset password →
                </Link>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              required
              className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ember text-bg font-medium rounded-xl py-3 hover:brightness-110 transition disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
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

export default ForgotPassword;
