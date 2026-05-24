"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      await api("/users/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "var(--loss)", fontWeight: 700, marginBottom: 16 }}>Invalid reset link.</div>
        <Link href="/forgot-password"><button style={{ width: "100%" }}>Request a new link</button></Link>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2.2rem", marginBottom: 14 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", marginBottom: 8 }}>Password reset!</div>
        <div style={{ color: "var(--text-3)", fontSize: "0.82rem", marginBottom: 20 }}>You can now sign in with your new password.</div>
        <Link href="/"><button style={{ width: "100%" }}>Sign In</button></Link>
      </div>
    );
  }

  return (
    <>
      <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", marginBottom: 4 }}>New Password</div>
      <div style={{ color: "var(--text-3)", fontSize: "0.78rem", marginBottom: 20 }}>Choose a new password for your account.</div>
      <form className="form" onSubmit={handleSubmit}>
        <div>
          <div className="label">New Password</div>
          <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div>
          <div className="label">Confirm Password</div>
          <input type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Resetting…" : "Reset Password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
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
            <Suspense fallback={<div style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>Loading…</div>}>
              <ResetForm />
            </Suspense>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "14px 0 24px", color: "var(--text-4)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Playbook · NFL Fantasy · Fake Money, Real Fun
      </div>
    </div>
  );
}
