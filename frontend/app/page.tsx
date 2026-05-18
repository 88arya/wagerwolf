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
    if (mode === "register" && (form.displayName.trim().length < 3 || form.displayName.trim().length > 20)) {
      setError("Display name must be 3–20 letters.");
      return;
    }
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
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
    }}>
      {/* Top accent bar */}
      <div style={{ height: 3, background: "linear-gradient(90deg, var(--accent-muted), var(--accent), var(--accent-hover))" }} />

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px 28px",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            fontSize: "2.6rem",
            fontWeight: 900,
            letterSpacing: "0.08em",
            color: "var(--text)",
            lineHeight: 1,
            marginBottom: 10,
            textTransform: "uppercase",
          }}>
            PLAY<span style={{ color: "var(--accent)" }}>BOOK</span>
          </div>
          <div style={{
            color: "var(--text-3)",
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}>
            NFL Prop Betting · Friend Leagues
          </div>
        </div>

        {/* Card */}
        <div style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-2)",
          overflow: "hidden",
        }}>
          {/* Mode toggle */}
          <div style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}>
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1,
                  padding: "14px 0",
                  background: "transparent",
                  color: mode === m ? "var(--accent)" : "var(--text-3)",
                  border: "none",
                  borderBottom: mode === m ? "2px solid var(--accent)" : "2px solid transparent",
                  borderRadius: 0,
                  fontWeight: mode === m ? 800 : 500,
                  fontSize: "0.85rem",
                  letterSpacing: "0.02em",
                  marginBottom: -1,
                  transition: "all 0.15s",
                  cursor: "pointer",
                }}
              >
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          <div style={{ padding: "24px 22px" }}>
            <form className="form" onSubmit={handleSubmit}>
              {mode === "register" && (
                <>
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
                </>
              )}
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
              <button
                type="submit"
                disabled={loading}
                style={{ width: "100%", padding: "13px", fontSize: "0.92rem", fontWeight: 800, marginTop: 4 }}
              >
                {loading ? "Please wait…" : mode === "register" ? "Create Account" : "Log In"}
              </button>
              {mode === "login" && (
                <div style={{ textAlign: "center", marginTop: 4 }}>
                  <Link href="/forgot-password" style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                    Forgot password?
                  </Link>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "14px 0 24px", color: "var(--text-4)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Playbook · NFL Fantasy · Fake Money, Real Fun
      </div>
    </div>
  );
}
