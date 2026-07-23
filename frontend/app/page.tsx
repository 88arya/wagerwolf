"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "@/lib/api";

const STEPS = [
  { n: "01", title: "Join a League", desc: "Create a private league and invite friends, or drop into a public one. Leagues run the full NFL season." },
  { n: "02", title: "Get Your Weekly Budget", desc: "Each week your balance resets to the league allowance. That's your bankroll — bet it on any games that week." },
  { n: "03", title: "Bet Props & Game Lines", desc: "Pick player props (yards, TDs, receptions) or game lines (spread, total, moneyline). Set your stake and submit." },
  { n: "04", title: "Parlay for Bigger Payouts", desc: "Stack multiple bets into a parlay. All legs must hit, but the odds multiply — higher risk, higher reward." },
  { n: "05", title: "Head-to-Head Matchup", desc: "Each week you're paired against one opponent. Whoever profits more wins the matchup." },
  { n: "06", title: "Playoffs & Champion", desc: "Top records advance after the regular season. Win the bracket, win the league." },
];

export default function HomePage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authView, setAuthView] = useState<"signin" | "signup" | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setIsLoggedIn(true);
      setDisplayName(localStorage.getItem("displayName") || "");
    }
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("displayName");
    setIsLoggedIn(false);
    setDisplayName("");
  }

  async function handleGoogleSuccess(credentialResponse: any) {
    setAuthError("");
    try {
      const res = await api("/users/auth/google", { method: "POST", body: JSON.stringify({ credential: credentialResponse.credential }) });
      localStorage.setItem("token", res.token);
      localStorage.setItem("userId", res.userId);
      localStorage.setItem("displayName", res.displayName);
      setIsLoggedIn(true);
      setDisplayName(res.displayName || "");
      router.push("/leagues");
    } catch (err: any) {
      try { setAuthError(JSON.parse(err.message).error); } catch { setAuthError(err.message); }
    }
  }

  const initials = displayName
    ? displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

      {/* ── Left — brand + how to play ── */}
      <div style={{
        flex: "0 0 66%",
        minWidth: 0,
        background: "var(--surface)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "48px 56px",
        overflowY: "auto",
      }}>
        <div style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 14 }}>
          FANMARK
        </div>
        <p style={{ fontSize: "0.95rem", lineHeight: 1.7, fontWeight: 500, color: "var(--text-2)", maxWidth: 420, margin: "0 0 36px" }}>
          The new way to play Fantasy Football. Score points by hitting on your bets.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 640 }}>
          {STEPS.map(step => (
            <div key={step.n} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>
                  {step.title}
                </span>
                <span style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", color: "var(--text-3)" }}>
                  {step.n}
                </span>
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right — log in / play now ── */}
      <div style={{
        flex: "0 0 34%",
        minWidth: 0,
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}>
        <div style={{ width: 320, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <Logo size={72} />

          {!isLoggedIn ? (
            authView === null ? (
              <>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: 6 }}>
                    Ready to play?
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                    Bet with friends. Win your league.
                  </div>
                </div>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setAuthError(""); setAuthView("signup"); }}
                    style={{ width: "100%", padding: "12px", fontSize: "0.95rem", fontWeight: 700 }}
                  >
                    Play Now
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => { setAuthError(""); setAuthView("signin"); }}
                    style={{ width: "100%", padding: "12px", fontSize: "0.95rem" }}
                  >
                    Sign In
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: 6 }}>
                    {authView === "signup" ? "Create your account" : "Welcome back"}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                    {authView === "signup" ? "Sign up with Google to start your league." : "Sign in with Google to keep playing."}
                  </div>
                </div>
                {authError && <p className="error" style={{ width: "100%", textAlign: "center", margin: 0 }}>{authError}</p>}
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setAuthError("Google sign-in failed")}
                  width="304"
                  text={authView === "signup" ? "signup_with" : "signin_with"}
                />
                <button
                  type="button"
                  onClick={() => { setAuthError(""); setAuthView(null); }}
                  style={{ background: "none", border: "none", padding: 0, color: "var(--text-2)", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", boxShadow: "none" }}
                >
                  ← Back
                </button>
              </>
            )
          ) : (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: 6 }}>
                  Welcome back{displayName ? `, ${displayName}` : ""}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-2)" }}>
                  Pick up right where you left off.
                </div>
              </div>
              <button type="button" onClick={() => router.push("/leagues")} style={{ width: "100%", padding: "12px", fontSize: "0.95rem", fontWeight: 700 }}>
                My Leagues →
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  className="avatar"
                  onClick={() => router.push("/settings")}
                  style={{ cursor: "pointer", width: 30, height: 30, fontSize: "0.65rem" }}
                >
                  {initials}
                </div>
                <button type="button" className="ghost" onClick={logout} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>Log Out</button>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
