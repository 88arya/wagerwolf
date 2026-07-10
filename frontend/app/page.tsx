"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "@/lib/api";
import { ACCENT } from "@/lib/constants";
const NAV_H = 56;

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
  const [modal, setModal] = useState(false);
  const [modalError, setModalError] = useState("");

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

  function openModal() {
    setModalError("");
    setModal(true);
  }

  async function handleGoogleSuccess(credentialResponse: any) {
    setModalError("");
    try {
      const res = await api("/users/auth/google", { method: "POST", body: JSON.stringify({ credential: credentialResponse.credential }) });
      localStorage.setItem("token", res.token);
      localStorage.setItem("userId", res.userId);
      localStorage.setItem("displayName", res.displayName);
      setIsLoggedIn(true);
      setDisplayName(res.displayName || "");
      setModal(false);
      router.push("/leagues");
    } catch (err: any) {
      try { setModalError(JSON.parse(err.message).error); } catch { setModalError(err.message); }
    }
  }

  const initials = displayName
    ? displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>

      {/* ── Navbar ── */}
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: NAV_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => router.push("/")}
        >
          <img src="/grH9m01.svg" alt="FanMark" style={{ height: 26, width: 26, objectFit: "contain" }} />
          <span style={{ fontSize: "0.9rem", fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text)" }}>FANMARK</span>
        </div>

        {!isLoggedIn ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ghost" onClick={openModal} style={{ padding: "7px 16px", fontSize: "0.82rem" }}>Log In</button>
            <button type="button" onClick={openModal} style={{ padding: "7px 16px", fontSize: "0.82rem" }}>Sign Up</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              className="avatar"
              onClick={() => router.push("/settings")}
              style={{ cursor: "pointer", width: 30, height: 30, fontSize: "0.65rem" }}
            >
              {initials}
            </div>
            <span
              style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}
              onClick={() => router.push("/settings")}
            >
              {displayName}
            </span>
            <button type="button" className="ghost" onClick={logout} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>Log Out</button>
          </div>
        )}
      </nav>

      {/* ── Hero (fills remaining viewport) ── */}
      <div style={{
        height: `calc(100dvh - ${NAV_H}px)`,
        display: "flex",
        alignItems: "center",
        paddingLeft: 48,
        background: "var(--bg)",
        overflow: "hidden",
      }}>
        {/* Left — text + CTA, fixed width so image can't encroach */}
        <div style={{ flex: "0 0 400px", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
            <img
              src="/grH9m01.svg"
              alt="FanMark"
              style={{ height: "clamp(3rem, 8vw, 5.5rem)", width: "clamp(3rem, 8vw, 5.5rem)", objectFit: "contain", flexShrink: 0 }}
            />
            <div style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", fontWeight: 900, letterSpacing: "-0.04em", color: "var(--text)", lineHeight: 1 }}>
              FANMARK
            </div>
          </div>

          <p style={{ fontSize: "1rem", color: "var(--text-2)", lineHeight: 1.75, fontWeight: 500, maxWidth: 340, margin: "0 0 40px" }}>
            The new way to play Fantasy Football. Score points by hitting on your bets.
          </p>

          {!isLoggedIn ? (
            <button type="button" onClick={openModal} style={{ padding: "13px 36px", fontSize: "1rem", fontWeight: 700 }}>
              Play Now
            </button>
          ) : (
            <button type="button" onClick={() => router.push("/leagues")} style={{ padding: "13px 36px", fontSize: "1rem", fontWeight: 700 }}>
              My Leagues →
            </button>
          )}
        </div>

        {/* Right — device mockup, sized to full hero height */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
          <img
            src="/device-mockup.png"
            alt="FanMark app"
            style={{ height: "100%", width: "auto", objectFit: "contain", display: "block" }}
          />
        </div>

      </div>

      {/* ── How to Play ── */}
      <div style={{ background: "var(--surface-2)", borderTop: "1px solid var(--border)", padding: "60px 32px 80px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: ACCENT, marginBottom: 10 }}>
              How to Play
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              Fantasy football format,<br />NFL sportsbook scoring.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {STEPS.map(step => (
              <div key={step.n} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>
                    {step.title}
                  </span>
                  <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", color: ACCENT }}>
                    {step.n}
                  </span>
                </div>
                <div style={{ padding: "14px 16px 18px", fontSize: "0.8rem", color: "var(--text-2)", lineHeight: 1.68 }}>
                  {step.desc}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Auth Modal ── */}
      {modal && (
        <div
          onClick={() => setModal(false)}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 360, background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-2)", overflow: "hidden", position: "relative" }}
          >
            <button
              onClick={() => setModal(false)}
              style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "var(--text-3)", lineHeight: 1, padding: 4 }}
            >✕</button>
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
