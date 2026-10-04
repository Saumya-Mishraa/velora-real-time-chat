import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = typeof location.state?.from === "string" && location.state.from.startsWith("/app") ? location.state.from : "/app";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(identifier, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 rounded-xl bg-ember flex items-center justify-center font-display font-bold text-bg">
            V
          </div>
          <span className="font-display font-semibold text-lg">Velora</span>
        </div>

        <h1 className="font-display text-2xl font-semibold mb-1 text-center">Welcome back</h1>
        <p className="text-muted text-sm text-center mb-8">Log in to keep the conversation going.</p>

        <form onSubmit={submit} className="space-y-4">
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              {i === 0 ? (
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Email or username"
                  className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors"
                  required
                />
              ) : (
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              )}
            </motion.div>
          ))}

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted">
              <input type="checkbox" className="accent-ember" /> Remember me
            </label>
            <Link to="/forgot-password" className="text-ember hover:brightness-110">
              Forgot password?
            </Link>
          </div>

          {error && (
            <motion.p initial={{ x: -6 }} animate={{ x: [0, -6, 6, -4, 4, 0] }} className="text-red-400 text-sm">
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ember text-bg font-medium rounded-xl py-3 hover:brightness-110 transition disabled:opacity-50"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="text-sm text-muted text-center mt-6">
          Don't have an account?{" "}
          <Link to="/register" className="text-ember hover:brightness-110">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
