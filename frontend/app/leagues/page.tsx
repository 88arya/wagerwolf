"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

const NFL_CITIES = [
  "Arizona", "Atlanta", "Baltimore", "Buffalo", "Carolina", "Chicago",
  "Cincinnati", "Cleveland", "Dallas", "Denver", "Detroit", "Green Bay",
  "Houston", "Indianapolis", "Jacksonville", "Kansas City", "Las Vegas",
  "Los Angeles", "Miami", "Minnesota", "New England", "New Orleans",
  "New York", "Philadelphia", "Pittsburgh", "San Francisco", "Seattle",
  "Tampa Bay", "Tennessee", "Washington",
];

function randomLeagueName() {
  const city = NFL_CITIES[Math.floor(Math.random() * NFL_CITIES.length)];
  return `${city} ${new Date().getFullYear()} League`;
}

export default function LeaguesPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<any[]>([]);
  const [pendingMemberships, setPendingMemberships] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", weeklyAllowance: "300", maxTeams: "10" });
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<"create" | "join">("join");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.push("/"); return; }
    setIsAdmin(localStorage.getItem("isAdmin") === "true");
    setDisplayName(localStorage.getItem("displayName") ?? "");
    setForm((f) => ({ ...f, name: randomLeagueName() }));
    loadMemberships();
  }, []);

  async function loadMemberships() {
    try { setMemberships(await api("/memberships")); } catch {}
    try { setPendingMemberships(await api("/memberships/pending")); } catch {}
  }

  async function createLeague(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const league = await api("/leagues", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          weeklyAllowance: Number(form.weeklyAllowance),
          maxTeams: Number(form.maxTeams),
        }),
      });
      await api(`/leagues/${league.id}/join`, { method: "POST", body: JSON.stringify({}) });
      router.push(`/leagues/${league.id}`);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  async function joinPublic() {
    setJoinError("");
    setJoinSuccess("");
    try {
      const result = await api("/memberships/join-public", { method: "POST", body: JSON.stringify({}) });
      setJoinSuccess(`Joined "${result.league?.name}"!`);
      loadMemberships();
    } catch (err: any) {
      try { setJoinError(JSON.parse(err.message).error); } catch { setJoinError(err.message); }
    }
  }

  async function joinPrivate(e: React.FormEvent) {
    e.preventDefault();
    setJoinError("");
    setJoinSuccess("");
    try {
      const result = await api("/memberships/join-by-code", { method: "POST", body: JSON.stringify({ code: joinCode }) });
      setJoinSuccess(`Request sent to "${result.league?.name}" — waiting for commissioner approval.`);
      setJoinCode("");
      loadMemberships();
    } catch (err: any) {
      try { setJoinError(JSON.parse(err.message).error); } catch { setJoinError(err.message); }
    }
  }

  const initials = displayName.slice(0, 2).toUpperCase();
  const teamOptions = [4, 6, 8, 10, 12, 14, 16, 18, 20];

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        {isAdmin && <Link href="/admin">Admin</Link>}
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "rgba(200,150,12,0.2)",
          border: "1.5px solid rgba(200,150,12,0.4)",
          color: "var(--gold)",
          fontSize: "0.72rem", fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginLeft: 4,
        }}>{initials}</div>
        <button className="nav-link" onClick={() => { localStorage.clear(); router.push("/"); }}>
          Sign out
        </button>
      </nav>

      <div className="page">
        {/* Header */}
        <div style={{ marginBottom: 24, paddingTop: 4 }}>
          <h1>My Leagues</h1>
          <p className="subtitle">Your NFL prop betting competitions</p>
        </div>

        {/* Active leagues */}
        {memberships.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {memberships.map((m: any) => (
              <Link key={m.id} href={`/leagues/${m.leagueId}`}>
                <div className="card" style={{
                  cursor: "pointer",
                  marginBottom: 8,
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  borderLeft: "4px solid var(--accent)",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.borderLeftColor = "var(--accent)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}>
                  <div className="row">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 6, color: "var(--text)" }}>
                        {m.league?.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          background: "var(--accent-dim)",
                          color: "var(--accent)",
                          borderRadius: 20,
                          padding: "2px 10px",
                          fontSize: "0.78rem",
                          fontWeight: 800,
                          letterSpacing: "0.01em",
                        }}>
                          ${m.balance.toLocaleString()}
                        </span>
                        <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>
                          ${m.league?.weeklyAllowance}/wk
                        </span>
                        {m.league?.isPublic && (
                          <span className="badge badge-blue">Public</span>
                        )}
                      </div>
                    </div>
                    <span style={{ color: "var(--accent)", fontSize: "1.2rem", fontWeight: 300 }}>›</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {memberships.length === 0 && (
          <div className="card" style={{ marginBottom: 20, textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: "2.4rem", marginBottom: 12 }}>🏈</div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: 6 }}>
              No leagues yet
            </div>
            <div style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>
              Create a new league or join one below
            </div>
          </div>
        )}

        {/* Pending */}
        {pendingMemberships.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Pending Approval</div>
            {pendingMemberships.map((m: any) => (
              <div key={m.id} className="card" style={{ marginBottom: 6, opacity: 0.75, borderStyle: "dashed" }}>
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 3 }}>{m.league?.name}</div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Waiting for commissioner</span>
                  </div>
                  <span className="badge badge-yellow">Pending</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Get started */}
        <div className="section-title" style={{ marginBottom: 10 }}>Get Started</div>

        {/* Segment control */}
        <div className="segment" style={{ marginBottom: 14 }}>
          {(["join", "create"] as const).map((t) => (
            <button
              key={t}
              className={`segment-btn${tab === t ? " active" : ""}`}
              onClick={() => { setTab(t); setJoinError(""); setJoinSuccess(""); setError(""); }}
            >
              {t === "join" ? "Join League" : "Create League"}
            </button>
          ))}
        </div>

        {tab === "join" && (
          <div className="card">
            {/* Public */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: 4 }}>Join a Public League</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.8rem", marginBottom: 12 }}>
                Get placed in an open public league instantly.
              </div>
              <button style={{ width: "100%" }} onClick={joinPublic}>
                Find a Public League
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", margin: "0 -16px 20px", padding: 0 }} />

            {/* Private */}
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: 4 }}>Join with Invite Code</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.8rem", marginBottom: 12 }}>
                Enter a 6-character code — commissioner will approve your request.
              </div>
              <form className="form" onSubmit={joinPrivate} style={{ gap: 10 }}>
                <input
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.35em",
                    fontSize: "1.4rem",
                    fontWeight: 900,
                    textAlign: "center",
                    color: "var(--accent)",
                  }}
                  required
                />
                <button type="submit" style={{ width: "100%" }}>Request to Join</button>
              </form>
            </div>

            {joinError && <p className="error" style={{ marginTop: 12 }}>{joinError}</p>}
            {joinSuccess && (
              <div style={{
                marginTop: 12,
                background: "var(--win-bg)",
                border: "1px solid rgba(22,163,74,0.3)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "var(--win)",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}>
                {joinSuccess}
              </div>
            )}
          </div>
        )}

        {tab === "create" && (
          <div className="card">
            <form className="form" onSubmit={createLeague}>
              <div>
                <div className="label">League Name</div>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>

              <div>
                <div className="label">Number of Teams</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {teamOptions.map((n) => {
                    const active = Number(form.maxTeams) === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setForm({ ...form, maxTeams: String(n) })}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 7,
                          fontSize: "0.88rem",
                          fontWeight: active ? 800 : 500,
                          background: active ? "var(--accent)" : "var(--surface-2)",
                          color: active ? "#080C14" : "var(--text-2)",
                          border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                          transition: "all 0.12s",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="label">Weekly Allowance ($)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, weeklyAllowance: String(Math.max(25, Number(form.weeklyAllowance) - 25)) })}
                    style={{ width: 40, height: 40, padding: 0, fontSize: "1.2rem", fontWeight: 700, flexShrink: 0 }}
                  >−</button>
                  <input
                    type="number"
                    min="25"
                    max="1000000"
                    step="25"
                    value={form.weeklyAllowance}
                    onChange={(e) => setForm({ ...form, weeklyAllowance: e.target.value })}
                    style={{ textAlign: "center", fontWeight: 800, fontSize: "1.1rem" }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, weeklyAllowance: String(Number(form.weeklyAllowance) + 25) })}
                    style={{ width: 40, height: 40, padding: 0, fontSize: "1.2rem", fontWeight: 700, flexShrink: 0 }}
                  >+</button>
                </div>
              </div>

              {error && <p className="error">{error}</p>}
              <button type="submit" style={{ width: "100%", padding: "14px" }}>
                Create League
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
