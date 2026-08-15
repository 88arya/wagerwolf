"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";
import { ACCENT } from "@/lib/constants";

/**
 * One-time name capture, sat between Google sign-in and /leagues.
 *
 * Google supplies given_name and family_name for most accounts, so the fields
 * usually arrive pre-filled and the step is a confirmation rather than data
 * entry. It is reached only when firstName or lastName is missing; anyone who
 * already has both is redirected straight through, which is what stops this
 * from reappearing on every login.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/"); return; }
    api("/users/me")
      .then((u: any) => {
        if (u.firstName && u.lastName) { router.replace("/leagues"); return; }
        setFirstName(u.firstName || "");
        setLastName(u.lastName || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { setError("Both names are required."); return; }
    setSaving(true);
    setError("");
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      router.replace("/leagues");
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
      setSaving(false);
    }
  }

  if (loading) return <div style={{ flex: 1, background: "var(--bg)" }} />;

  const field = {
    width: "100%",
    padding: "10px 12px",
    fontSize: "0.9rem",
    border: "1px solid var(--border-2)",
    borderRadius: "var(--radius)",
    background: "var(--surface)",
    color: "var(--text)",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ flex: 1, minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
          <Logo size={34} />
        </div>

        <h1 className="display" style={{ fontSize: "1.55rem", textAlign: "center", margin: 0 }}>
          What&rsquo;s your name?
        </h1>
        <p style={{ textAlign: "center", color: "var(--text-2)", fontSize: "0.85rem", margin: "8px 0 24px" }}>
          This is how you&rsquo;ll appear to the rest of your league.
        </p>

        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="label" htmlFor="firstName">First name</label>
            <input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              autoFocus
              style={field}
            />
          </div>
          <div>
            <label className="label" htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              style={field}
            />
          </div>

          {error && (
            <div style={{ color: "var(--loss)", fontSize: "0.8rem" }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: 6, padding: "11px 16px", background: ACCENT, color: "#FFFFFF",
              border: "none", borderRadius: "var(--radius)", fontSize: "0.88rem", fontWeight: 500,
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, boxShadow: "none",
            }}
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
