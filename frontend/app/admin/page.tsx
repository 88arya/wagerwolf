"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

const STAT_TYPES = ["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS", "TOUCHDOWNS", "RECEPTIONS"];

export default function AdminPage() {
  const [tab, setTab] = useState<"players" | "schedule" | "resolve">("players");

  // Players
  const [players, setPlayers] = useState<any[]>([]);
  const [playerForm, setPlayerForm] = useState({ name: "", team: "", position: "" });

  // Weeks
  const [weeks, setWeeks] = useState<any[]>([]);
  const [weekForm, setWeekForm] = useState({ number: "", startDate: "", endDate: "" });

  // Games
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [gameForm, setGameForm] = useState({ homeTeam: "", awayTeam: "", gameDate: "" });

  // Props
  const [games, setGames] = useState<any[]>([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [propForm, setPropForm] = useState({ playerId: "", statType: STAT_TYPES[0], line: "" });

  // Resolve
  const [resolveWeekId, setResolveWeekId] = useState("");
  const [resolveProps, setResolveProps] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});

  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadPlayers();
    loadWeeks();
  }, []);

  async function loadPlayers() {
    try { setPlayers(await api("/players")); } catch {}
  }

  async function loadWeeks() {
    try { setWeeks(await api("/weeks")); } catch {}
  }

  async function loadGamesForWeek(weekId: string) {
    const week = weeks.find((w) => w.id === weekId);
    setGames(week?.games ?? []);
  }

  async function loadPropsForResolve(weekId: string) {
    const week = weeks.find((w) => w.id === weekId);
    const allProps = week?.games?.flatMap((g: any) => g.props ?? []) ?? [];
    setResolveProps(allProps);
    setResults({});
  }

  function flash(message: string, isError = false) {
    if (isError) { setError(message); setMsg(""); }
    else { setMsg(message); setError(""); }
  }

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/players", { method: "POST", body: JSON.stringify(playerForm) });
      setPlayerForm({ name: "", team: "", position: "" });
      loadPlayers();
      flash("Player created");
    } catch (err: any) { flash(err.message, true); }
  }

  async function createWeek(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/weeks", { method: "POST", body: JSON.stringify({ ...weekForm, number: Number(weekForm.number) }) });
      setWeekForm({ number: "", startDate: "", endDate: "" });
      loadWeeks();
      flash("Week created — allowances distributed to all league members");
    } catch (err: any) { flash(err.message, true); }
  }

  async function createGame(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/games", { method: "POST", body: JSON.stringify({ ...gameForm, weekId: selectedWeekId }) });
      setGameForm({ homeTeam: "", awayTeam: "", gameDate: "" });
      loadWeeks();
      loadGamesForWeek(selectedWeekId);
      flash("Game created");
    } catch (err: any) { flash(err.message, true); }
  }

  async function createProp(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/props", { method: "POST", body: JSON.stringify({ ...propForm, gameId: selectedGameId, line: Number(propForm.line) }) });
      setPropForm({ playerId: "", statType: STAT_TYPES[0], line: "" });
      loadWeeks();
      flash("Prop created");
    } catch (err: any) { flash(err.message, true); }
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
      loadWeeks();
      flash("Week resolved — balances updated");
    } catch (err: any) { flash(err.message, true); }
  }

  const tabStyle = (t: string) => ({
    padding: "8px 16px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: tab === t ? "#fff" : "transparent",
    color: tab === t ? "#000" : "#888",
    fontWeight: tab === t ? 700 : 400,
  });

  return (
    <>
      <nav className="nav">
        <strong>Playbook</strong>
        <Link href="/leagues">Leagues</Link>
      </nav>

      <div className="page">
        <h1>Admin</h1>
        <p className="subtitle">Manage schedule and resolve weeks</p>

        {msg && <p style={{ color: "#6fcf6f", marginBottom: 12 }}>{msg}</p>}
        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#1a1a1a", borderRadius: 8, padding: 4 }}>
          <button style={tabStyle("players")} onClick={() => setTab("players")}>Players</button>
          <button style={tabStyle("schedule")} onClick={() => setTab("schedule")}>Schedule</button>
          <button style={tabStyle("resolve")} onClick={() => setTab("resolve")}>Resolve</button>
        </div>

        {/* PLAYERS TAB */}
        {tab === "players" && (
          <>
            <h2>Create Player</h2>
            <div className="card">
              <form className="form" onSubmit={createPlayer}>
                <input placeholder="Name" value={playerForm.name} onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })} required />
                <input placeholder="Team (e.g. KC)" value={playerForm.team} onChange={(e) => setPlayerForm({ ...playerForm, team: e.target.value })} required />
                <input placeholder="Position (e.g. QB)" value={playerForm.position} onChange={(e) => setPlayerForm({ ...playerForm, position: e.target.value })} required />
                <button type="submit">Add Player</button>
              </form>
            </div>

            <h2>Players ({players.length})</h2>
            {players.length === 0 && <div className="card"><p style={{ color: "#888" }}>No players yet.</p></div>}
            {players.map((p: any) => (
              <div key={p.id} className="card">
                <div className="row">
                  <div>
                    <strong>{p.name}</strong>
                    <div style={{ color: "#888", fontSize: "0.85rem" }}>{p.position} · {p.team}</div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* SCHEDULE TAB */}
        {tab === "schedule" && (
          <>
            <h2>Create Week</h2>
            <div className="card">
              <form className="form" onSubmit={createWeek}>
                <input type="number" placeholder="Week number" value={weekForm.number} onChange={(e) => setWeekForm({ ...weekForm, number: e.target.value })} required />
                <input type="date" placeholder="Start date" value={weekForm.startDate} onChange={(e) => setWeekForm({ ...weekForm, startDate: e.target.value })} required />
                <input type="date" placeholder="End date" value={weekForm.endDate} onChange={(e) => setWeekForm({ ...weekForm, endDate: e.target.value })} required />
                <button type="submit">Create Week</button>
              </form>
            </div>

            <h2>Add Game</h2>
            <div className="card">
              <form className="form" onSubmit={createGame}>
                <select value={selectedWeekId} onChange={(e) => { setSelectedWeekId(e.target.value); loadGamesForWeek(e.target.value); }} required style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: "10px 12px" }}>
                  <option value="">Select week</option>
                  {weeks.filter((w) => !w.resolved).map((w: any) => (
                    <option key={w.id} value={w.id}>Week {w.number}</option>
                  ))}
                </select>
                <input placeholder="Home team (e.g. KC)" value={gameForm.homeTeam} onChange={(e) => setGameForm({ ...gameForm, homeTeam: e.target.value })} required />
                <input placeholder="Away team (e.g. BUF)" value={gameForm.awayTeam} onChange={(e) => setGameForm({ ...gameForm, awayTeam: e.target.value })} required />
                <input type="datetime-local" value={gameForm.gameDate} onChange={(e) => setGameForm({ ...gameForm, gameDate: e.target.value })} required />
                <button type="submit">Add Game</button>
              </form>
            </div>

            <h2>Add Prop</h2>
            <div className="card">
              <form className="form" onSubmit={createProp}>
                <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} required style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: "10px 12px" }}>
                  <option value="">Select game</option>
                  {games.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.homeTeam} vs {g.awayTeam}</option>
                  ))}
                </select>
                <select value={propForm.playerId} onChange={(e) => setPropForm({ ...propForm, playerId: e.target.value })} required style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: "10px 12px" }}>
                  <option value="">Select player</option>
                  {players.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.team})</option>
                  ))}
                </select>
                <select value={propForm.statType} onChange={(e) => setPropForm({ ...propForm, statType: e.target.value })} style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: "10px 12px" }}>
                  {STAT_TYPES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
                </select>
                <input type="number" placeholder="Line (e.g. 275.5)" value={propForm.line} onChange={(e) => setPropForm({ ...propForm, line: e.target.value })} required />
                <button type="submit">Add Prop</button>
              </form>
            </div>

            <h2>Weeks</h2>
            {weeks.map((w: any) => (
              <div key={w.id} className="card">
                <div className="row" style={{ marginBottom: w.games?.length ? 12 : 0 }}>
                  <strong>Week {w.number}</strong>
                  <span className="badge">{w.resolved ? "Resolved" : "Active"}</span>
                </div>
                {w.games?.map((g: any) => (
                  <div key={g.id} style={{ marginLeft: 12, marginBottom: 8 }}>
                    <div style={{ color: "#ccc", fontSize: "0.9rem" }}>{g.homeTeam} vs {g.awayTeam}</div>
                    {g.props?.map((p: any) => (
                      <div key={p.id} style={{ color: "#888", fontSize: "0.8rem", marginLeft: 12 }}>
                        {p.player?.name} — {p.statType.replaceAll("_", " ")} {p.line}
                        {p.result != null && <span style={{ color: "#6fcf6f" }}> → {p.result}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* RESOLVE TAB */}
        {tab === "resolve" && (
          <>
            <h2>Resolve Week</h2>
            <div className="card" style={{ marginBottom: 16 }}>
              <select
                value={resolveWeekId}
                onChange={(e) => { setResolveWeekId(e.target.value); loadPropsForResolve(e.target.value); }}
                style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: "10px 12px", width: "100%" }}
              >
                <option value="">Select week to resolve</option>
                {weeks.filter((w) => !w.resolved).map((w: any) => (
                  <option key={w.id} value={w.id}>Week {w.number}</option>
                ))}
              </select>
            </div>

            {resolveProps.length > 0 && (
              <form onSubmit={resolveWeek}>
                {resolveProps.map((prop: any) => (
                  <div key={prop.id} className="card">
                    <div style={{ marginBottom: 8 }}>
                      <strong>{prop.player?.name}</strong>
                      <span className="tag" style={{ marginLeft: 8 }}>{prop.statType.replaceAll("_", " ")}</span>
                      <span style={{ color: "#888", marginLeft: 8, fontSize: "0.85rem" }}>line: {prop.line}</span>
                    </div>
                    <input
                      type="number"
                      placeholder="Actual result"
                      value={results[prop.id] ?? ""}
                      onChange={(e) => setResults((prev) => ({ ...prev, [prop.id]: e.target.value }))}
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
                <button type="submit" style={{ width: "100%", marginTop: 8 }}>Resolve Week →</button>
              </form>
            )}

            {resolveWeekId && resolveProps.length === 0 && (
              <div className="card"><p style={{ color: "#888" }}>No props for this week.</p></div>
            )}
          </>
        )}
      </div>
    </>
  );
}
