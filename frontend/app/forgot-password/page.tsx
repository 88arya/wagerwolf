"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/users/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSubmitted(true);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ height: 3, background: "linear-gradient(90deg, var(--accent-muted), var(--accent), var(--accent-hover))" }} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px 28px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: "2.6rem", fontWeight: 900, letterSpacing: "0.08em", color: "var(--text)", lineHeight: 1, marginBottom: 10, textTransform: "uppercase" }}>
            PLAY<span style={{ color: "var(--accent)" }}>BOOK</span>
          </div>
          <div style={{ color: "var(--text-3)", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase" }}>
            NFL Prop Betting · Friend Leagues
          </div>
        </div>

        <div style={{ width: "100%", maxWidth: 400, background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-2)", overflow: "hidden" }}>
          <div style={{ padding: "24px 22px" }}>
            {submitted ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2.2rem", marginBottom: 14 }}>📧</div>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", marginBottom: 8 }}>Check your email</div>
                <div style={{ color: "var(--text-3)", fontSize: "0.82rem", lineHeight: 1.6, marginBottom: 20 }}>
                  If an account exists for <strong style={{ color: "var(--text-2)" }}>{email}</strong>, we sent a reset link. Check your spam folder if you don't see it.
                </div>
                <Link href="/">
                  <button style={{ width: "100%" }}>Back to Login</button>
                </Link>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", marginBottom: 4 }}>Reset Password</div>
                <div style={{ color: "var(--text-3)", fontSize: "0.78rem", marginBottom: 20, lineHeight: 1.5 }}>
                  Enter your email and we'll send you a reset link.
                </div>
                <form className="form" onSubmit={handleSubmit}>
                  <div>
                    <div className="label">Email</div>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  {error && <p className="error">{error}</p>}
                  <button type="submit" disabled={loading} style={{ width: "100%" }}>
                    {loading ? "Sending…" : "Send Reset Link"}
                  </button>
                </form>
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <Link href="/" style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>← Back to Login</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "14px 0 24px", color: "var(--text-4)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Playbook · NFL Fantasy · Fake Money, Real Fun
      </div>
    </div>
  );
}
