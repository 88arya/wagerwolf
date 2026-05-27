"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "@/lib/api";

const btnStyle: React.CSSProperties = {
  borderRadius: 0,
  width: 183,
  height: 72,
  padding: 0,
  fontSize: "18px",
  fontWeight: 900,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  background: "#000000",
  color: "#ffffff",
  border: "none",
  cursor: "pointer",
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", name: "", displayName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogleSuccess(credentialResponse: any) {
    setError("");
    setLoading(true);
    try {
      const res = await api("/users/auth/google", {
        method: "POST",
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      localStorage.setItem("token", res.token);
      localStorage.setItem("userId", res.userId);
      localStorage.setItem("displayName", res.displayName);
      router.push("/leagues");
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.displayName.trim().length < 3 || form.displayName.trim().length > 20) {
      setError("Display name must be 3–20 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await api("/users", { method: "POST", body: JSON.stringify(form) });
      localStorage.setItem("token", res.token);
      localStorage.setItem("userId", res.userId);
      localStorage.setItem("displayName", res.displayName);
      router.push("/leagues");
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
      setLoading(false);
    }
  }

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: "auto", background: "var(--accent)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "32px 24px",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <div style={{ fontSize: "3rem", fontWeight: 900, letterSpacing: "0.08em", color: "#ffffff", lineHeight: 1, textTransform: "uppercase" }}>
            PLAYBOOK
          </div>
        </Link>

        <div style={{ width: 400, background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-2)", overflow: "hidden" }}>
          <div style={{ padding: "28px 28px 24px" }}>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)", marginBottom: 20 }}>Create Account</div>
            <form className="form" onSubmit={handleSubmit}>
              <div>
                <div className="label">Full Name</div>
                <input
                  placeholder="John Smith"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <div className="label">Display Name</div>
                <input
                  placeholder="BigBaller23"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value.replace(/[^A-Za-z ]/g, "").replace(/ {2,}/g, " ").slice(0, 20) })}
                  minLength={3}
                  maxLength={20}
                  required
                />
              </div>
              <div>
                <div className="label">Email</div>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <div className="label">Password</div>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              {error && <p className="error">{error}</p>}
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                <button type="submit" disabled={loading} style={btnStyle}>
                  {loading ? "…" : "Sign Up"}
                </button>
              </div>
            </form>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 4px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError("Google sign-in failed")} width="344" />
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", padding: "14px 28px", background: "var(--surface-2)", textAlign: "center" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>Already have an account? </span>
            <Link href="/login" style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent)" }}>Log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
