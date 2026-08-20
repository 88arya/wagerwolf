"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";
import { ACCENT } from "@/lib/constants";

/**
 * One-time name and age capture, sat between Google sign-in and /home.
 *
 * Google supplies given_name and family_name for most accounts, so the name
 * fields usually arrive pre-filled and are a confirmation rather than data
 * entry. It supplies nothing for the birthdate — Google will not hand over a
 * birthday without a scope the app does not ask for, and a self-attested date
 * is what the gate wants anyway.
 *
 * Reached whenever firstName, lastName *or* dateOfBirth is missing; anyone with
 * all three is redirected straight through, which is what stops it reappearing
 * on every login. Accounts that predate the age gate have no birthdate, so they
 * come back through here once.
 *
 * THE CLIENT-SIDE AGE CHECK BELOW IS A COURTESY, NOT THE GATE. It exists so the
 * refusal is immediate and legible instead of a round trip. The real one is
 * `checkDateOfBirth` in the backend's services/age.ts, which also owns the
 * minimum and rejects impossible dates. Never move the decision here.
 */

/** Mirrors MIN_AGE in the backend's services/age.ts, which is authoritative. */
const MIN_AGE = 18;

/** Whole years between a "YYYY-MM-DD" birthdate and today, in UTC. */
function ageFrom(dob: string): number {
  const [y, m, d] = dob.split("-").map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const md = now.getUTCMonth() + 1 - m;
  if (md < 0 || (md === 0 && now.getUTCDate() < d)) age -= 1;
  return age;
}
export default function OnboardingPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/"); return; }
    api("/users/me")
      .then((u: any) => {
        if (u.firstName && u.lastName && u.dateOfBirth) { router.replace("/home"); return; }
        setFirstName(u.firstName || "");
        setLastName(u.lastName || "");
        setDob(u.dateOfBirth || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { setError("Both names are required."); return; }
    if (!dob) { setError("Your date of birth is required."); return; }
    if (ageFrom(dob) < MIN_AGE) { setError(`You must be ${MIN_AGE} or over to use Wagerwolf.`); return; }
    setSaving(true);
    setError("");
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: dob }),
      });
      router.replace("/home");
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
          A couple of details
        </h1>
        <p style={{ textAlign: "center", color: "var(--text-2)", fontSize: "0.85rem", margin: "8px 0 24px" }}>
          Your name is how you&rsquo;ll appear to the rest of your league.
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

          <div>
            <label className="label" htmlFor="dob">Date of birth</label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              autoComplete="bday"
              // Caps the picker at today so a future date cannot be chosen at
              // all. The backend rejects one anyway; this stops the trip.
              max={new Date().toISOString().slice(0, 10)}
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
