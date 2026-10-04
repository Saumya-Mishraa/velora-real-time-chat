import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const strength = (pw) => {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0-4
};

const strengthLabel = ["Too short", "Weak", "Fair", "Good", "Strong"];
const strengthColor = [
  "rgb(var(--color-muted))",
  "rgb(var(--color-accent))",
  "rgb(var(--color-accent-2))",
  "rgb(var(--color-accent-3))",
  "rgb(var(--color-online))",
];

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = typeof location.state?.from === "string" && location.state.from.startsWith("/app") ? location.state.from : "/app";
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const score = strength(form.password);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await register(form);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: "name", placeholder: "Full name", type: "text" },
    { key: "username", placeholder: "Username", type: "text" },
    { key: "email", placeholder: "Email", type: "email" },
  ];

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 rounded-xl bg-ember flex items-center justify-center font-display font-bold text-bg">
            V
          </div>
          <span className="font-display font-semibold text-lg">Velora</span>
        </div>

        <h1 className="font-display text-2xl font-semibold mb-1 text-center">Create your account</h1>
        <p className="text-muted text-sm text-center mb-8">Join Velora and start real conversations.</p>

        <form onSubmit={submit} className="space-y-4">
          {fields.map((f, i) => (
            <motion.input
              key={f.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              type={f.type}
              value={form[f.key]}
              onChange={set(f.key)}
              placeholder={f.placeholder}
              required
              className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors"
            />
          ))}

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={set("password")}
              placeholder="Password"
              required
              className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </motion.div>

          {form.password && (
            <div>
              <div className="flex gap-1 mb-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{ background: i < score ? strengthColor[score] : "rgba(255,255,255,0.08)" }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted">{strengthLabel[score]}</p>
            </div>
          )}

          <motion.input
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            type={showPassword ? "text" : "password"}
            value={form.confirmPassword}
            onChange={set("confirmPassword")}
            placeholder="Confirm password"
            required
            className="w-full bg-sidebar border border-white/5 focus:border-ember/50 outline-none rounded-xl px-4 py-3 text-sm placeholder:text-muted transition-colors"
          />

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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-muted text-center mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-ember hover:brightness-110">
            Log in
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Register;
