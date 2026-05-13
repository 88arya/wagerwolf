"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--navy)",
    }}>
      {/* Top band */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px 28px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            fontSize: "3rem",
            fontWeight: 900,
            letterSpacing: "0.06em",
            color: "#FFFFFF",
            lineHeight: 1,
            marginBottom: 10,
          }}>
            PLAY<span style={{ color: "var(--gold)" }}>BOOK</span>
          </div>
          <div style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}>
            NFL Prop Betting League
          </div>
        </div>

        {/* Card */}
        <div style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
        }}>
          {/* Mode toggle */}
          <div style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
          }}>
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1,
                  padding: "15px 0",
                  background: "transparent",
                  color: mode === m ? "var(--accent)" : "var(--text-3)",
                  border: "none",
                  borderBottom: mode === m ? "2px solid var(--accent)" : "2px solid transparent",
                  borderRadius: 0,
                  fontWeight: mode === m ? 800 : 600,
                  fontSize: "0.88rem",
                  letterSpacing: "0.02em",
                  marginBottom: -1,
                  transition: "all 0.15s",
                }}
              >
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          <div style={{ padding: "28px 24px" }}>
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
              <button type="submit" disabled={loading} style={{ marginTop: 4, width: "100%", padding: "14px", fontSize: "0.95rem" }}>
                {loading ? "…" : mode === "register" ? "Create Account" : "Log In"}
              </button>
              {mode === "login" && (
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <Link href="/forgot-password" style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                    Forgot password?
                  </Link>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "16px 0 24px", color: "rgba(255,255,255,0.2)", fontSize: "0.72rem", letterSpacing: "0.06em" }}>
        PLAYBOOK · NFL FANTASY
      </div>
    </div>
  );
}
