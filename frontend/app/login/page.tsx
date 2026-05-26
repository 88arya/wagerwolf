"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api("/users/login", { method: "POST", body: JSON.stringify(form) });
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
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)", marginBottom: 20 }}>Log In</div>
            <form className="form" onSubmit={handleSubmit}>
              <div>
                <div className="label">Email</div>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div>
                <div className="label">Password</div>
                <input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              </div>
              {error && <p className="error">{error}</p>}
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                <button type="submit" disabled={loading} style={btnStyle}>
                  {loading ? "…" : "Log In"}
                </button>
              </div>
              <div style={{ textAlign: "center" }}>
                <Link href="/forgot-password" style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 700 }}>
                  Forgot password?
                </Link>
              </div>
            </form>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", padding: "14px 28px", background: "var(--surface-2)", textAlign: "center" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>No account? </span>
            <Link href="/register" style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent)" }}>Sign up</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
