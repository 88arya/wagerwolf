"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function LeagueSettingsPage({ params }: PageProps<"/leagues/[leagueId]/settings">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [league, setLeague] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [pendingMembers, setPendingMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [copied, setCopied] = useState(false);

  // Season structure form
  const [settingsForm, setSettingsForm] = useState({
    startWeek: "", regularSeasonWeeks: "", playoffSize: "", consolationWeeks: "", maxPublicPlayers: "",
  });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Betting rules form
  const [limitsForm, setLimitsForm] = useState({ maxStakePerBet: "", maxBetsPerWeek: "", maxParlayLegs: "", feedVisibility: "AFTER_KICKOFF" });
  const [limitsError, setLimitsError] = useState("");
  const [limitsSaved, setLimitsSaved] = useState(false);

  // Playoffs
  const [playoffMatchups, setPlayoffMatchups] = useState<any[]>([]);
  const [consolationMatchups, setConsolationMatchups] = useState<any[]>([]);
  const [showPlayoffs, setShowPlayoffs] = useState(false);
  const [showConsolation, setShowConsolation] = useState(false);
  const [playoffWeekInput, setPlayoffWeekInput] = useState("");
  const [advanceRound, setAdvanceRound] = useState("");
  const [advanceWeek, setAdvanceWeek] = useState("");
  const [consolationWeekInput, setConsolationWeekInput] = useState("");
  const [consolationAdvanceRound, setConsolationAdvanceRound] = useState("");
  const [consolationAdvanceWeek, setConsolationAdvanceWeek] = useState("");

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const uid = localStorage.getItem("userId")!;
      setUserId(uid);
      const { leagueId: lid } = await params;
      setLeagueId(lid);

      const leagueData = await api(`/leagues/${lid}`);
      if (leagueData.creatorId !== uid) { router.push(`/leagues/${lid}`); return; }

      setLeague(leagueData);
      setSettingsForm({
        startWeek: String(leagueData.startWeek ?? 1),
        regularSeasonWeeks: String(leagueData.regularSeasonWeeks ?? 13),
        playoffSize: String(leagueData.playoffSize ?? 4),
        consolationWeeks: String(leagueData.consolationWeeks ?? 2),
        maxPublicPlayers: String(leagueData.maxPublicPlayers ?? 0),
      });
      setLimitsForm({
        maxStakePerBet: leagueData.maxStakePerBet != null ? String(leagueData.maxStakePerBet) : "",
        maxBetsPerWeek: leagueData.maxBetsPerWeek != null ? String(leagueData.maxBetsPerWeek) : "",
        maxParlayLegs: leagueData.maxParlayLegs != null ? String(leagueData.maxParlayLegs) : "",
        feedVisibility: leagueData.feedVisibility ?? "AFTER_KICKOFF",
      });

      try {
        const [board, pending, allMatchups] = await Promise.all([
          api(`/leagues/${lid}/leaderboard`),
          api(`/leagues/${lid}/pending`),
          api(`/leagues/${lid}/matchups`),
        ]);
        setMembers(board);
        setPendingMembers(pending);
        setPlayoffMatchups(allMatchups.filter((m: any) => m.isPlayoff));
        setConsolationMatchups(allMatchups.filter((m: any) => m.isConsolation));
      } catch {}
    }
    load();
  }, []);

  function copyCode() {
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove this member?")) return;
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function acceptMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}/accept`, { method: "POST", body: JSON.stringify({}) });
      setPendingMembers((prev) => prev.filter((m) => m.userId !== memberId));
      const board = await api(`/leagues/${leagueId}/leaderboard`);
      setMembers(board);
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function rejectMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setPendingMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function startSeason() {
    try {
      await api(`/leagues/${leagueId}/season/start`, { method: "POST" });
      setLeague(await api(`/leagues/${leagueId}`));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function deleteLeague() {
    if (!confirm(`Permanently delete "${league?.name}"? This cannot be undone.`)) return;
    try {
      await api(`/leagues/${leagueId}`, { method: "DELETE" });
      router.push("/leagues");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function startPlayoffs(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await api(`/leagues/${leagueId}/season/playoffs/start`, {
        method: "POST",
        body: JSON.stringify({ weekNumber: Number(playoffWeekInput) }),
      });
      alert(`Playoffs started! Round 1 created for Week ${data.weekNumber}`);
      setPlayoffMatchups((prev) => [...prev, ...data.bracket]);
      setPlayoffWeekInput("");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function advancePlayoffs(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await api(`/leagues/${leagueId}/season/playoffs/advance`, {
        method: "POST",
        body: JSON.stringify({ completedRound: Number(advanceRound), nextWeekNumber: Number(advanceWeek) }),
      });
      if (data.champion) {
        alert(`Playoffs complete! Champion: ${data.champion.displayName}`);
        setLeague((l: any) => ({ ...l, seasonEnded: true, championId: data.champion.userId }));
      } else {
        alert(`Round ${data.round} matchups created for Week ${data.weekNumber}`);
        setPlayoffMatchups((prev) => [...prev, ...data.bracket]);
      }
      setAdvanceRound(""); setAdvanceWeek("");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function startConsolation(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await api(`/leagues/${leagueId}/season/consolation/start`, {
        method: "POST",
        body: JSON.stringify({ weekNumber: Number(consolationWeekInput) }),
      });
      alert(`Consolation bracket started for Week ${data.weekNumber}`);
      setConsolationMatchups((prev) => [...prev, ...data.bracket]);
      setConsolationWeekInput("");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function advanceConsolation(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await api(`/leagues/${leagueId}/season/consolation/advance`, {
        method: "POST",
        body: JSON.stringify({ completedRound: Number(consolationAdvanceRound), nextWeekNumber: Number(consolationAdvanceWeek) }),
      });
      if (data.winner) {
        alert(`Consolation complete! Winner: ${data.winner.displayName}`);
      } else {
        alert(`Consolation Round ${data.round} created for Week ${data.weekNumber}`);
        setConsolationMatchups((prev) => [...prev, ...data.bracket]);
      }
      setConsolationAdvanceRound(""); setConsolationAdvanceWeek("");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError(""); setSettingsSaved(false);
    try {
      const updated = await api(`/leagues/${leagueId}`, {
        method: "PATCH",
        body: JSON.stringify({
          startWeek: Number(settingsForm.startWeek),
          regularSeasonWeeks: Number(settingsForm.regularSeasonWeeks),
          playoffSize: Number(settingsForm.playoffSize),
          consolationWeeks: Number(settingsForm.consolationWeeks),
          maxPublicPlayers: Number(settingsForm.maxPublicPlayers),
        }),
      });
      setLeague(updated); setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err: any) {
      try { setSettingsError(JSON.parse(err.message).error); } catch { setSettingsError(err.message); }
    }
  }

  async function saveLimits(e: React.FormEvent) {
    e.preventDefault();
    setLimitsError(""); setLimitsSaved(false);
    try {
      const updated = await api(`/leagues/${leagueId}/limits`, {
        method: "PATCH",
        body: JSON.stringify({
          maxStakePerBet: limitsForm.maxStakePerBet === "" ? null : Number(limitsForm.maxStakePerBet),
          maxBetsPerWeek: limitsForm.maxBetsPerWeek === "" ? null : Number(limitsForm.maxBetsPerWeek),
          maxParlayLegs: limitsForm.maxParlayLegs === "" ? null : Number(limitsForm.maxParlayLegs),
          feedVisibility: limitsForm.feedVisibility,
        }),
      });
      setLeague(updated); setLimitsSaved(true);
      setTimeout(() => setLimitsSaved(false), 2500);
    } catch (err: any) {
      try { setLimitsError(JSON.parse(err.message).error); } catch { setLimitsError(err.message); }
    }
  }

  if (!league) return <div className="loading">Loading…</div>;

  const sw = Number(settingsForm.startWeek) || 1;
  const rsw = Number(settingsForm.regularSeasonWeeks) || 13;
  const ps = Number(settingsForm.playoffSize) || 4;
  const pw = ps >= 2 ? Math.ceil(Math.log2(ps)) : 0;
  const endWeek = sw + rsw + pw - 1;
  const overLimit = endWeek > 18;
  const maxTeams = league.maxTeams ?? 10;
  const maxPlayoffRound = playoffMatchups.length > 0 ? Math.max(...playoffMatchups.map((m) => m.playoffRound ?? 1)) : 0;
  const maxConsolationRound = consolationMatchups.length > 0 ? Math.max(...consolationMatchups.map((m) => m.playoffRound ?? 1)) : 0;

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Commissioner</span>
      </nav>

      <div className="page" style={{ paddingBottom: 100 }}>
        <div style={{ marginBottom: 18 }}>
          <h1>Manage League</h1>
          <p className="subtitle">{league.name}</p>
        </div>

        {/* Invite Code */}
        <div className="section-title" style={{ marginBottom: 8 }}>Invite Code</div>
        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="invite-code">{league.inviteCode}</div>
            <button className="secondary" style={{ fontSize: "0.78rem", padding: "7px 14px" }} onClick={copyCode}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Join Requests */}
        {pendingMembers.length > 0 && (
          <>
            <div className="section-title" style={{ marginBottom: 8 }}>
              Join Requests
              <span className="badge badge-blue" style={{ marginLeft: 8 }}>{pendingMembers.length}</span>
            </div>
            <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
              {pendingMembers.map((m: any, idx: number) => (
                <div key={m.userId} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "11px 14px",
                  borderBottom: idx < pendingMembers.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div className="avatar" style={{ width: 30, height: 30, fontSize: "0.65rem" }}>
                      {m.user.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{m.user.displayName}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="secondary" style={{ fontSize: "0.72rem", padding: "5px 10px", color: "var(--win)", borderColor: "var(--win-border)" }} onClick={() => acceptMember(m.userId)}>Accept</button>
                    <button className="ghost" style={{ fontSize: "0.72rem", padding: "5px 10px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={() => rejectMember(m.userId)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Members */}
        <div className="section-title" style={{ marginBottom: 8 }}>
          Members
          <span style={{ color: "var(--text-3)", fontWeight: 500, fontSize: "0.78rem", marginLeft: 6 }}>({members.length})</span>
        </div>
        <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
          {members.map((m: any, idx: number) => (
            <div key={m.userId} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div className="avatar" style={{ width: 28, height: 28, fontSize: "0.63rem" }}>{m.displayName.slice(0, 2).toUpperCase()}</div>
                <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                  {m.displayName}
                  {m.userId === userId && <span className="badge" style={{ marginLeft: 6 }}>you</span>}
                </span>
              </div>
              {m.userId !== userId && !league.seasonStarted && (
                <button className="ghost" style={{ fontSize: "0.7rem", padding: "4px 9px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={() => removeMember(m.userId)}>Remove</button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="empty" style={{ padding: "16px 0" }}>
              <div className="empty-text">No members yet</div>
            </div>
          )}
        </div>

        {/* Season Management */}
        <div className="section-title" style={{ marginBottom: 8 }}>Season</div>

        {!league.seasonStarted && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-2)", marginBottom: 10 }}>
              {members.length % 2 !== 0
                ? `Need even number of members (currently ${members.length})`
                : `${members.length} members ready to start`}
            </div>
            <button onClick={startSeason} disabled={members.length < 2 || members.length % 2 !== 0} style={{ width: "100%", padding: "12px", marginBottom: 8 }}>
              Start Season →
            </button>
            {members.length <= 1 && (
              <button className="ghost" style={{ width: "100%", fontSize: "0.8rem", padding: "9px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={deleteLeague}>
                Delete League
              </button>
            )}
          </div>
        )}

        {league.seasonStarted && !league.seasonEnded && (
          <>
            {/* Playoffs */}
            <div className="card" style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => setShowPlayoffs(!showPlayoffs)}
                style={{ width: "100%", background: "transparent", color: "var(--text)", border: "none", borderRadius: 0, padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 700, fontSize: "0.88rem" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Playoffs</span>
                  {playoffMatchups.length > 0 && <span className="badge badge-blue">Round {maxPlayoffRound}</span>}
                </div>
                <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>{showPlayoffs ? "▲" : "▼"}</span>
              </button>
              {showPlayoffs && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
                  {playoffMatchups.length === 0 ? (
                    <form onSubmit={startPlayoffs} style={{ display: "flex", gap: 8, paddingTop: 12 }}>
                      <input type="number" placeholder="Start week #" value={playoffWeekInput} onChange={(e) => setPlayoffWeekInput(e.target.value)} style={{ flex: 1, fontSize: "0.82rem" }} required />
                      <button type="submit" style={{ fontSize: "0.82rem", padding: "9px 14px" }}>Start →</button>
                    </form>
                  ) : (
                    <div style={{ paddingTop: 10 }}>
                      {playoffMatchups.filter((m) => m.playoffRound === maxPlayoffRound).map((m: any) => (
                        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                          <span style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>{m.homeUser?.displayName ?? "?"} <span style={{ color: "var(--text-3)" }}>vs</span> {m.awayUser?.displayName ?? "?"}</span>
                          {m.winnerId && <span style={{ color: "var(--win)", fontSize: "0.72rem", fontWeight: 700 }}>✓ Done</span>}
                        </div>
                      ))}
                      <form onSubmit={advancePlayoffs} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 10 }}>
                        <input type="number" placeholder="Round #" value={advanceRound} onChange={(e) => setAdvanceRound(e.target.value)} style={{ fontSize: "0.8rem" }} required />
                        <input type="number" placeholder="Next week #" value={advanceWeek} onChange={(e) => setAdvanceWeek(e.target.value)} style={{ fontSize: "0.8rem" }} required />
                        <button type="submit" style={{ fontSize: "0.8rem", padding: "9px 12px" }}>Advance →</button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Consolation */}
            {league.consolationTeams >= 2 && (
              <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => setShowConsolation(!showConsolation)}
                  style={{ width: "100%", background: "transparent", color: "var(--text)", border: "none", borderRadius: 0, padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 700, fontSize: "0.88rem" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>Consolation</span>
                    <span style={{ color: "var(--text-3)", fontSize: "0.78rem", fontWeight: 400 }}>({league.consolationTeams} teams)</span>
                    {consolationMatchups.length > 0 && <span className="badge">R{maxConsolationRound}</span>}
                  </div>
                  <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>{showConsolation ? "▲" : "▼"}</span>
                </button>
                {showConsolation && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
                    {consolationMatchups.length === 0 ? (
                      <form onSubmit={startConsolation} style={{ display: "flex", gap: 8, paddingTop: 12 }}>
                        <input type="number" placeholder="Start week #" value={consolationWeekInput} onChange={(e) => setConsolationWeekInput(e.target.value)} style={{ flex: 1, fontSize: "0.82rem" }} required />
                        <button type="submit" style={{ fontSize: "0.82rem", padding: "9px 14px" }}>Start →</button>
                      </form>
                    ) : (
                      <div style={{ paddingTop: 10 }}>
                        {consolationMatchups.filter((m) => m.playoffRound === maxConsolationRound).map((m: any) => (
                          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                            <span style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>{m.homeUser?.displayName ?? "?"} <span style={{ color: "var(--text-3)" }}>vs</span> {m.awayUser?.displayName ?? "?"}</span>
                            {m.winnerId && <span style={{ color: "var(--win)", fontSize: "0.72rem", fontWeight: 700 }}>✓ Done</span>}
                          </div>
                        ))}
                        <form onSubmit={advanceConsolation} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 10 }}>
                          <input type="number" placeholder="Round #" value={consolationAdvanceRound} onChange={(e) => setConsolationAdvanceRound(e.target.value)} style={{ fontSize: "0.8rem" }} required />
                          <input type="number" placeholder="Next week #" value={consolationAdvanceWeek} onChange={(e) => setConsolationAdvanceWeek(e.target.value)} style={{ fontSize: "0.8rem" }} required />
                          <button type="submit" style={{ fontSize: "0.8rem", padding: "9px 12px" }}>Advance →</button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {league.seasonEnded && (
          <div className="card" style={{ marginBottom: 10 }}>
            <span className="badge badge-blue">Season Complete</span>
          </div>
        )}

        {/* Season Structure */}
        <div className="section-title" style={{ marginBottom: 8 }}>Season Structure</div>
        {league.seasonStarted ? (
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>
              Season structure is locked after the season starts.
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 10 }}>
            <form onSubmit={saveSettings} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div className="label">Start Week</div>
                  <input type="number" min="1" max="17" value={settingsForm.startWeek}
                    onChange={(e) => setSettingsForm({ ...settingsForm, startWeek: e.target.value })} required />
                </div>
                <div>
                  <div className="label">Reg Season Weeks</div>
                  <input type="number" min="1" value={settingsForm.regularSeasonWeeks}
                    onChange={(e) => setSettingsForm({ ...settingsForm, regularSeasonWeeks: e.target.value })} required />
                </div>
                <div>
                  <div className="label">Playoff Teams</div>
                  <input type="number" min="2" max={maxTeams - 1} value={settingsForm.playoffSize}
                    onChange={(e) => setSettingsForm({ ...settingsForm, playoffSize: e.target.value })} required />
                </div>
                <div>
                  <div className="label">Consolation Weeks</div>
                  <input type="number" min="1" value={settingsForm.consolationWeeks}
                    onChange={(e) => setSettingsForm({ ...settingsForm, consolationWeeks: e.target.value })} required />
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <div className="label">Public Fill Slots</div>
                  <input type="number" min="0" max={maxTeams} placeholder="0 = invite-only"
                    value={settingsForm.maxPublicPlayers}
                    onChange={(e) => setSettingsForm({ ...settingsForm, maxPublicPlayers: e.target.value })} />
                  <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 4 }}>
                    Allow random players to fill open slots
                  </div>
                </div>
              </div>
              <div style={{ fontSize: "0.72rem", color: overLimit ? "var(--loss)" : "var(--text-3)" }}>
                {overLimit
                  ? `Season ends week ${endWeek}, exceeds week 18`
                  : `Ends NFL week ${endWeek} · ${maxTeams - ps} consolation teams · ${pw} playoff weeks`}
              </div>
              {settingsError && <p className="error">{settingsError}</p>}
              <button type="submit" className="secondary">
                {settingsSaved ? "✓ Saved" : "Save Season Settings"}
              </button>
            </form>
          </div>
        )}

        {/* Betting Rules */}
        <div className="section-title" style={{ marginBottom: 8 }}>Betting Rules</div>
        <div className="card" style={{ marginBottom: 10 }}>
          <form onSubmit={saveLimits} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="label">Max Stake / Bet</div>
                <input type="number" min="1" placeholder="No limit" value={limitsForm.maxStakePerBet}
                  onChange={(e) => setLimitsForm({ ...limitsForm, maxStakePerBet: e.target.value })} />
              </div>
              <div>
                <div className="label">Max Bets / Week</div>
                <input type="number" min="1" placeholder="No limit" value={limitsForm.maxBetsPerWeek}
                  onChange={(e) => setLimitsForm({ ...limitsForm, maxBetsPerWeek: e.target.value })} />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <div className="label">Max Parlay Legs</div>
                <input type="number" min="2" placeholder="No limit" value={limitsForm.maxParlayLegs}
                  onChange={(e) => setLimitsForm({ ...limitsForm, maxParlayLegs: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 8 }}>Bet Feed Visibility</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { value: "AFTER_KICKOFF", label: "After kickoff" },
                  { value: "AFTER_RESOLVE", label: "After week resolves" },
                ].map(({ value, label }) => {
                  const active = limitsForm.feedVisibility === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLimitsForm({ ...limitsForm, feedVisibility: value })}
                      style={{
                        flex: 1, padding: "9px 10px", borderRadius: 6, fontSize: "0.8rem",
                        fontWeight: active ? 800 : 500,
                        background: active ? "var(--accent)" : "var(--surface-2)",
                        color: active ? "#0a1628" : "var(--text-2)",
                        border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border-2)",
                        transition: "all 0.12s",
                      }}
                    >{label}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 6 }}>
                When members can see each other's bets
              </div>
            </div>

            <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>
              Leave blank for no limit. Changes apply immediately.
            </div>
            {limitsError && <p className="error">{limitsError}</p>}
            <button type="submit" className="secondary">
              {limitsSaved ? "✓ Saved" : "Save Betting Rules"}
            </button>
          </form>
        </div>
      </div>

      <BottomNav leagueId={leagueId} isCreator={true} />
    </>
  );
}
