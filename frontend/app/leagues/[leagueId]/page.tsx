"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function DashboardPage({ params }: PageProps<"/leagues/[leagueId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [membership, setMembership] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [week, setWeek] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [showStandings, setShowStandings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [matchup, setMatchup] = useState<any>(null);
  const [playoffWeekInput, setPlayoffWeekInput] = useState("");
  const [advanceRound, setAdvanceRound] = useState("");
  const [advanceWeek, setAdvanceWeek] = useState("");
  const [playoffMatchups, setPlayoffMatchups] = useState<any[]>([]);
  const [consolationMatchups, setConsolationMatchups] = useState<any[]>([]);
  const [consolationWeekInput, setConsolationWeekInput] = useState("");
  const [consolationAdvanceRound, setConsolationAdvanceRound] = useState("");
  const [consolationAdvanceWeek, setConsolationAdvanceWeek] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ startWeek: "", regularSeasonWeeks: "", playoffSize: "", consolationWeeks: "", maxPublicPlayers: "" });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [pendingMembers, setPendingMembers] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId } = await params;
      setLeagueId(leagueId);

      const [memberships, leagueData] = await Promise.all([
        api("/memberships"),
        api(`/leagues/${leagueId}`),
      ]);
      setMembership(memberships.find((m: any) => m.leagueId === leagueId) ?? null);
      setLeague(leagueData);

      if (leagueData.creatorId === id) {
        try { setPendingMembers(await api(`/leagues/${leagueId}/pending`)); } catch {}
      }

      setSettingsForm({
        startWeek: String(leagueData.startWeek ?? 1),
        regularSeasonWeeks: String(leagueData.regularSeasonWeeks ?? 13),
        playoffSize: String(leagueData.playoffSize ?? 4),
        consolationWeeks: String(leagueData.consolationWeeks ?? 2),
        maxPublicPlayers: String(leagueData.maxPublicPlayers ?? 0),
      });

      try {
        const [weeks, board] = await Promise.all([
          api(`/weeks?current=true&leagueId=${leagueId}`),
          api(`/leagues/${leagueId}/leaderboard`),
        ]);
        const currentWeek = weeks?.[0] ?? null;
        if (currentWeek) setWeek(currentWeek);
        setMembers(board);

        if (currentWeek) {
          const weekMatchups = await api(`/leagues/${leagueId}/matchups?weekNumber=${currentWeek.number}`);
          const mine = weekMatchups.find((m: any) => m.homeUserId === id || m.awayUserId === id);
          setMatchup(mine ?? null);
        }

        // Load all playoff and consolation matchups
        const allMatchups = await api(`/leagues/${leagueId}/matchups`);
        setPlayoffMatchups(allMatchups.filter((m: any) => m.isPlayoff));
        setConsolationMatchups(allMatchups.filter((m: any) => m.isConsolation));
      } catch {}
    }
    load();
  }, []);

  async function removeMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function startSeason() {
    try {
      await api(`/leagues/${leagueId}/season/start`, { method: "POST" });
      const leagueData = await api(`/leagues/${leagueId}`);
      setLeague(leagueData);
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
      alert(`Playoffs started! Round 1 matchups created for Week ${data.weekNumber}`);
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
      } else {
        alert(`Round ${data.round} matchups created for Week ${data.weekNumber}`);
        setPlayoffMatchups((prev) => [...prev, ...data.bracket]);
      }
      setAdvanceRound("");
      setAdvanceWeek("");
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
      alert(`Consolation bracket started! Round 1 matchups created for Week ${data.weekNumber}`);
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
        alert(`Consolation Round ${data.round} matchups created for Week ${data.weekNumber}`);
        setConsolationMatchups((prev) => [...prev, ...data.bracket]);
      }
      setConsolationAdvanceRound("");
      setConsolationAdvanceWeek("");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError("");
    setSettingsSaved(false);
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
      setLeague(updated);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err: any) {
      try { setSettingsError(JSON.parse(err.message).error); } catch { setSettingsError(err.message); }
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

  async function leaveLeague() {
    if (!confirm(`Leave "${league?.name}"?`)) return;
    try {
      await api(`/leagues/${leagueId}/leave`, { method: "POST", body: JSON.stringify({}) });
      router.push("/leagues");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function deleteLeague() {
    if (!confirm(`Delete "${league?.name}"? This cannot be undone.`)) return;
    try {
      await api(`/leagues/${leagueId}`, { method: "DELETE" });
      router.push("/leagues");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  const isCreator = league?.creatorId === userId;
  const myRank = members.findIndex((m) => m.userId === userId) + 1;
  const myRecord = members.find((m) => m.userId === userId);

  // Determine season phase
  const regularSeasonWeeks = league?.regularSeasonWeeks ?? 13;
  const startWeek = league?.startWeek ?? 1;
  const playoffStartWeek = startWeek + regularSeasonWeeks;
  const isPlayoffWeek = week && week.number >= playoffStartWeek;
  const seasonPhase = !week ? null : isPlayoffWeek ? "Playoffs" : "Regular Season";
  const leagueWeekNum = week ? week.number - startWeek + 1 : null;
  const playoffWeekNum = week && isPlayoffWeek ? week.number - playoffStartWeek + 1 : null;
  const weekLabel = week
    ? isPlayoffWeek
      ? `Playoff Week ${playoffWeekNum}`
      : `League Week ${leagueWeekNum} of ${regularSeasonWeeks}`
    : null;

  // Max playoff round already generated
  const maxPlayoffRound = playoffMatchups.length > 0 ? Math.max(...playoffMatchups.map((m) => m.playoffRound ?? 1)) : 0;

  if (!league) return <div className="loading">Loading…</div>;

  const weekStatus = week?.resolved ? "FINAL" : week?.locked ? "LOCKED" : week ? "LIVE" : null;
  const weekStatusClass = week?.resolved ? "" : week?.locked ? "badge-red" : "badge-green";

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href="/leagues" style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>‹ Leagues</Link>
      </nav>

      <div className="page">
        {/* League header */}
        <div style={{ marginBottom: 20 }}>
          <h1>{league.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            {myRank > 0 && (
              <span style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>
                Rank #{myRank} of {members.length}
              </span>
            )}
            {seasonPhase && (
              <>
                <span style={{ color: "var(--border-2)" }}>·</span>
                <span className={`badge ${isPlayoffWeek ? "badge-red" : "badge-green"}`}>{seasonPhase}</span>
              </>
            )}
          </div>
        </div>

        {/* Champion banner */}
        {league.seasonEnded && (
          <div className="card" style={{ marginBottom: 10, background: "linear-gradient(135deg, rgba(204,0,0,0.08), rgba(204,0,0,0.02))", borderColor: "var(--accent)" }}>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>🏆</div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--accent)", marginBottom: 2 }}>Season Complete</div>
              <div style={{ color: "var(--text-2)", fontSize: "0.88rem" }}>
                Champion: <span style={{ fontWeight: 700, color: "var(--text)" }}>
                  {members.find((m) => m.userId === league.championId)?.displayName ?? "—"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Balance hero */}
        <div className="card" style={{ marginBottom: 10, borderLeft: "4px solid var(--accent)" }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="label">Your Balance</div>
              <div className="balance-big" style={{ marginTop: 4, color: "var(--text)" }}>
                ${(membership?.balance ?? 0).toLocaleString()}
              </div>
              <div style={{ marginTop: 6, color: "var(--text-3)", fontSize: "0.78rem", fontWeight: 600 }}>
                ${league.weeklyAllowance} / week · {weekLabel ?? "No active week"}
              </div>
            </div>
            {myRecord && (myRecord.wins > 0 || myRecord.losses > 0 || myRecord.ties > 0) && (
              <div style={{ textAlign: "right" }}>
                <div className="label">Record</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.02em", marginTop: 4 }}>
                  <span style={{ color: "var(--win)" }}>{myRecord.wins}</span>
                  <span style={{ color: "var(--text-3)", fontWeight: 400 }}>-</span>
                  <span style={{ color: "var(--loss)" }}>{myRecord.losses}</span>
                  {myRecord.ties > 0 && <span style={{ color: "var(--text-3)", fontWeight: 400 }}>-{myRecord.ties}</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Matchup widget */}
        {matchup && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="label" style={{ marginBottom: 8 }}>
              {matchup.isPlayoff ? "Playoff Matchup" : "This Week's Matchup"}
              {matchup.isPlayoff && matchup.playoffRound && (
                <span className="badge badge-red" style={{ marginLeft: 8 }}>Round {matchup.playoffRound}</span>
              )}
            </div>
            {(() => {
              const isHome = matchup.homeUserId === userId;
              const me = isHome ? matchup.homeUser : matchup.awayUser;
              const opp = isHome ? matchup.awayUser : matchup.homeUser;
              const myProfit = isHome ? matchup.homeProfit : matchup.awayProfit;
              const oppProfit = isHome ? matchup.awayProfit : matchup.homeProfit;
              const resolved = matchup.homeProfit != null;
              const iWon = matchup.winnerId === userId;
              const iLost = matchup.winnerId && matchup.winnerId !== userId;

              return (
                <div className="row">
                  <div style={{ textAlign: "center" }}>
                    <div className="avatar" style={{ margin: "0 auto 4px" }}>{me.displayName.slice(0, 2).toUpperCase()}</div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700 }}>You</div>
                    {resolved && (
                      <div style={{ fontSize: "1rem", fontWeight: 900, color: myProfit >= 0 ? "var(--win)" : "var(--loss)", marginTop: 2 }}>
                        {myProfit >= 0 ? "+" : ""}{myProfit}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {resolved ? (
                      <div style={{ fontWeight: 800, fontSize: "0.85rem", color: matchup.isTie ? "var(--text-2)" : iWon ? "var(--win)" : "var(--loss)" }}>
                        {matchup.isTie ? "TIE" : iWon ? "WIN" : "LOSS"}
                      </div>
                    ) : (
                      <div style={{ color: "var(--text-3)", fontWeight: 700, fontSize: "0.85rem" }}>VS</div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="avatar" style={{ margin: "0 auto 4px" }}>{opp.displayName.slice(0, 2).toUpperCase()}</div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700 }}>{opp.displayName}</div>
                    {resolved && (
                      <div style={{ fontSize: "1rem", fontWeight: 900, color: oppProfit >= 0 ? "var(--win)" : "var(--loss)", marginTop: 2 }}>
                        {oppProfit >= 0 ? "+" : ""}{oppProfit}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Standings table */}
        <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
          <div
            className="row"
            style={{ padding: "12px 16px", cursor: "pointer", borderBottom: showStandings ? "1px solid var(--border)" : "none" }}
            onClick={() => setShowStandings(!showStandings)}
          >
            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Standings</div>
            <span style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>{showStandings ? "▲" : "▼"}</span>
          </div>
          {showStandings && (
            <div>
              {/* Header row */}
              <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 60px 80px", padding: "6px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 700 }}>#</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 700 }}>PLAYER</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 700, textAlign: "center" }}>W-L-T</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 700, textAlign: "right" }}>BALANCE</span>
              </div>
              {members.map((m: any) => {
                const isMe = m.userId === userId;
                return (
                  <div
                    key={m.userId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr 60px 80px",
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--border)",
                      background: isMe ? "rgba(204,0,0,0.04)" : "transparent",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", color: m.rank <= 3 ? "var(--accent)" : "var(--text-3)", fontWeight: m.rank <= 3 ? 800 : 500 }}>
                      {m.rank}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="avatar" style={{ width: 26, height: 26, fontSize: "0.65rem", flexShrink: 0 }}>
                        {m.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: isMe ? 700 : 500, fontSize: "0.85rem", color: isMe ? "var(--text)" : "var(--text-2)" }}>
                        {m.displayName}
                        {isMe && <span style={{ color: "var(--accent)", marginLeft: 4, fontSize: "0.7rem" }}>you</span>}
                      </span>
                    </div>
                    <span style={{ textAlign: "center", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-2)" }}>
                      {m.wins}-{m.losses}{m.ties > 0 ? `-${m.ties}` : ""}
                    </span>
                    <span style={{ textAlign: "right", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>
                      ${m.balance.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Commissioner panel */}
        {isCreator && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="row" style={{ marginBottom: showMembers ? 16 : 0 }}>
              <div>
                <div className="label">Invite Code</div>
                <div className="invite-code" style={{ fontSize: "1.8rem", marginTop: 2 }}>{league.inviteCode}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <button className="secondary" style={{ fontSize: "0.78rem", padding: "6px 14px" }} onClick={copyCode}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
                <button className="ghost" style={{ fontSize: "0.78rem", padding: "6px 14px" }} onClick={() => setShowMembers(!showMembers)}>
                  Members
                </button>
              </div>
            </div>

            {/* Pending join requests */}
            {pendingMembers.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", marginBottom: 10 }}>
                  PENDING REQUESTS ({pendingMembers.length})
                </div>
                {pendingMembers.map((m: any) => (
                  <div key={m.userId} className="row" style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: "0.65rem" }}>
                        {m.user.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{m.user.displayName}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="secondary"
                        style={{ fontSize: "0.75rem", padding: "5px 12px", color: "var(--win)", borderColor: "rgba(34,197,94,0.4)" }}
                        onClick={() => acceptMember(m.userId)}
                      >
                        Accept
                      </button>
                      <button
                        className="ghost"
                        style={{ fontSize: "0.75rem", padding: "5px 12px", color: "var(--loss)", borderColor: "rgba(183,28,28,0.3)" }}
                        onClick={() => rejectMember(m.userId)}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!league.seasonStarted && (
              <>
                {/* Advanced settings */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <div
                    className="row"
                    style={{ cursor: "pointer", marginBottom: showSettings ? 14 : 0 }}
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>League Settings</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                        Wk {league.startWeek} · {league.regularSeasonWeeks} reg · {league.playoffSize} playoff
                      </span>
                      <span style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>{showSettings ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {showSettings && (() => {
                    const sw = Number(settingsForm.startWeek) || 1;
                    const rsw = Number(settingsForm.regularSeasonWeeks) || 13;
                    const ps = Number(settingsForm.playoffSize) || 4;
                    const pw = ps >= 2 ? Math.ceil(Math.log2(ps)) : 0;
                    const endWeek = sw + rsw + pw - 1;
                    const overLimit = endWeek > 18;
                    const maxTeams = league.maxTeams ?? 10;

                    return (
                      <form onSubmit={saveSettings}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                          <div>
                            <div className="label">Start Week (NFL)</div>
                            <input
                              type="number"
                              min="1"
                              max="17"
                              value={settingsForm.startWeek}
                              onChange={(e) => setSettingsForm({ ...settingsForm, startWeek: e.target.value })}
                              required
                            />
                          </div>
                          <div>
                            <div className="label">Reg Season Weeks</div>
                            <input
                              type="number"
                              min="1"
                              value={settingsForm.regularSeasonWeeks}
                              onChange={(e) => setSettingsForm({ ...settingsForm, regularSeasonWeeks: e.target.value })}
                              required
                            />
                          </div>
                          <div>
                            <div className="label">Playoff Teams</div>
                            <input
                              type="number"
                              min="2"
                              max={maxTeams - 1}
                              value={settingsForm.playoffSize}
                              onChange={(e) => setSettingsForm({ ...settingsForm, playoffSize: e.target.value })}
                              required
                            />
                          </div>
                          <div>
                            <div className="label">Consolation Weeks</div>
                            <input
                              type="number"
                              min="1"
                              value={settingsForm.consolationWeeks}
                              onChange={(e) => setSettingsForm({ ...settingsForm, consolationWeeks: e.target.value })}
                              required
                            />
                          </div>
                          <div style={{ gridColumn: "span 2" }}>
                            <div className="label">Public Fill Slots</div>
                            <input
                              type="number"
                              min="0"
                              max={maxTeams}
                              placeholder="0 = invite-only"
                              value={settingsForm.maxPublicPlayers}
                              onChange={(e) => setSettingsForm({ ...settingsForm, maxPublicPlayers: e.target.value })}
                            />
                            <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 4 }}>
                              Allow up to this many random players to fill open slots
                            </div>
                          </div>
                        </div>

                        <div style={{ fontSize: "0.75rem", color: overLimit ? "var(--loss)" : "var(--text-3)", marginBottom: 10 }}>
                          {overLimit
                            ? `⚠ Season ends NFL week ${endWeek}, exceeds week 18`
                            : `Ends NFL week ${endWeek} · ${league.maxTeams - ps} consolation teams · ${pw} playoff weeks`}
                        </div>

                        {settingsError && <p className="error" style={{ marginBottom: 8 }}>{settingsError}</p>}
                        <button type="submit" className="secondary" style={{ width: "100%", fontSize: "0.82rem", padding: "9px" }}>
                          {settingsSaved ? "✓ Saved" : "Save Settings"}
                        </button>
                      </form>
                    );
                  })()}
                </div>

                {/* Start season */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <div style={{ color: "var(--text-2)", fontSize: "0.8rem", marginBottom: 8 }}>
                    {members.length % 2 !== 0
                      ? `Need even number of members (currently ${members.length})`
                      : `${members.length} members ready — start when everyone has joined`}
                  </div>
                  <button
                    onClick={startSeason}
                    disabled={members.length < 2 || members.length % 2 !== 0}
                    style={{ width: "100%", padding: "12px" }}
                  >
                    Start Season →
                  </button>
                </div>

                {/* Delete league — only when commissioner is sole member */}
                {members.length <= 1 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <button
                      className="ghost"
                      style={{ width: "100%", fontSize: "0.82rem", padding: "9px", color: "var(--loss)", borderColor: "rgba(183,28,28,0.3)" }}
                      onClick={deleteLeague}
                    >
                      Delete League
                    </button>
                  </div>
                )}
              </>
            )}

            {league.seasonStarted && !league.seasonEnded && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span className="badge badge-green">Season Active</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>
                    {regularSeasonWeeks} reg season · {league.playoffSize} playoff teams
                  </span>
                </div>

                {playoffMatchups.length === 0 && (
                  <form onSubmit={startPlayoffs} style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      placeholder={`Playoff week # (after wk ${regularSeasonWeeks})`}
                      value={playoffWeekInput}
                      onChange={(e) => setPlayoffWeekInput(e.target.value)}
                      style={{ flex: 1, fontSize: "0.82rem" }}
                      required
                    />
                    <button type="submit" style={{ fontSize: "0.82rem", padding: "10px 14px", whiteSpace: "nowrap" }}>
                      Start Playoffs →
                    </button>
                  </form>
                )}

                {playoffMatchups.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 8, color: "var(--text)" }}>
                      Playoffs — Round {maxPlayoffRound}
                    </div>
                    {playoffMatchups.filter((m) => m.playoffRound === maxPlayoffRound).map((m: any) => (
                      <div key={m.id} style={{ fontSize: "0.82rem", padding: "6px 0", color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
                        {m.homeUser?.displayName ?? "?"} <span style={{ color: "var(--text-3)" }}>vs</span> {m.awayUser?.displayName ?? "?"}
                        {m.winnerId && <span style={{ color: "var(--win)", marginLeft: 8, fontWeight: 700 }}>✓</span>}
                      </div>
                    ))}
                    <form onSubmit={advancePlayoffs} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 12 }}>
                      <input
                        type="number"
                        placeholder="Completed round #"
                        value={advanceRound}
                        onChange={(e) => setAdvanceRound(e.target.value)}
                        style={{ fontSize: "0.82rem" }}
                        required
                      />
                      <input
                        type="number"
                        placeholder="Next week #"
                        value={advanceWeek}
                        onChange={(e) => setAdvanceWeek(e.target.value)}
                        style={{ fontSize: "0.82rem" }}
                        required
                      />
                      <button type="submit" style={{ fontSize: "0.82rem", padding: "10px 14px", whiteSpace: "nowrap" }}>
                        Advance →
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {league.seasonEnded && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <span className="badge">Season Complete</span>
              </div>
            )}

            {/* Consolation bracket — available once season starts, independent of playoffs */}
            {league.seasonStarted && !league.seasonEnded && league.consolationTeams >= 2 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 10, color: "var(--text-2)" }}>
                  Consolation ({league.consolationTeams} teams)
                </div>

                {consolationMatchups.length === 0 && (
                  <form onSubmit={startConsolation} style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      placeholder="Start week #"
                      value={consolationWeekInput}
                      onChange={(e) => setConsolationWeekInput(e.target.value)}
                      style={{ flex: 1, fontSize: "0.82rem" }}
                      required
                    />
                    <button type="submit" style={{ fontSize: "0.82rem", padding: "10px 14px", whiteSpace: "nowrap" }}>
                      Start →
                    </button>
                  </form>
                )}

                {consolationMatchups.length > 0 && (() => {
                  const maxRound = Math.max(...consolationMatchups.map((m) => m.playoffRound ?? 1));
                  return (
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-3)", marginBottom: 6 }}>Round {maxRound}</div>
                      {consolationMatchups.filter((m) => m.playoffRound === maxRound).map((m: any) => (
                        <div key={m.id} style={{ fontSize: "0.82rem", padding: "6px 0", color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
                          {m.homeUser?.displayName ?? "?"} <span style={{ color: "var(--text-3)" }}>vs</span> {m.awayUser?.displayName ?? "?"}
                          {m.winnerId && <span style={{ color: "var(--win)", marginLeft: 8, fontWeight: 700 }}>✓</span>}
                        </div>
                      ))}
                      <form onSubmit={advanceConsolation} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 10 }}>
                        <input
                          type="number"
                          placeholder="Completed round"
                          value={consolationAdvanceRound}
                          onChange={(e) => setConsolationAdvanceRound(e.target.value)}
                          style={{ fontSize: "0.82rem" }}
                          required
                        />
                        <input
                          type="number"
                          placeholder="Next week #"
                          value={consolationAdvanceWeek}
                          onChange={(e) => setConsolationAdvanceWeek(e.target.value)}
                          style={{ fontSize: "0.82rem" }}
                          required
                        />
                        <button type="submit" style={{ fontSize: "0.82rem", padding: "10px 14px", whiteSpace: "nowrap" }}>
                          Advance →
                        </button>
                      </form>
                    </div>
                  );
                })()}
              </div>
            )}

            {showMembers && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {members.map((m: any) => (
                  <div key={m.userId} className="row" style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="avatar" style={{ width: 30, height: 30, fontSize: "0.7rem" }}>
                        {m.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                        {m.displayName}
                        {m.userId === userId && <span className="badge" style={{ marginLeft: 6 }}>you</span>}
                      </span>
                    </div>
                    {m.userId !== userId && !league.seasonStarted && (
                      <button className="ghost" style={{ fontSize: "0.75rem", padding: "4px 10px", color: "var(--loss)", borderColor: "rgba(183,28,28,0.3)" }} onClick={() => removeMember(m.userId)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current week */}
        <h2>Current Week</h2>
        {week ? (
          <div className="card">
            <div className="row" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>
                {weekLabel}
                {isPlayoffWeek && <span className="badge badge-red" style={{ marginLeft: 8 }}>PLAYOFFS</span>}
              </div>
              {weekStatus && <span className={`badge ${weekStatusClass}`}>{weekStatus}</span>}
            </div>

            {week.games?.length ? week.games.map((game: any) => (
              <div key={game.id} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {game.homeTeam} <span style={{ fontWeight: 400 }}>vs</span> {game.awayTeam}
                  </div>
                  {game.status === "CANCELLED" && (
                    <span className="badge badge-red">CANCELLED</span>
                  )}
                  {game.status === "FINAL" && (
                    <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600 }}>
                      {game.homeScore}–{game.awayScore}
                    </span>
                  )}
                </div>
                {game.props?.map((prop: any) => (
                  <div key={prop.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 5 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)" }}>{prop.player?.name}</div>
                      <div style={{ color: "var(--text-3)", fontSize: "0.73rem", marginTop: 1 }}>
                        {prop.statType.replaceAll("_", " ")} · O/U {prop.line}
                      </div>
                    </div>
                    {prop.result != null ? (
                      <span className="badge badge-green">{prop.result}</span>
                    ) : (
                      <span style={{ color: "var(--text-3)", fontSize: "0.76rem", fontWeight: 600 }}>Pending</span>
                    )}
                  </div>
                ))}
              </div>
            )) : (
              <p style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>No games this week yet.</p>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="empty" style={{ padding: "24px 0" }}>
              <div className="empty-icon">📅</div>
              <div className="empty-text">No active week</div>
            </div>
          </div>
        )}

        {week && !week.locked && !week.resolved && (
          <Link href={`/leagues/${leagueId}/bet`}>
            <button style={{ width: "100%", marginTop: 4, padding: "15px" }}>Place Bets →</button>
          </Link>
        )}

        {!isCreator && !league.seasonStarted && membership && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button
              className="ghost"
              style={{ width: "100%", fontSize: "0.82rem", padding: "9px", color: "var(--loss)", borderColor: "rgba(183,28,28,0.3)" }}
              onClick={leaveLeague}
            >
              Leave League
            </button>
          </div>
        )}
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
