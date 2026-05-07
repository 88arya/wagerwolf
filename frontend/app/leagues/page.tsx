"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function LeaguesPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", weeklyAllowance: "200" });
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<"create" | "join">("join");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.push("/"); return; }
    setIsAdmin(localStorage.getItem("isAdmin") === "true");
    setDisplayName(localStorage.getItem("displayName") ?? "");
    loadMemberships();
  }, []);

  async function loadMemberships() {
    try { setMemberships(await api("/memberships")); } catch {}
  }

  async function createLeague(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const league = await api("/leagues", {
        method: "POST",
        body: JSON.stringify({ name: form.name, weeklyAllowance: Number(form.weeklyAllowance) }),
      });
      await api(`/leagues/${league.id}/join`, { method: "POST", body: JSON.stringify({}) });
      loadMemberships();
      setForm({ name: "", weeklyAllowance: "200" });
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  async function joinLeague(e: React.FormEvent) {
    e.preventDefault();
    setJoinError("");
    try {
      await api("/memberships/join-by-code", { method: "POST", body: JSON.stringify({ code: joinCode }) });
      loadMemberships();
      setJoinCode("");
    } catch (err: any) {
      try { setJoinError(JSON.parse(err.message).error); } catch { setJoinError(err.message); }
    }
  }

  const initials = displayName.slice(0, 2).toUpperCase();

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
                        <span className="pill" style={{ fontSize: "0.75rem" }}>
                          ${m.balance.toLocaleString()}
                        </span>
                        <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>
                          ${m.league?.weeklyAllowance}/wk
                        </span>
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

        <h2>Get Started</h2>

        {/* Tab toggle */}
        <div style={{ display: "flex", background: "var(--surface)", borderRadius: 8, padding: 4, marginBottom: 12 }}>
          {(["join", "create"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0",
              background: tab === t ? "var(--surface-3)" : "transparent",
              color: tab === t ? "var(--text)" : "var(--text-2)",
              border: "none", borderRadius: 6,
              fontWeight: tab === t ? 700 : 500, fontSize: "0.85rem",
              boxShadow: "none", letterSpacing: "0.01em",
            }}>
              {t === "join" ? "Join League" : "Create League"}
            </button>
          ))}
        </div>

        {tab === "join" && (
          <div className="card">
            <form className="form" onSubmit={joinLeague}>
              <div>
                <div className="label">Invite Code</div>
                <input
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  style={{ textTransform: "uppercase", letterSpacing: "0.3em", fontSize: "1.2rem", fontWeight: 700, textAlign: "center" }}
                  required
                />
              </div>
              {joinError && <p className="error">{joinError}</p>}
              <button type="submit" style={{ width: "100%" }}>Join League</button>
            </form>
          </div>
        )}

        {tab === "create" && (
          <div className="card">
            <form className="form" onSubmit={createLeague}>
              <div>
                <div className="label">League Name</div>
                <input placeholder="Sunday Funday" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <div className="label">Weekly Allowance ($)</div>
                <input type="number" placeholder="200" value={form.weeklyAllowance} onChange={(e) => setForm({ ...form, weeklyAllowance: e.target.value })} required />
              </div>
              {error && <p className="error">{error}</p>}
              <button type="submit" style={{ width: "100%" }}>Create & Join</button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
