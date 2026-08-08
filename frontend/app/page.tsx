"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import LogoWordmark from "@/components/LogoWordmark";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "@/lib/api";

const STEPS = [
  { n: "01", title: "Join a league", desc: "Create a private league and invite friends, or drop into a public one. Leagues run the full NFL season." },
  { n: "02", title: "Get your weekly budget", desc: "Each week your balance resets to the league allowance. That's your bankroll — bet it on any games that week." },
  { n: "03", title: "Bet props & game lines", desc: "Pick player props (yards, TDs, receptions) or game lines (spread, total, moneyline). Set your stake and submit." },
  { n: "04", title: "Parlay for bigger payouts", desc: "Stack multiple bets into a parlay. All legs must hit, but the odds multiply — higher risk, higher reward." },
  { n: "05", title: "Head-to-head matchup", desc: "Each week you're paired against one opponent. Whoever profits more wins the matchup." },
  { n: "06", title: "Playoffs & champion", desc: "Top records advance after the regular season. Win the bracket, win the league." },
];

const FACTS = [
  { k: "Stat markets", v: "22" },
  { k: "NFL weeks", v: "17" },
  { k: "Real money at risk", v: "$0" },
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

  const PAD = "0 max(24px, calc((100% - 1120px) / 2))";

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--bg)" }}>

      {/* ── Header ── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          height: 60,
          display: "flex",
          alignItems: "center",
          padding: PAD,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginRight: "auto" }}>
          <Logo size={24} />
          <span style={{ fontSize: "1.05rem", fontWeight: 500, letterSpacing: "-0.03em" }}>Wager</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a
            href="/how-to-play"
            style={{ fontSize: "0.85rem", fontWeight: 450, color: "var(--text-2)", padding: "6px 12px" }}
          >
            How to play
          </a>
          {isLoggedIn ? (
            <button type="button" className="dark" onClick={() => router.push("/leagues")}>
              My leagues
            </button>
          ) : (
            <>
              <button
                type="button"
                className="ghost"
                onClick={() => { setAuthError(""); setAuthView("signin"); }}
              >
                Sign in
              </button>
              <button type="button" onClick={() => { setAuthError(""); setAuthView("signup"); }}>
                Get started
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="dot-grid"
        style={{ padding: PAD, borderBottom: "1px solid var(--border)" }}
      >
        <div style={{ padding: "88px 0 96px", maxWidth: 900 }}>

          {/* Eyebrow + data chip, Ramp-style */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26, flexWrap: "wrap" }}>
            <span className="eyebrow">Fantasy football, scored like a sportsbook</span>
            <span
              style={{
                fontSize: "0.65rem",
                fontWeight: 450,
                letterSpacing: "0.02em",
                color: "var(--text)",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                padding: "2px 7px",
              }}
            >
              2026 season
            </span>
          </div>

          <h1 className="display" style={{ marginBottom: 22, maxWidth: 760 }}>
            Draft nothing.
            <br />
            Bet everything.
          </h1>

          <p className="lede" style={{ maxWidth: 460, marginBottom: 36 }}>
            Props, spreads, parlays — head-to-head, every week.{" "}
            <span style={{ color: "var(--text)", borderBottom: "1px solid var(--border-3)" }}>Fake money</span>, real NFL.
          </p>

          {/* CTA */}
          {!isLoggedIn ? (
            authView === null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => { setAuthError(""); setAuthView("signup"); }}
                  style={{ padding: "12px 26px", fontSize: "0.95rem" }}
                >
                  Start a league
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => { setAuthError(""); setAuthView("signin"); }}
                  style={{ padding: "12px 26px", fontSize: "0.95rem" }}
                >
                  Sign in
                </button>
              </div>
            ) : (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-2)",
                  borderRadius: "var(--radius-lg)",
                  padding: 22,
                  maxWidth: 380,
                }}
              >
                <div style={{ fontSize: "1.05rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: 4 }}>
                  {authView === "signup" ? "Create your account" : "Welcome back"}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-2)", marginBottom: 18 }}>
                  {authView === "signup" ? "Sign up with Google to start your league." : "Sign in with Google to keep playing."}
                </div>
                {authError && <p className="error" style={{ marginBottom: 12 }}>{authError}</p>}
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setAuthError("Google sign-in failed")}
                  width="334"
                  text={authView === "signup" ? "signup_with" : "signin_with"}
                />
                <button
                  type="button"
                  onClick={() => { setAuthError(""); setAuthView(null); }}
                  style={{
                    background: "none", border: "none", padding: "14px 0 0", color: "var(--text-2)",
                    fontSize: "0.82rem", fontWeight: 450, cursor: "pointer",
                  }}
                >
                  ← Back
                </button>
              </div>
            )
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => router.push("/leagues")}
                style={{ padding: "12px 26px", fontSize: "0.95rem" }}
              >
                Continue as {displayName || "you"} →
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  className="avatar"
                  onClick={() => router.push("/settings")}
                  style={{ cursor: "pointer", width: 28, height: 28, fontSize: "0.62rem" }}
                >
                  {initials}
                </div>
                <button type="button" className="ghost" onClick={logout} style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Facts strip ── */}
      <section style={{ padding: PAD, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {FACTS.map((f, i) => (
            <div
              key={f.k}
              style={{
                padding: "26px 24px 26px 0",
                borderRight: i < FACTS.length - 1 ? "1px solid var(--border)" : "none",
                paddingLeft: i === 0 ? 0 : 24,
              }}
            >
              <div style={{ fontSize: "2rem", fontWeight: 400, letterSpacing: "-0.035em", lineHeight: 1 }}>{f.v}</div>
              <div className="eyebrow" style={{ marginTop: 9 }}>{f.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding: PAD }}>
        <div style={{ padding: "72px 0 24px", maxWidth: 620 }}>
          <span className="eyebrow">How to play</span>
          <h2 className="display-2" style={{ margin: "16px 0 0", textTransform: "none", letterSpacing: "-0.028em", color: "var(--text)" }}>
            Six steps to a season.
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            marginBottom: 80,
          }}
        >
          {STEPS.map((step) => (
            <div
              key={step.n}
              style={{
                padding: "26px 24px 30px",
                borderRight: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                margin: "0 -1px -1px 0",
                background: "var(--surface)",
              }}
            >
              <div style={{ fontSize: "0.7rem", fontWeight: 450, color: "var(--text-3)", marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>
                {step.n}
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 500, letterSpacing: "-0.022em", marginBottom: 8 }}>
                {step.title}
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-2)", lineHeight: 1.55 }}>
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ padding: PAD, borderTop: "1px solid var(--border)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "24px 0",
            flexWrap: "wrap",
          }}
        >
          {/* Wordmark carries the name itself, so it stands in for the icon
              plus the "Wager" label the footer used to pair. */}
          <LogoWordmark height={22} />
          <span style={{ fontSize: "0.8rem", color: "var(--text-3)", marginLeft: "auto" }}>
            Fake money. Real NFL data.
          </span>
        </div>
      </footer>
    </div>
  );
}
