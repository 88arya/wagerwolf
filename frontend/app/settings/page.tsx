"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.push("/"); return; }
    const dn = localStorage.getItem("displayName") ?? "";
    setDisplayName(dn);
    setInput(dn);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess(false);
    if (!input.trim()) { setError("Display name cannot be empty"); return; }
    setSaving(true);
    try {
      const user = await api("/users/me", { method: "PATCH", body: JSON.stringify({ displayName: input.trim() }) });
      localStorage.setItem("displayName", user.displayName);
      setDisplayName(user.displayName);
      setSuccess(true);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setSaving(false);
    }
  }

  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href="/leagues">‹ Leagues</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20 }}>
          <h1>Settings</h1>
          <p className="subtitle">Manage your account</p>
        </div>

        {/* Avatar */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
          <div style={{
            width: 68, height: 68, borderRadius: "50%",
            background: "var(--accent-dim)",
            border: "2.5px solid rgba(56,189,248,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.4rem", fontWeight: 900, color: "var(--accent)",
          }}>
            {initials || "??"}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
            Display Name
          </div>
          <form className="form" onSubmit={save}>
            <input
              value={input}
              onChange={(e) => { setInput(e.target.value); setSuccess(false); setError(""); }}
              maxLength={32}
              required
            />
            {error && <p className="error">{error}</p>}
            {success && (
              <div style={{
                background: "var(--win-bg)", border: "1px solid var(--win-border)",
                borderRadius: 8, padding: "10px 14px", color: "var(--win)",
                fontSize: "0.82rem", fontWeight: 600,
              }}>
                ✓ Display name updated
              </div>
            )}
            <button type="submit" disabled={saving || input.trim() === displayName} style={{ width: "100%" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </div>

        <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button
            className="ghost"
            style={{ width: "100%", fontSize: "0.85rem", padding: "12px", color: "var(--loss)", borderColor: "var(--loss-border)" }}
            onClick={() => { localStorage.clear(); router.push("/"); }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
