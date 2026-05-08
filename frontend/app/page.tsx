"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", displayName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = mode === "register"
        ? await api("/users", { method: "POST", body: JSON.stringify(form) })
        : await api("/users/login", { method: "POST", body: JSON.stringify({ email: form.email, password: form.password }) });

      localStorage.setItem("token", res.token);
      localStorage.setItem("userId", res.userId);
      localStorage.setItem("displayName", res.displayName);
      localStorage.setItem("isAdmin", String(res.isAdmin));
      router.push(res.isAdmin ? "/admin" : "/leagues");
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "var(--bg)" }}>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontSize: "2.6rem", fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 6, color: "var(--text)" }}>
          PLAY<span style={{ color: "var(--accent)" }}>BOOK</span>
        </div>
        <div style={{ color: "var(--text-3)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          NFL Prop Betting League
        </div>
      </div>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "28px 24px" }}>

          {/* Mode toggle */}
          <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 6, padding: 3, marginBottom: 22, border: "1px solid var(--border)" }}>
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: "8px 0",
                  background: mode === m ? "var(--surface)" : "transparent",
                  color: mode === m ? "var(--text)" : "var(--text-2)",
                  border: mode === m ? "1px solid var(--border)" : "1px solid transparent",
                  borderRadius: 5,
                  fontWeight: mode === m ? 700 : 500,
                  fontSize: "0.85rem",
                  boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  letterSpacing: "0.01em",
                }}
              >
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form className="form" onSubmit={handleSubmit}>
            {mode === "register" && (
              <>
                <div>
                  <div className="label">Full Name</div>
                  <input placeholder="John Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <div className="label">Display Name</div>
                  <input placeholder="BigBaller23" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
                </div>
              </>
            )}
            <div>
              <div className="label">Email</div>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <div className="label">Password</div>
              <input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading} style={{ marginTop: 6, width: "100%", padding: "14px", fontSize: "0.95rem" }}>
              {loading ? "…" : mode === "register" ? "Create Account" : "Log In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
