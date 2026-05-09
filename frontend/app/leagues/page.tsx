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
        <div className="avatar" style={{ width: 30, height: 30, fontSize: "0.72rem", marginLeft: 4 }}>{initials}</div>
        <button className="nav-link" onClick={() => { localStorage.clear(); router.push("/"); }}>Sign out</button>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 24 }}>
          <h1>My Leagues</h1>
          <p className="subtitle">Compete with friends on NFL props</p>
        </div>

        {memberships.length > 0 ? (
          <>
            {memberships.map((m: any) => (
              <Link key={m.id} href={`/leagues/${m.leagueId}`}>
                <div className="card" style={{ cursor: "pointer", marginBottom: 8, transition: "border-color 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                  <div className="row">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>{m.league?.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="pill" style={{ fontSize: "0.75rem" }}>${m.balance.toLocaleString()}</span>
                        <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>${m.league?.weeklyAllowance}/wk</span>
                        {m.league?.isPublic && <span className="badge badge-green" style={{ fontSize: "0.68rem" }}>Public</span>}
                      </div>
                    </div>
                    <span style={{ color: "var(--accent)", fontSize: "1.1rem" }}>›</span>
                  </div>
                </div>
              </Link>
            ))}
          </>
        ) : (
          <div className="card" style={{ marginBottom: 8 }}>
            <div className="empty">
              <div className="empty-icon">🏈</div>
              <div className="empty-text">No leagues yet. Create or join one below.</div>
            </div>
          </div>
        )}

        {/* Pending requests */}
        {pendingMemberships.length > 0 && (
          <>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", margin: "16px 0 8px" }}>
              PENDING APPROVAL
            </div>
            {pendingMemberships.map((m: any) => (
              <div key={m.id} className="card" style={{ marginBottom: 8, borderColor: "var(--border)", opacity: 0.7 }}>
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>{m.league?.name}</div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Waiting for commissioner to approve</span>
                  </div>
                  <span className="badge" style={{ fontSize: "0.7rem" }}>Pending</span>
                </div>
              </div>
            ))}
          </>
        )}

        <h2>Get Started</h2>

        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 8, padding: 3, marginBottom: 12, border: "1px solid var(--border)" }}>
          {(["join", "create"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setJoinError(""); setJoinSuccess(""); setError(""); }} style={{
              flex: 1, padding: "8px 0",
              background: tab === t ? "var(--surface)" : "transparent",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              border: tab === t ? "1px solid var(--border)" : "1px solid transparent",
              color: tab === t ? "var(--text)" : "var(--text-2)",
              borderRadius: 6,
              fontWeight: tab === t ? 700 : 500, fontSize: "0.85rem",
              letterSpacing: "0.01em",
            }}>
              {t === "join" ? "Join League" : "Create League"}
            </button>
          ))}
        </div>

        {tab === "join" && (
          <div className="card">
            {/* Public league */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 4 }}>Public League</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.8rem", marginBottom: 12 }}>
                Get automatically placed in an open public league.
              </div>
              <button style={{ width: "100%" }} onClick={joinPublic}>
                Join a Public League
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", margin: "0 -20px", marginBottom: 20 }} />

            {/* Private league */}
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 4 }}>Private League</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.8rem", marginBottom: 12 }}>
                Enter an invite code — your request goes to the commissioner for approval.
              </div>
              <form className="form" onSubmit={joinPrivate} style={{ gap: 10 }}>
                <input
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  style={{ textTransform: "uppercase", letterSpacing: "0.3em", fontSize: "1.2rem", fontWeight: 700, textAlign: "center" }}
                  required
                />
                <button type="submit" style={{ width: "100%" }}>Request to Join</button>
              </form>
            </div>

            {joinError && <p className="error" style={{ marginTop: 12 }}>{joinError}</p>}
            {joinSuccess && <p style={{ marginTop: 12, color: "var(--win)", fontSize: "0.85rem", fontWeight: 600 }}>{joinSuccess}</p>}
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
                <div className="label">Teams</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                  {teamOptions.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm({ ...form, maxTeams: String(n) })}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        fontSize: "0.85rem",
                        fontWeight: Number(form.maxTeams) === n ? 700 : 500,
                        background: Number(form.maxTeams) === n ? "var(--accent)" : "var(--surface-2)",
                        color: Number(form.maxTeams) === n ? "#fff" : "var(--text-2)",
                        border: Number(form.maxTeams) === n ? "1px solid var(--accent)" : "1px solid var(--border)",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="label">Weekly Allowance ($)</div>
                <input
                  type="number"
                  min="1"
                  max="999999"
                  value={form.weeklyAllowance}
                  onChange={(e) => setForm({ ...form, weeklyAllowance: e.target.value })}
                  required
                />
              </div>

              {error && <p className="error">{error}</p>}
              <button type="submit" style={{ width: "100%" }}>Create</button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
