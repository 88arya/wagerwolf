"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

const STAT_TYPES = ["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS", "TOUCHDOWNS", "RECEPTIONS"];

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"players" | "schedule" | "resolve">("schedule");

  const [players, setPlayers] = useState<any[]>([]);
  const [playerForm, setPlayerForm] = useState({ name: "", team: "", position: "" });

  const [weeks, setWeeks] = useState<any[]>([]);
  const [weekForm, setWeekForm] = useState({ number: "", startDate: "", endDate: "" });

  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [gameForm, setGameForm] = useState({ homeTeam: "", awayTeam: "", gameDate: "" });
  const [games, setGames] = useState<any[]>([]);

  const [selectedGameId, setSelectedGameId] = useState("");
  const [propForm, setPropForm] = useState({ playerId: "", statType: STAT_TYPES[0], line: "" });

  const [resolveWeekId, setResolveWeekId] = useState("");
  const [resolveProps, setResolveProps] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});

  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.push("/"); return; }
    if (localStorage.getItem("isAdmin") !== "true") { router.push("/leagues"); return; }
    loadPlayers();
    loadWeeks();
  }, []);

  async function loadPlayers() {
    try { setPlayers(await api("/players")); } catch {}
  }

  async function loadWeeks() {
    try { setWeeks(await api("/weeks")); } catch {}
  }

  function loadGamesForWeek(weekId: string) {
    const week = weeks.find((w) => w.id === weekId);
    setGames(week?.games ?? []);
  }

  function loadPropsForResolve(weekId: string) {
    const week = weeks.find((w) => w.id === weekId);
    setResolveProps(week?.games?.flatMap((g: any) => g.props ?? []) ?? []);
    setResults({});
  }

  function flash(message: string, isError = false) {
    if (isError) { setError(message); setMsg(""); }
    else { setMsg(message); setError(""); }
    setTimeout(() => { setMsg(""); setError(""); }, 3000);
  }

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/players", { method: "POST", body: JSON.stringify(playerForm) });
      setPlayerForm({ name: "", team: "", position: "" });
      await loadPlayers();
      flash("Player created");
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function createWeek(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/weeks", { method: "POST", body: JSON.stringify({ ...weekForm, number: Number(weekForm.number) }) });
      setWeekForm({ number: "", startDate: "", endDate: "" });
      await loadWeeks();
      flash("Week created — allowances distributed");
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function createGame(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/games", { method: "POST", body: JSON.stringify({ ...gameForm, weekId: selectedWeekId }) });
      setGameForm({ homeTeam: "", awayTeam: "", gameDate: "" });
      await loadWeeks();
      loadGamesForWeek(selectedWeekId);
      flash("Game added");
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function createProp(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/props", { method: "POST", body: JSON.stringify({ ...propForm, gameId: selectedGameId, line: Number(propForm.line) }) });
      setPropForm({ playerId: "", statType: STAT_TYPES[0], line: "" });
      await loadWeeks();
      flash("Prop added");
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function syncGames(weekId: string) {
    try {
      const res = await api(`/sync/games/${weekId}`, { method: "POST" });
      await loadWeeks();
      loadGamesForWeek(weekId);
      flash(`Synced ${res.synced} game${res.synced !== 1 ? "s" : ""} from Odds API`);
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function syncGamesESPN(weekId: string) {
    try {
      const res = await api(`/espn/games/${weekId}`, { method: "POST" });
      await loadWeeks();
      loadGamesForWeek(weekId);
      flash(`Synced ${res.synced} game${res.synced !== 1 ? "s" : ""} from ESPN`);
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function autoResolve(weekId: string) {
    try {
      const res = await api(`/espn/resolve/${weekId}`, { method: "POST" });
      await loadWeeks();
      flash(`Auto-resolved — ${res.propsMatched} props matched, ${res.propsUnmatched} unmatched`);
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function syncProps(gameId: string) {
    try {
      const res = await api(`/sync/props/${gameId}`, { method: "POST" });
      await loadWeeks();
      flash(`Synced ${res.synced} prop${res.synced !== 1 ? "s" : ""} from Odds API`);
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function syncLines(gameId: string) {
    try {
      const res = await api(`/sync/lines/${gameId}`, { method: "POST" });
      await loadWeeks();
      flash(`Synced ${res.synced} line${res.synced !== 1 ? "s" : ""} from Odds API`);
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function cancelGame(gameId: string, homeTeam: string, awayTeam: string) {
    if (!confirm(`Cancel ${homeTeam} vs ${awayTeam}? All pending bets will be voided and stakes refunded.`)) return;
    try {
      const res = await api(`/games/${gameId}/cancel`, { method: "POST" });
      await loadWeeks();
      flash(`Game cancelled — ${res.picksVoided + res.gamePicksVoided} bets voided, ${res.parlaysVoided} parlays voided`);
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function toggleLock(weekId: string) {
    try {
      await api(`/weeks/${weekId}/lock`, { method: "POST" });
      await loadWeeks();
      flash("Week lock toggled");
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function deleteAllLeagues() {
    if (!confirm("Delete ALL leagues, memberships, picks, and matchups? This cannot be undone.")) return;
    try {
      await api("/admin/leagues/delete-all", { method: "POST" });
      flash("All leagues deleted");
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function deleteWeek(weekId: string, weekNum: number) {
    if (!confirm(`Delete Week ${weekNum} and all its games, props, and picks?`)) return;
    try {
      await api(`/weeks/${weekId}`, { method: "DELETE" });
      await loadWeeks();
      flash(`Week ${weekNum} deleted`);
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  async function resolveWeek(e: React.FormEvent) {
    e.preventDefault();
    const resultsList = Object.entries(results)
      .filter(([, v]) => v !== "")
      .map(([propId, result]) => ({ propId, result: Number(result) }));
    try {
      await api(`/weeks/${resolveWeekId}/resolve`, { method: "POST", body: JSON.stringify({ results: resultsList }) });
      setResolveWeekId("");
      setResolveProps([]);
      setResults({});
      await loadWeeks();
      flash("Week resolved — balances updated");
    } catch (err: any) { try { flash(JSON.parse(err.message).error, true); } catch { flash(err.message, true); } }
  }

  const TABS = ["schedule", "resolve", "players"] as const;

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href="/leagues" style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>‹ Leagues</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20 }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <h1>Admin</h1>
              <p className="subtitle">Manage the schedule and resolve weeks</p>
            </div>
            <button className="ghost" style={{ fontSize: "0.75rem", padding: "6px 12px", color: "var(--loss)", borderColor: "rgba(183,28,28,0.3)", flexShrink: 0 }} onClick={deleteAllLeagues}>
              Delete All Leagues
            </button>
          </div>
        </div>

        {msg && (
          <div style={{ background: "var(--win-bg)", border: "1px solid rgba(30,126,52,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "var(--win)", fontWeight: 600, fontSize: "0.85rem" }}>
            {msg}
          </div>
        )}
        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        {/* Tab toggle */}
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 8, padding: 3, marginBottom: 20, border: "1px solid var(--border)" }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0",
              background: tab === t ? "var(--surface)" : "transparent",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              border: tab === t ? "1px solid var(--border)" : "1px solid transparent",
              color: tab === t ? "var(--text)" : "var(--text-2)",
              borderRadius: 6,
              fontWeight: tab === t ? 700 : 500, fontSize: "0.82rem",
              letterSpacing: "0.03em", textTransform: "capitalize",
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Schedule ── */}
        {tab === "schedule" && (
          <>
            <h2>Create Week</h2>
            <div className="card">
              <form className="form" onSubmit={createWeek}>
                <div>
                  <div className="label">Week Number</div>
                  <input type="number" placeholder="1" value={weekForm.number} onChange={(e) => setWeekForm({ ...weekForm, number: e.target.value })} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div className="label">Start Date</div>
                    <input type="date" value={weekForm.startDate} onChange={(e) => setWeekForm({ ...weekForm, startDate: e.target.value })} required />
                  </div>
                  <div>
                    <div className="label">End Date</div>
                    <input type="date" value={weekForm.endDate} onChange={(e) => setWeekForm({ ...weekForm, endDate: e.target.value })} required />
                  </div>
                </div>
                <button type="submit">Create Week</button>
              </form>
            </div>

            <h2>Add Game</h2>
            <div className="card">
              <form className="form" onSubmit={createGame}>
                <div>
                  <div className="label">Week</div>
                  <select value={selectedWeekId} onChange={(e) => { setSelectedWeekId(e.target.value); loadGamesForWeek(e.target.value); }} required>
                    <option value="">Select week</option>
                    {weeks.filter((w) => !w.resolved).map((w: any) => (
                      <option key={w.id} value={w.id}>Week {w.number}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div className="label">Home Team</div>
                    <input placeholder="KC" value={gameForm.homeTeam} onChange={(e) => setGameForm({ ...gameForm, homeTeam: e.target.value })} required />
                  </div>
                  <div>
                    <div className="label">Away Team</div>
                    <input placeholder="SF" value={gameForm.awayTeam} onChange={(e) => setGameForm({ ...gameForm, awayTeam: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <div className="label">Kickoff</div>
                  <input type="datetime-local" value={gameForm.gameDate} onChange={(e) => setGameForm({ ...gameForm, gameDate: e.target.value })} required />
                </div>
                <button type="submit">Add Game</button>
              </form>
            </div>

            <h2>Add Prop</h2>
            <div className="card">
              <form className="form" onSubmit={createProp}>
                <div>
                  <div className="label">Game</div>
                  <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} required>
                    <option value="">Select game</option>
                    {games.map((g: any) => <option key={g.id} value={g.id}>{g.homeTeam} vs {g.awayTeam}</option>)}
                  </select>
                </div>
                <div>
                  <div className="label">Player</div>
                  <select value={propForm.playerId} onChange={(e) => setPropForm({ ...propForm, playerId: e.target.value })} required>
                    <option value="">Select player</option>
                    {players.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.position} · {p.team})</option>)}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div className="label">Stat Type</div>
                    <select value={propForm.statType} onChange={(e) => setPropForm({ ...propForm, statType: e.target.value })}>
                      {STAT_TYPES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="label">Line</div>
                    <input type="number" placeholder="275.5" value={propForm.line} onChange={(e) => setPropForm({ ...propForm, line: e.target.value })} required />
                  </div>
                </div>
                <button type="submit">Add Prop</button>
              </form>
            </div>

            <h2>Weeks</h2>
            {weeks.length === 0 && (
              <div className="card">
                <div className="empty" style={{ padding: "24px 0" }}>
                  <div className="empty-icon">📅</div>
                  <div className="empty-text">No weeks created yet</div>
                </div>
              </div>
            )}
            {weeks.map((w: any) => {
              const status = w.resolved ? "FINAL" : w.locked ? "LOCKED" : "LIVE";
              const statusClass = w.resolved ? "" : w.locked ? "badge-red" : "badge-green";
              return (
                <div key={w.id} className="card" style={{ marginBottom: 8 }}>
                  <div className="row" style={{ marginBottom: w.games?.length ? 12 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: "1rem" }}>Week {w.number}</div>
                      <span className={`badge ${statusClass}`}>{status}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button className="secondary" style={{ fontSize: "0.75rem", padding: "5px 10px" }} onClick={() => syncGamesESPN(w.id)}>
                        ESPN
                      </button>
                      <button className="secondary" style={{ fontSize: "0.75rem", padding: "5px 10px" }} onClick={() => syncGames(w.id)}>
                        Odds API
                      </button>
                      {!w.resolved && (
                        <button className="secondary" style={{ fontSize: "0.75rem", padding: "5px 10px" }} onClick={() => toggleLock(w.id)}>
                          {w.locked ? "Unlock" : "Lock"}
                        </button>
                      )}
                      {w.locked && !w.resolved && (
                        <button style={{ fontSize: "0.75rem", padding: "5px 10px" }} onClick={() => autoResolve(w.id)}>
                          Auto-Resolve
                        </button>
                      )}
                      {!w.resolved && (
                        <button className="ghost" style={{ fontSize: "0.75rem", padding: "5px 10px", color: "var(--loss)", borderColor: "rgba(183,28,28,0.3)" }} onClick={() => deleteWeek(w.id, w.number)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {w.games?.map((g: any) => (
                    <div key={g.id} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {g.homeTeam} vs {g.awayTeam}
                        </div>
                        <button
                          className="secondary"
                          style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                          onClick={() => syncLines(g.id)}
                        >
                          Sync Lines
                        </button>
                        <button
                          className="secondary"
                          style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                          onClick={() => syncProps(g.id)}
                        >
                          Sync Props
                        </button>
                        {g.status !== "CANCELLED" && (
                          <button
                            className="ghost"
                            style={{ fontSize: "0.72rem", padding: "4px 10px", color: "var(--loss)", borderColor: "rgba(183,28,28,0.3)" }}
                            onClick={() => cancelGame(g.id, g.homeTeam, g.awayTeam)}
                          >
                            Cancel
                          </button>
                        )}
                        {g.status === "CANCELLED" && (
                          <span className="badge badge-red" style={{ fontSize: "0.7rem" }}>CANCELLED</span>
                        )}
                      </div>
                      {g.props?.map((p: any) => (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 4, fontSize: "0.81rem" }}>
                          <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{p.player?.name} — {p.statType.replaceAll("_", " ")} {p.line}</span>
                          {p.result != null && <span style={{ color: "var(--win)", fontWeight: 700 }}>{p.result}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}

        {/* ── Resolve ── */}
        {tab === "resolve" && (
          <>
            <h2>Resolve Week</h2>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="label" style={{ marginBottom: 8 }}>Select Week</div>
              <select
                value={resolveWeekId}
                onChange={(e) => { setResolveWeekId(e.target.value); loadPropsForResolve(e.target.value); }}
              >
                <option value="">Choose week to resolve</option>
                {weeks.filter((w) => !w.resolved).map((w: any) => (
                  <option key={w.id} value={w.id}>Week {w.number}</option>
                ))}
              </select>
            </div>

            {resolveWeekId && resolveProps.length === 0 && (
              <div className="card">
                <div className="empty" style={{ padding: "24px 0" }}>
                  <div className="empty-icon">🎯</div>
                  <div className="empty-text">No props for this week</div>
                </div>
              </div>
            )}

            {resolveProps.length > 0 && (
              <form onSubmit={resolveWeek}>
                {resolveProps.map((prop: any) => (
                  <div key={prop.id} className="card" style={{ marginBottom: 8 }}>
                    <div className="row" style={{ marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{prop.player?.name}</div>
                        <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: 2 }}>
                          {prop.statType.replaceAll("_", " ")} · line {prop.line}
                        </div>
                      </div>
                      <span className="tag">{prop.player?.team}</span>
                    </div>
                    <div>
                      <div className="label">Actual Result</div>
                      <input
                        type="number"
                        placeholder={`Over/under ${prop.line}`}
                        value={results[prop.id] ?? ""}
                        onChange={(e) => setResults((prev) => ({ ...prev, [prop.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
                <button type="submit" style={{ width: "100%", marginTop: 4, padding: "15px" }}>
                  Resolve Week →
                </button>
              </form>
            )}
          </>
        )}

        {/* ── Players ── */}
        {tab === "players" && (
          <>
            <h2>Add Player</h2>
            <div className="card">
              <form className="form" onSubmit={createPlayer}>
                <div>
                  <div className="label">Name</div>
                  <input placeholder="Patrick Mahomes" value={playerForm.name} onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div className="label">Team</div>
                    <input placeholder="KC" value={playerForm.team} onChange={(e) => setPlayerForm({ ...playerForm, team: e.target.value })} required />
                  </div>
                  <div>
                    <div className="label">Position</div>
                    <input placeholder="QB" value={playerForm.position} onChange={(e) => setPlayerForm({ ...playerForm, position: e.target.value })} required />
                  </div>
                </div>
                <button type="submit">Add Player</button>
              </form>
            </div>

            <h2>Players ({players.length})</h2>
            {players.length === 0 && (
              <div className="card">
                <div className="empty" style={{ padding: "24px 0" }}>
                  <div className="empty-icon">🏈</div>
                  <div className="empty-text">No players yet</div>
                </div>
              </div>
            )}
            {players.map((p: any) => (
              <div key={p.id} className="card" style={{ marginBottom: 6 }}>
                <div className="row">
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{p.name}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span className="tag">{p.position}</span>
                    <span className="tag">{p.team}</span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
