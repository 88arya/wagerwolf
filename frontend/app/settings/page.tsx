"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
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
      <nav className="nav" style={{ padding: "0 24px", background: "var(--bg)" }}>
        <Link href="/leagues" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <Logo size={28} />
        </Link>
        <div style={{ marginLeft: "auto" }}>
          <Link href="/leagues" style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-2)" }}>‹ Leagues</Link>
        </div>
      </nav>

      <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

        <div style={{ width: "100%", maxWidth: 480, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>Account Settings</div>
        </div>

        <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Account card */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Profile</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "var(--surface-3)", border: "1px solid var(--border-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.85rem", fontWeight: 800, color: "var(--text-2)", flexShrink: 0,
                }}>
                  {initials || "??"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName || "—"}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 1 }}>Default name across all leagues</div>
                </div>
              </div>

              <form className="form" onSubmit={save}>
                <div>
                  <div className="label">Display Name</div>
                  <input
                    value={input}
                    onChange={(e) => { setInput(e.target.value); setSuccess(false); setError(""); }}
                    maxLength={32}
                    required
                  />
                </div>
                {error && <p className="error">{error}</p>}
                {success && (
                  <div style={{
                    background: "var(--win-bg)", border: "1px solid var(--win-border)",
                    borderRadius: "var(--radius-sm)", padding: "8px 12px", color: "var(--win)",
                    fontSize: "0.78rem", fontWeight: 600,
                  }}>
                    ✓ Display name updated
                  </div>
                )}
                <button type="submit" disabled={saving || input.trim() === displayName} style={{ padding: "9px", fontSize: "0.82rem", fontWeight: 700 }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </form>
            </div>
          </div>

          {/* Sign out */}
          <div className="card" style={{ padding: 14 }}>
            <button
              type="button"
              onClick={() => { localStorage.clear(); router.push("/"); }}
              style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", fontWeight: 700, background: "none", border: "1px solid var(--loss-border)", color: "var(--loss)", cursor: "pointer", boxShadow: "none" }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
