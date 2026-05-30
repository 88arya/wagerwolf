"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "@/lib/api";

const ACCENT = "#02D18A";

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
  const [modal, setModal] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("token")) setIsLoggedIn(true);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("displayName");
    setIsLoggedIn(false);
  }

  function openModal() {
    setModalError(""); setModalLoading(false);
    setModal(true);
  }

  async function handleGoogleSuccess(credentialResponse: any) {
    setModalError(""); setModalLoading(true);
    try {
      const res = await api("/users/auth/google", { method: "POST", body: JSON.stringify({ credential: credentialResponse.credential }) });
      localStorage.setItem("token", res.token);
      localStorage.setItem("userId", res.userId);
      localStorage.setItem("displayName", res.displayName);
      setIsLoggedIn(true);
      setModal(false);
      router.push("/leagues");
    } catch (err: any) {
      try { setModalError(JSON.parse(err.message).error); } catch { setModalError(err.message); }
      setModalLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>

      {/* ── Hero ── */}
      <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 32px 72px", background: "var(--bg)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", width: "100%" }}>
        <div style={{ maxWidth: 560 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
            <img src="/grH9m01.svg" alt="FanMark" style={{ height: "clamp(3rem, 8vw, 5.5rem)", width: "clamp(3rem, 8vw, 5.5rem)", objectFit: "contain", flexShrink: 0, objectFit: "contain" }} />
            <div style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", fontWeight: 900, letterSpacing: "-0.04em", color: "var(--text)", lineHeight: 1 }}>
              FANMARK
            </div>
          </div>

          <p style={{ fontSize: "1rem", color: "var(--text-2)", lineHeight: 1.75, fontWeight: 500, maxWidth: 420, margin: "0 0 40px" }}>
The new way to play Fantasy Football. Score points by hitting on your bets.
          </p>

          {!isLoggedIn ? (
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button type="button" onClick={openModal}
                style={{ padding: "11px 32px", fontSize: "0.92rem", fontWeight: 600 }}>
                Log In
              </button>
              <button type="button" onClick={openModal}
                style={{ padding: "11px 32px", fontSize: "0.92rem", fontWeight: 700 }}>
                Sign Up
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button type="button" onClick={() => router.push("/leagues")}
                style={{ padding: "11px 32px", fontSize: "0.92rem", fontWeight: 700 }}>
                My Leagues →
              </button>
              <button type="button" onClick={logout} className="ghost"
                style={{ padding: "11px 32px", fontSize: "0.92rem", fontWeight: 600 }}>
                Log Out
              </button>
            </div>
          )}

        </div>
        </div>
      </div>

      {/* ── How to Play ── */}
      <div style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "60px 32px 80px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>

          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: ACCENT, marginBottom: 10 }}>
              How to Play
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              Fantasy football format,<br />NFL sportsbook scoring.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {STEPS.map(step => (
              <div key={step.n} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 20px 24px" }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 900, color: ACCENT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 14 }}>
                  {step.n}
                </div>
                <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--text)", marginBottom: 8, lineHeight: 1.3 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-2)", lineHeight: 1.68, fontWeight: 500 }}>
                  {step.desc}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Auth Modal ── */}
      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 360, background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-2)", overflow: "hidden", position: "relative" }}>
            <button onClick={() => setModal(false)} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "var(--text-3)", lineHeight: 1, padding: 4 }}>✕</button>
            <div style={{ padding: "36px 28px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <img src="/grH9m01.svg" alt="FanMark" style={{ width: 64, height: 64, objectFit: "contain" }} />
              {modalError && <p className="error" style={{ width: "100%", textAlign: "center", margin: 0 }}>{modalError}</p>}
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setModalError("Google sign-in failed")} width="304" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
