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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--navy)", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: "0.06em", color: "#fff", marginBottom: 8 }}>
            PLAY<span style={{ color: "var(--gold)" }}>BOOK</span>
          </div>
        </div>

        <div style={{ background: "var(--surface)", borderRadius: 16, padding: "28px 24px", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
          {submitted ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>📧</div>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>Check your email</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.85rem", lineHeight: 1.6 }}>
                If an account exists for <strong style={{ color: "var(--text-2)" }}>{email}</strong>, we sent a reset link. Check your spam folder if you don't see it.
              </div>
              <Link href="/" style={{ display: "block", marginTop: 20 }}>
                <button style={{ width: "100%" }}>Back to Login</button>
              </Link>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)", marginBottom: 6 }}>Reset Password</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.82rem", marginBottom: 20, lineHeight: 1.5 }}>
                Enter your email and we'll send you a reset link.
              </div>
              <form className="form" onSubmit={handleSubmit}>
                <div>
                  <div className="label">Email</div>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="error">{error}</p>}
                <button type="submit" disabled={loading} style={{ width: "100%" }}>
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <Link href="/" style={{ fontSize: "0.82rem", color: "var(--text-3)" }}>← Back to Login</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
