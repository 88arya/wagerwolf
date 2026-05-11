"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";
import TeamLogo from "@/components/TeamLogo";

export default function DashboardPage({ params }: PageProps<"/leagues/[leagueId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [membership, setMembership] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [week, setWeek] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [matchup, setMatchup] = useState<any>(null);
  const [playoffMatchups, setPlayoffMatchups] = useState<any[]>([]);
  const [consolationMatchups, setConsolationMatchups] = useState<any[]>([]);

  // Commissioner state
  const [pendingMembers, setPendingMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [showPlayoffs, setShowPlayoffs] = useState(false);
  const [showConsolation, setShowConsolation] = useState(false);
  const [copied, setCopied] = useState(false);

  // Playoff/consolation inputs
  const [playoffWeekInput, setPlayoffWeekInput] = useState("");
  const [advanceRound, setAdvanceRound] = useState("");
  const [advanceWeek, setAdvanceWeek] = useState("");
  const [consolationWeekInput, setConsolationWeekInput] = useState("");
  const [consolationAdvanceRound, setConsolationAdvanceRound] = useState("");
  const [consolationAdvanceWeek, setConsolationAdvanceWeek] = useState("");

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
          setMatchup(weekMatchups.find((m: any) => m.homeUserId === id || m.awayUserId === id) ?? null);
        }

        const allMatchups = await api(`/leagues/${leagueId}/matchups`);
        setPlayoffMatchups(allMatchups.filter((m: any) => m.isPlayoff));
        setConsolationMatchups(allMatchups.filter((m: any) => m.isConsolation));
      } catch {}
    }
    load();
  }, []);

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
    if (!confirm(`Permanently delete "${league?.name}"? This cannot be undone.`)) return;
    try {
      await api(`/leagues/${leagueId}`, { method: "DELETE" });
      router.push("/leagues");
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

  function copyCode() {
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isCreator = league?.creatorId === userId;
  const myRecord = members.find((m) => m.userId === userId);
  const myRank = myRecord?.rank ?? 0;

  const regularSeasonWeeks = league?.regularSeasonWeeks ?? 13;
  const startWeek = league?.startWeek ?? 1;
  const playoffStartWeek = startWeek + regularSeasonWeeks;
  const isPlayoffWeek = week && week.number >= playoffStartWeek;
  const leagueWeekNum = week ? week.number - startWeek + 1 : null;
  const playoffWeekNum = week && isPlayoffWeek ? week.number - playoffStartWeek + 1 : null;
  const weekLabel = week
    ? isPlayoffWeek
      ? `Playoff Week ${playoffWeekNum}`
      : `League Week ${leagueWeekNum} of ${regularSeasonWeeks}`
    : null;

  const maxPlayoffRound = playoffMatchups.length > 0 ? Math.max(...playoffMatchups.map((m) => m.playoffRound ?? 1)) : 0;
  const maxConsolationRound = consolationMatchups.length > 0 ? Math.max(...consolationMatchups.map((m) => m.playoffRound ?? 1)) : 0;

  const weekStatus = week?.resolved ? "Final" : week?.locked ? "Locked" : week ? "Live" : null;
  const weekStatusColor = week?.resolved ? "var(--text-3)" : week?.locked ? "var(--loss)" : "var(--win)";

  if (!league) return <div className="loading">Loading…</div>;

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href="/leagues" style={{ fontSize: "0.82rem" }}>‹ Leagues</Link>
      </nav>

      <div className="page">

        {/* Champion banner */}
        {league.seasonEnded && (
          <div style={{
            background: "linear-gradient(135deg, #7B4F00 0%, #C8960C 100%)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 20px",
            marginBottom: 12,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}>
            <div style={{ fontSize: "2rem" }}>🏆</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7, marginBottom: 2 }}>Season Complete</div>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>
                Champion: {members.find((m) => m.userId === league.championId)?.displayName ?? "—"}
              </div>
            </div>
          </div>
        )}

        {/* League header banner */}
        <div className="league-banner" style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
              {league.isPublic ? "Public League" : "Private League"}
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", color: "#fff" }}>
              {league.name}
            </div>
          </div>

          <div style={{ display: "flex", gap: 20 }}>
            <div>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>
                Balance
              </div>
              <div style={{ fontSize: "1.7rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                ${(membership?.balance ?? 0).toLocaleString()}
              </div>
            </div>
            {myRecord && (myRecord.wins > 0 || myRecord.losses > 0) && (
              <div>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>
                  Record
                </div>
                <div style={{ fontSize: "1.7rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1 }}>
                  {myRecord.wins}–{myRecord.losses}{myRecord.ties > 0 ? `–${myRecord.ties}` : ""}
                </div>
              </div>
            )}
            {myRank > 0 && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>
                  Rank
                </div>
                <div style={{ fontSize: "1.7rem", fontWeight: 900, letterSpacing: "-0.03em", color: myRank === 1 ? "var(--gold)" : "#fff", lineHeight: 1 }}>
                  #{myRank}
                </div>
              </div>
            )}
          </div>

          {weekLabel && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
                {weekLabel}
              </span>
              {weekStatus && (
                <span style={{
                  fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: weekStatusColor,
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: 4, padding: "2px 7px",
                }}>
                  {weekStatus}
                </span>
              )}
            </div>
          )}
        </div>

        {/* This week's matchup */}
        {matchup && !matchup.isBye && (
          <div className="card" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
              {matchup.isPlayoff ? `Playoffs · Round ${matchup.playoffRound}` : "This Week's Matchup"}
            </div>
            {(() => {
              const isHome = matchup.homeUserId === userId;
              const opp = isHome ? matchup.awayUser : matchup.homeUser;
              const myProfit = isHome ? matchup.homeProfit : matchup.awayProfit;
              const oppProfit = isHome ? matchup.awayProfit : matchup.homeProfit;
              const resolved = matchup.homeProfit != null;
              const iWon = matchup.winnerId === userId;
              const iLost = matchup.winnerId && matchup.winnerId !== userId;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
                  <div style={{ textAlign: "center" }}>
                    <div className="avatar" style={{ margin: "0 auto 6px", width: 40, height: 40 }}>
                      {(localStorage?.getItem("displayName") ?? "YO").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: 2 }}>You</div>
                    {resolved && (
                      <div style={{ fontSize: "1rem", fontWeight: 900, color: myProfit >= 0 ? "var(--win)" : "var(--loss)" }}>
                        {myProfit >= 0 ? "+" : ""}{myProfit}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: "center" }}>
                    {resolved ? (
                      <div style={{
                        fontWeight: 900, fontSize: "0.82rem",
                        color: matchup.isTie ? "var(--text-2)" : iWon ? "var(--win)" : "var(--loss)",
                        background: matchup.isTie ? "var(--surface-2)" : iWon ? "var(--win-bg)" : "var(--loss-bg)",
                        borderRadius: 6, padding: "4px 10px",
                      }}>
                        {matchup.isTie ? "TIE" : iWon ? "WIN" : "L"}
                      </div>
                    ) : (
                      <div style={{ color: "var(--text-3)", fontWeight: 800, fontSize: "0.82rem" }}>VS</div>
                    )}
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <div className="avatar" style={{ margin: "0 auto 6px", width: 40, height: 40 }}>
                      {(opp?.displayName ?? "??").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: 2 }}>{opp?.displayName}</div>
                    {resolved && (
                      <div style={{ fontSize: "1rem", fontWeight: 900, color: oppProfit >= 0 ? "var(--win)" : "var(--loss)" }}>
                        {oppProfit >= 0 ? "+" : ""}{oppProfit}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Standings */}
        <div className="section-title" style={{ marginBottom: 10 }}>Standings</div>
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr 72px 88px",
            padding: "8px 16px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
          }}>
            {["#", "Player", "W-L", "Balance"].map((h, i) => (
              <span key={h} style={{
                fontSize: "0.63rem", fontWeight: 800, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--text-3)",
                textAlign: i >= 2 ? "center" : "left",
              }}>{h}</span>
            ))}
          </div>
          {members.length === 0 && (
            <div className="empty" style={{ padding: "24px 0" }}>
              <div className="empty-text">No members yet</div>
            </div>
          )}
          {members.map((m: any, idx: number) => {
            const isMe = m.userId === userId;
            const rank = m.rank;
            const rankColor = rank === 1 ? "var(--gold)" : rank === 2 ? "var(--silver)" : rank === 3 ? "var(--bronze)" : "var(--text-3)";
            return (
              <div
                key={m.userId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr 72px 88px",
                  padding: "11px 16px",
                  borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
                  background: isMe ? "var(--accent-dim)" : "transparent",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 900, fontSize: "0.88rem", color: rankColor }}>{rank}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: "0.64rem", flexShrink: 0, ...(rank === 1 ? { borderColor: "var(--gold)", color: "var(--gold)", background: "rgba(200,150,12,0.1)" } : {}) }}>
                    {m.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: isMe ? 800 : 500, fontSize: "0.88rem", color: isMe ? "var(--accent)" : "var(--text)" }}>
                    {m.displayName}
                    {isMe && <span style={{ color: "var(--accent)", fontSize: "0.7rem", marginLeft: 6, fontWeight: 700 }}>YOU</span>}
                  </span>
                </div>
                <span style={{ textAlign: "center", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-2)" }}>
                  {m.wins}–{m.losses}{m.ties > 0 ? `–${m.ties}` : ""}
                </span>
                <span style={{ textAlign: "right", fontSize: "0.85rem", fontWeight: 800, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  ${m.balance.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current week games */}
        {week && (
          <>
            <div className="section-title" style={{ marginBottom: 10 }}>This Week's Games</div>
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
              {week.games?.length ? week.games.map((game: any, idx: number) => (
                <div
                  key={game.id}
                  onClick={() => router.push(`/leagues/${leagueId}/bet?gameId=${game.id}`)}
                  style={{
                    display: "flex", alignItems: "center",
                    padding: "12px 16px",
                    borderBottom: idx < week.games.length - 1 ? "1px solid var(--border)" : "none",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", textAlign: "right" }}>{game.awayTeam}</span>
                    <TeamLogo team={game.awayTeam} size={32} />
                  </div>
                  <div style={{ width: 32, textAlign: "center", fontWeight: 700, fontSize: "0.8rem", color: "var(--text-3)", flexShrink: 0 }}>
                    {game.status === "FINAL"
                      ? <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-2)" }}>{game.awayScore}–{game.homeScore}</span>
                      : game.status === "CANCELLED"
                        ? <span style={{ fontSize: "0.6rem", color: "var(--loss)", fontWeight: 800 }}>CANC</span>
                        : "@"
                    }
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    <TeamLogo team={game.homeTeam} size={32} />
                    <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{game.homeTeam}</span>
                  </div>
                </div>
              )) : (
                <p style={{ color: "var(--text-3)", fontSize: "0.85rem", padding: "16px" }}>No games this week yet.</p>
              )}
            </div>
          </>
        )}

        {/* Bet CTA */}
        {week && !week.locked && !week.resolved && (
          <Link href={`/leagues/${leagueId}/bet`}>
            <button style={{ width: "100%", padding: "15px", fontSize: "1rem", fontWeight: 800, marginBottom: 8, letterSpacing: "0.01em" }}>
              Place Bets →
            </button>
          </Link>
        )}

        {/* Commissioner Panel */}
        {isCreator && (
          <>
            <div className="section-title" style={{ marginBottom: 10 }}>Commissioner</div>

            {/* Invite code card */}
            <div className="card" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>
                Invite Code
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "2.2rem", fontWeight: 900, letterSpacing: "0.3em", color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                  {league.inviteCode}
                </div>
                <button
                  className="secondary"
                  style={{ fontSize: "0.8rem", padding: "8px 16px" }}
                  onClick={copyCode}
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Pending join requests */}
            {pendingMembers.length > 0 && (
              <div className="card" style={{ marginBottom: 8, borderColor: "rgba(0,51,160,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Join Requests</span>
                  <span className="badge badge-blue">{pendingMembers.length}</span>
                </div>
                {pendingMembers.map((m: any) => (
                  <div key={m.userId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="avatar" style={{ width: 32, height: 32, fontSize: "0.7rem" }}>
                        {m.user.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{m.user.displayName}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="secondary"
                        style={{ fontSize: "0.76rem", padding: "6px 12px", color: "var(--win)", borderColor: "rgba(22,163,74,0.35)" }}
                        onClick={() => acceptMember(m.userId)}
                      >
                        Accept
                      </button>
                      <button
                        className="ghost"
                        style={{ fontSize: "0.76rem", padding: "6px 12px", color: "var(--loss)", borderColor: "rgba(220,38,38,0.3)" }}
                        onClick={() => rejectMember(m.userId)}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Members list */}
            <div className="card" style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => setShowMembers(!showMembers)}
                style={{
                  width: "100%", background: "transparent", color: "var(--text)",
                  border: "none", borderRadius: 0,
                  padding: "14px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontWeight: 700, fontSize: "0.9rem",
                }}
              >
                <span>Members <span style={{ color: "var(--text-3)", fontWeight: 500, fontSize: "0.82rem" }}>({members.length})</span></span>
                <span style={{ color: "var(--text-3)", fontSize: "0.82rem", fontWeight: 400 }}>{showMembers ? "▲" : "▼"}</span>
              </button>
              {showMembers && (
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  {members.map((m: any) => (
                    <div key={m.userId} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="avatar" style={{ width: 30, height: 30, fontSize: "0.68rem" }}>
                          {m.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                          {m.displayName}
                          {m.userId === userId && <span className="badge" style={{ marginLeft: 6 }}>you</span>}
                        </span>
                      </div>
                      {m.userId !== userId && !league.seasonStarted && (
                        <button
                          className="ghost"
                          style={{ fontSize: "0.74rem", padding: "4px 10px", color: "var(--loss)", borderColor: "rgba(220,38,38,0.3)" }}
                          onClick={() => removeMember(m.userId)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* League settings link — always visible to commissioner */}
            <Link href={`/leagues/${leagueId}/settings`} style={{ display: "block", marginBottom: 8 }}>
              <div className="card" style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", cursor: "pointer",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 2 }}>League Settings</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                    Season structure · Betting rules
                  </div>
                </div>
                <span style={{ color: "var(--text-3)", fontSize: "1rem" }}>›</span>
              </div>
            </Link>

            {/* Pre-season controls */}
            {!league.seasonStarted && (
              <>
                {/* Start season */}
                <div className="card" style={{ marginBottom: 8 }}>
                  <div style={{ color: "var(--text-2)", fontSize: "0.82rem", marginBottom: 10 }}>
                    {members.length % 2 !== 0
                      ? `Need even number of members (currently ${members.length})`
                      : `${members.length} members ready`}
                  </div>
                  <button
                    onClick={startSeason}
                    disabled={members.length < 2 || members.length % 2 !== 0}
                    style={{ width: "100%", padding: "13px" }}
                  >
                    Start Season →
                  </button>

                  {members.length <= 1 && (
                    <button
                      className="ghost"
                      style={{ width: "100%", fontSize: "0.82rem", padding: "9px", marginTop: 8, color: "var(--loss)", borderColor: "rgba(220,38,38,0.3)" }}
                      onClick={deleteLeague}
                    >
                      Delete League
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Active season controls */}
            {league.seasonStarted && !league.seasonEnded && (
              <>
                {/* Playoffs */}
                <div className="card" style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
                  <button
                    onClick={() => setShowPlayoffs(!showPlayoffs)}
                    style={{
                      width: "100%", background: "transparent", color: "var(--text)",
                      border: "none", borderRadius: 0,
                      padding: "14px 16px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      fontWeight: 700, fontSize: "0.9rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>Playoffs</span>
                      {playoffMatchups.length > 0 && <span className="badge badge-blue">Round {maxPlayoffRound}</span>}
                    </div>
                    <span style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>{showPlayoffs ? "▲" : "▼"}</span>
                  </button>

                  {showPlayoffs && (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                      {playoffMatchups.length === 0 ? (
                        <form onSubmit={startPlayoffs} style={{ display: "flex", gap: 8, paddingTop: 14 }}>
                          <input
                            type="number"
                            placeholder="Start week number"
                            value={playoffWeekInput}
                            onChange={(e) => setPlayoffWeekInput(e.target.value)}
                            style={{ flex: 1, fontSize: "0.85rem" }}
                            required
                          />
                          <button type="submit" style={{ fontSize: "0.85rem", padding: "10px 16px", whiteSpace: "nowrap" }}>
                            Start →
                          </button>
                        </form>
                      ) : (
                        <div style={{ paddingTop: 12 }}>
                          {playoffMatchups.filter((m) => m.playoffRound === maxPlayoffRound).map((m: any) => (
                            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                              <span style={{ fontSize: "0.85rem", color: "var(--text-2)" }}>
                                {m.homeUser?.displayName ?? "?"} <span style={{ color: "var(--text-3)" }}>vs</span> {m.awayUser?.displayName ?? "?"}
                              </span>
                              {m.winnerId && <span style={{ color: "var(--win)", fontSize: "0.75rem", fontWeight: 700 }}>✓ Done</span>}
                            </div>
                          ))}
                          <form onSubmit={advancePlayoffs} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 12 }}>
                            <input type="number" placeholder="Round #" value={advanceRound} onChange={(e) => setAdvanceRound(e.target.value)} style={{ fontSize: "0.82rem" }} required />
                            <input type="number" placeholder="Next week #" value={advanceWeek} onChange={(e) => setAdvanceWeek(e.target.value)} style={{ fontSize: "0.82rem" }} required />
                            <button type="submit" style={{ fontSize: "0.82rem", padding: "10px 14px" }}>Advance →</button>
                          </form>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Consolation */}
                {league.consolationTeams >= 2 && (
                  <div className="card" style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
                    <button
                      onClick={() => setShowConsolation(!showConsolation)}
                      style={{
                        width: "100%", background: "transparent", color: "var(--text)",
                        border: "none", borderRadius: 0,
                        padding: "14px 16px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        fontWeight: 700, fontSize: "0.9rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>Consolation</span>
                        <span style={{ color: "var(--text-3)", fontSize: "0.8rem", fontWeight: 400 }}>({league.consolationTeams} teams)</span>
                        {consolationMatchups.length > 0 && <span className="badge">R{maxConsolationRound}</span>}
                      </div>
                      <span style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>{showConsolation ? "▲" : "▼"}</span>
                    </button>

                    {showConsolation && (
                      <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                        {consolationMatchups.length === 0 ? (
                          <form onSubmit={startConsolation} style={{ display: "flex", gap: 8, paddingTop: 14 }}>
                            <input
                              type="number"
                              placeholder="Start week number"
                              value={consolationWeekInput}
                              onChange={(e) => setConsolationWeekInput(e.target.value)}
                              style={{ flex: 1, fontSize: "0.85rem" }}
                              required
                            />
                            <button type="submit" style={{ fontSize: "0.85rem", padding: "10px 16px" }}>Start →</button>
                          </form>
                        ) : (
                          <div style={{ paddingTop: 12 }}>
                            {consolationMatchups.filter((m) => m.playoffRound === maxConsolationRound).map((m: any) => (
                              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                                <span style={{ fontSize: "0.85rem", color: "var(--text-2)" }}>
                                  {m.homeUser?.displayName ?? "?"} <span style={{ color: "var(--text-3)" }}>vs</span> {m.awayUser?.displayName ?? "?"}
                                </span>
                                {m.winnerId && <span style={{ color: "var(--win)", fontSize: "0.75rem", fontWeight: 700 }}>✓ Done</span>}
                              </div>
                            ))}
                            <form onSubmit={advanceConsolation} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 12 }}>
                              <input type="number" placeholder="Round #" value={consolationAdvanceRound} onChange={(e) => setConsolationAdvanceRound(e.target.value)} style={{ fontSize: "0.82rem" }} required />
                              <input type="number" placeholder="Next week #" value={consolationAdvanceWeek} onChange={(e) => setConsolationAdvanceWeek(e.target.value)} style={{ fontSize: "0.82rem" }} required />
                              <button type="submit" style={{ fontSize: "0.82rem", padding: "10px 14px" }}>Advance →</button>
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
              <div className="card" style={{ marginBottom: 8 }}>
                <span className="badge badge-blue">Season Complete</span>
              </div>
            )}
          </>
        )}

        {/* Leave league (non-commissioner) */}
        {!isCreator && !league.seasonStarted && membership && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button
              className="ghost"
              style={{ width: "100%", fontSize: "0.82rem", padding: "10px", color: "var(--loss)", borderColor: "rgba(220,38,38,0.3)" }}
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
