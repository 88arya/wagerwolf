"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

const NFL_LOCATIONS = [
  "Arizona","Atlanta","Baltimore","Buffalo","Carolina","Chicago",
  "Cincinnati","Cleveland","Dallas","Denver","Detroit","Green Bay",
  "Houston","Indianapolis","Jacksonville","Kansas City","Las Vegas",
  "Los Angeles","Miami","Minnesota","New England","New Orleans",
  "New York","Philadelphia","Pittsburgh","San Francisco","Seattle",
  "Tampa Bay","Tennessee","Washington",
];

const NFL_NICKNAMES = [
  "Cardinals","Falcons","Ravens","Bills","Panthers","Bears","Bengals",
  "Browns","Cowboys","Broncos","Lions","Packers","Texans","Colts",
  "Jaguars","Chiefs","Raiders","Chargers","Rams","Dolphins","Vikings",
  "Patriots","Saints","Giants","Jets","Eagles","Steelers","49ers",
  "Seahawks","Buccaneers","Titans","Commanders",
];

function randomLeagueName() {
  const loc = NFL_LOCATIONS[Math.floor(Math.random() * NFL_LOCATIONS.length)];
  const nick = NFL_NICKNAMES[Math.floor(Math.random() * NFL_NICKNAMES.length)];
  return `${loc} ${nick} ${new Date().getFullYear()} League`;
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
    setJoinError(""); setJoinSuccess("");
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
    setJoinError(""); setJoinSuccess("");
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
        {isAdmin && <Link href="/admin" style={{ fontSize: "0.78rem", fontWeight: 700 }}>Admin</Link>}
        <Link href="/settings" style={{ textDecoration: "none" }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "var(--accent-dim)",
            border: "1.5px solid rgba(37,99,235,0.25)",
            color: "var(--accent)",
            fontSize: "0.68rem", fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginLeft: 6, cursor: "pointer",
          }}>{initials || "?"}</div>
        </Link>
        <button className="nav-link" onClick={() => { localStorage.clear(); router.push("/"); }}>
          Sign out
        </button>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20, paddingTop: 2 }}>
          <h1>My Leagues</h1>
          <p className="subtitle">NFL prop betting competitions</p>
        </div>

        {/* Active leagues */}
        {memberships.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {memberships.map((m: any) => (
              <Link key={m.id} href={`/leagues/${m.leagueId}`}>
                <div
                  className="card"
                  style={{
                    cursor: "pointer",
                    marginBottom: 6,
                    padding: "14px 16px",
                    borderLeft: "3px solid var(--accent)",
                    transition: "background 0.12s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.league?.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        background: "var(--accent-dim)",
                        color: "var(--accent)",
                        borderRadius: 20,
                        padding: "2px 10px",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        ${m.balance.toLocaleString()}
                      </span>
                      <span style={{ color: "var(--text-3)", fontSize: "0.72rem" }}>
                        ${m.league?.weeklyAllowance}/wk
                      </span>
                      {m.league?.isPublic && <span className="badge badge-blue">Public</span>}
                    </div>
                  </div>
                  <span style={{ color: "var(--text-3)", fontSize: "1.1rem", fontWeight: 300, flexShrink: 0 }}>›</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {memberships.length === 0 && (
          <div className="card" style={{ marginBottom: 16, textAlign: "center", padding: "28px 20px" }}>
            <div style={{ fontSize: "2rem", marginBottom: 10 }}>🏈</div>
            <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)", marginBottom: 5 }}>
              No leagues yet
            </div>
            <div style={{ color: "var(--text-3)", fontSize: "0.8rem" }}>
              Create a new league or join one below
            </div>
          </div>
        )}

        {/* Pending */}
        {pendingMemberships.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Pending Approval</div>
            {pendingMemberships.map((m: any) => (
              <div key={m.id} className="card" style={{ marginBottom: 6, opacity: 0.7, borderStyle: "dashed" }}>
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem", marginBottom: 2 }}>{m.league?.name}</div>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>Waiting for commissioner</span>
                  </div>
                  <span className="badge badge-yellow">Pending</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Get started */}
        <div className="section-title" style={{ marginBottom: 8 }}>Get Started</div>

        <div className="segment" style={{ marginBottom: 12 }}>
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
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 3 }}>Join a Public League</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.78rem", marginBottom: 12 }}>
                Get placed in an open public league instantly.
              </div>
              <button style={{ width: "100%", fontSize: "0.88rem" }} onClick={joinPublic}>
                Find a Public League
              </button>
            </div>

            <hr style={{ margin: "0 -14px 18px" }} />

            {/* Private */}
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 3 }}>Join with Invite Code</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.78rem", marginBottom: 12 }}>
                Enter a 6-character code from your commissioner.
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
                    fontSize: "1.5rem",
                    fontWeight: 900,
                    textAlign: "center",
                    color: "var(--accent)",
                  }}
                  required
                />
                <button type="submit" style={{ width: "100%", fontSize: "0.88rem" }}>Request to Join</button>
              </form>
            </div>

            {joinError && <p className="error" style={{ marginTop: 12 }}>{joinError}</p>}
            {joinSuccess && (
              <div style={{
                marginTop: 12,
                background: "var(--win-bg)",
                border: "1px solid var(--win-border)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "var(--win)",
                fontSize: "0.82rem",
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
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, name: randomLeagueName() }))}
                    title="Randomize name"
                    style={{ flexShrink: 0, background: "none", border: "1px solid var(--border-2)", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.12s, border-color 0.12s" }}
                    onMouseEnter={e => { const el = e.currentTarget; el.style.color = "var(--text)"; el.style.borderColor = "var(--text-3)"; }}
                    onMouseLeave={e => { const el = e.currentTarget; el.style.color = "var(--text-3)"; el.style.borderColor = "var(--border-2)"; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  </button>
                </div>
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
                          padding: "6px 14px",
                          borderRadius: 6,
                          fontSize: "0.85rem",
                          fontWeight: active ? 800 : 500,
                          background: active ? "var(--accent)" : "var(--surface-2)",
                          color: active ? "#FFFFFF" : "var(--text-2)",
                          border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border-2)",
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
                    style={{ width: 38, height: 38, padding: 0, fontSize: "1.2rem", fontWeight: 700, flexShrink: 0 }}
                  >−</button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.weeklyAllowance}
                    onChange={(e) => setForm({ ...form, weeklyAllowance: e.target.value.replace(/[^0-9]/g, "") })}
                    style={{ textAlign: "center", fontWeight: 800, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, weeklyAllowance: String(Number(form.weeklyAllowance) + 25) })}
                    style={{ width: 38, height: 38, padding: 0, fontSize: "1.2rem", fontWeight: 700, flexShrink: 0 }}
                  >+</button>
                </div>
              </div>

              {error && <p className="error">{error}</p>}
              <button type="submit" style={{ width: "100%", padding: "13px", fontSize: "0.9rem", fontWeight: 800 }}>
                Create League
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
