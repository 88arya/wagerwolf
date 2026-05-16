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
        <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>Password reset!</div>
        <div style={{ color: "var(--text-3)", fontSize: "0.85rem", marginBottom: 20 }}>You can now sign in with your new password.</div>
        <Link href="/"><button style={{ width: "100%" }}>Sign In</button></Link>
      </div>
    );
  }

  return (
    <>
      <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)", marginBottom: 6 }}>New Password</div>
      <div style={{ color: "var(--text-3)", fontSize: "0.82rem", marginBottom: 20 }}>Choose a new password for your account.</div>
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--navy)", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: "0.06em", color: "var(--text)", marginBottom: 8 }}>
            PLAY<span style={{ color: "var(--gold)" }}>BOOK</span>
          </div>
        </div>
        <div style={{ background: "var(--surface)", borderRadius: 16, padding: "28px 24px", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
          <Suspense fallback={<div style={{ color: "var(--text-3)" }}>Loading…</div>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
