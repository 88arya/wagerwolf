"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import { api } from "@/lib/api";
import LeagueNav from "@/components/LeagueNav";

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}


export default function DashboardPage({ params }: PageProps<"/leagues/[leagueId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [membership, setMembership] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [week, setWeek] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [weekMatchups, setWeekMatchups] = useState<any[]>([]);

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

      try {
        const [weeks, board] = await Promise.all([
          api(`/weeks?current=true&leagueId=${leagueId}`),
          api(`/leagues/${leagueId}/leaderboard`),
        ]);
        const currentWeek = weeks?.[0] ?? null;
        if (currentWeek) {
          setWeek(currentWeek);
          try {
            const matchups = await api(`/leagues/${leagueId}/matchups?weekNumber=${currentWeek.number}`);
            setWeekMatchups(matchups ?? []);
          } catch {}
        }
        setMembers(board);
      } catch {}
    }
    load();
  }, []);

  async function leaveLeague() {
    if (!confirm(`Leave "${league?.name}"?`)) return;
    try {
      await api(`/leagues/${leagueId}/leave`, { method: "POST", body: JSON.stringify({}) });
      router.push("/leagues");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
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
    ? isPlayoffWeek ? `Playoff Week ${playoffWeekNum}` : `League Week ${leagueWeekNum} of ${regularSeasonWeeks}`
    : null;
  const weekStatus = week?.resolved ? "Final" : week?.locked ? "Locked" : week ? "Live" : null;
  const weekStatusColor = week?.resolved ? "var(--text-3)" : week?.locked ? "var(--loss)" : "var(--win)";

  const hasAnyRecord = members.some((m) => m.wins > 0 || m.losses > 0 || m.ties > 0);
  const powerRankings = [...members].sort((a, b) => {
    if (!hasAnyRecord) {
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    }
    return b.wins - a.wins || b.ties - a.ties || b.balance - a.balance;
  }).map((m, i) => ({ ...m, powerRank: i + 1 }));

  if (!league) return <div className="loading">Loading…</div>;

  const RankRow = ({ m, rank, isMe, idx, total, href }: any) => {
    const rankColor = rank === 1 ? "var(--gold)" : rank === 2 ? "var(--silver)" : rank === 3 ? "var(--bronze)" : "var(--text-3)";
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "22px 1fr auto",
          padding: "8px 12px",
          borderBottom: idx < total - 1 ? "1px solid var(--border)" : "none",
          background: isMe ? "var(--accent-dim)" : "transparent",
          alignItems: "center",
          cursor: "pointer",
          transition: "background 0.12s",
          gap: 6,
        }}>
          <span style={{ fontWeight: 900, fontSize: "0.8rem", color: rankColor }}>{rank}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <div className="avatar" style={{
              width: 22, height: 22, fontSize: "0.55rem", flexShrink: 0,
              ...(rank === 1 ? { borderColor: "var(--gold)", color: "var(--gold)", background: "rgba(245,158,11,0.1)" } : {}),
            }}>
              {m.displayName.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontWeight: isMe ? 800 : 500, fontSize: "0.8rem", color: isMe ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.displayName}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>
            {m.wins}–{m.losses}–{m.ties}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <>
      <LeagueNav leagueId={leagueId} />

      <div className="page-wide">

        {/* Champion banner — full width above grid */}
        {league.seasonEnded && (
          <div style={{
            background: "linear-gradient(135deg, #5a3800 0%, #a06c00 100%)",
            borderRadius: "var(--radius-lg)",
            padding: "14px 16px",
            marginBottom: 14,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "1px solid rgba(200,150,12,0.4)",
          }}>
            <span style={{ fontSize: "1.8rem" }}>🏆</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.63rem", letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.65, marginBottom: 2 }}>Season Complete</div>
              <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>
                Champion: {members.find((m) => m.userId === league.championId)?.displayName ?? "—"}
              </div>
            </div>
          </div>
        )}

        {/* This Week's Matchups — full width above grid */}
        {weekMatchups.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>This Week&apos;s Matchups</span>
              </div>
              {weekMatchups.map((matchup: any, idx: number) => {
                const isHome = matchup.homeUserId === userId;
                const isAway = matchup.awayUserId === userId;
                const resolved = matchup.winnerId != null || matchup.isTie;
                const iWon = resolved && matchup.winnerId === userId;
                const iLost = resolved && matchup.winnerId != null && matchup.winnerId !== userId;
                return (
                  <div key={matchup.id} style={{
                    display: "flex", alignItems: "center",
                    padding: "9px 14px",
                    borderBottom: idx < weekMatchups.length - 1 ? "1px solid var(--border)" : "none",
                    background: (isHome || isAway) ? "var(--accent-dim)" : "transparent",
                  }}>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      <span style={{ fontWeight: matchup.homeUserId === userId ? 800 : 600, fontSize: "0.82rem", color: matchup.homeUserId === userId ? "var(--accent)" : "var(--text)" }}>
                        {matchup.homeUser?.displayName ?? "—"}
                      </span>
                    </div>
                    <div style={{ width: 56, textAlign: "center", flexShrink: 0 }}>
                      {resolved ? (
                        matchup.isTie
                          ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.04em" }}>TIE</span>
                          : <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em", color: iWon ? "var(--win)" : iLost ? "var(--loss)" : "var(--text-3)" }}>
                              {matchup.winnerId === matchup.homeUserId ? "W" : "L"} – {matchup.winnerId === matchup.awayUserId ? "W" : "L"}
                            </span>
                      ) : (
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)" }}>vs</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: matchup.awayUserId === userId ? 800 : 600, fontSize: "0.82rem", color: matchup.awayUserId === userId ? "var(--accent)" : "var(--text)" }}>
                        {matchup.awayUser?.displayName ?? "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3-column grid: Games | Banner + Power Rankings | Standings */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "148px 1fr 260px",
          gridTemplateRows: "auto 1fr",
          gap: "0 14px",
          alignItems: "start",
        }}>

          {/* LEFT: This Week's Games (condensed, spans both rows) */}
          <div style={{ gridColumn: "1", gridRow: "1 / 3" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>NFL Games</span>
              </div>
              {!week || !week.games?.length ? (
                <div className="empty" style={{ padding: "18px 0" }}>
                  <div className="empty-text" style={{ fontSize: "0.75rem" }}>No games yet</div>
                </div>
              ) : week.games.map((game: any, idx: number) => {
                const now = new Date();
                const isLive = game.status === "IN_PROGRESS" ||
                  (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);
                return (
                  <div key={game.id} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    borderBottom: idx < week.games.length - 1 ? "1px solid var(--border)" : "none",
                    gap: 8,
                  }}>
                    {/* Teams stacked: away top, home bottom */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <TeamLogo team={game.awayTeam} size={20} plain />
                        <span style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)" }}>{game.awayTeam}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <TeamLogo team={game.homeTeam} size={20} plain />
                        <span style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)" }}>{game.homeTeam}</span>
                      </div>
                    </div>
                    {/* Score / time */}
                    <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                      {game.status === "FINAL" ? (
                        <>
                          <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{game.awayScore}</span>
                          <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{game.homeScore}</span>
                        </>
                      ) : isLive ? (
                        <span style={{ fontSize: "0.52rem", color: "var(--win)", fontWeight: 800, letterSpacing: "0.04em" }}>LIVE</span>
                      ) : game.status === "CANCELLED" ? (
                        <span style={{ fontSize: "0.52rem", color: "var(--loss)", fontWeight: 800 }}>CANC</span>
                      ) : game.gameDate ? (
                        <>
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-3)" }}>
                            {new Date(game.gameDate).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })}
                          </span>
                          <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text-3)" }}>
                            {new Date(game.gameDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CENTER TOP: League Banner */}
          <div style={{ gridColumn: "2", gridRow: "1", marginBottom: 14 }}>
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              borderTop: "3px solid var(--accent)",
              padding: "16px 18px",
              position: "relative",
            }}>
              {isCreator && (
                <Link
                  href={`/leagues/${leagueId}/settings`}
                  style={{
                    position: "absolute", top: 12, right: 12,
                    color: "var(--text-3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: 6,
                    background: "var(--surface-2)",
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "var(--surface-3)";
                    (e.currentTarget as HTMLAnchorElement).style.color = "var(--text)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "var(--surface-2)";
                    (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-3)";
                  }}
                >
                  <GearIcon />
                </Link>
              )}
              <div style={{ fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1.2, paddingRight: isCreator ? 36 : 0 }}>
                {league.name}
              </div>
            </div>
          </div>

          {/* CENTER BOTTOM: Power Rankings */}
          <div style={{ gridColumn: "2", gridRow: "2" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", gridColumn: "1 / 4" }}>Power Rankings</span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "22px 1fr auto",
                padding: "6px 12px", gap: 6,
                background: "var(--surface-2)", borderBottom: "1px solid var(--border)",
              }}>
                {["#", "Player", "W-L-T"].map((h, i) => (
                  <span key={h} style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", textAlign: i === 2 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {powerRankings.length === 0 && (
                <div className="empty" style={{ padding: "18px 0" }}><div className="empty-text">No members yet</div></div>
              )}
              {powerRankings.map((m: any, idx: number) => (
                <RankRow key={m.userId} m={m} rank={m.powerRank} isMe={m.userId === userId} idx={idx} total={powerRankings.length} href={`/leagues/${leagueId}/members/${m.userId}`} />
              ))}
            </div>
          </div>

          {/* RIGHT: Standings (spans both rows) */}
          <div style={{ gridColumn: "3", gridRow: "1 / 3" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>Standings</span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "22px 1fr auto",
                padding: "6px 12px", gap: 6,
                background: "var(--surface-2)", borderBottom: "1px solid var(--border)",
              }}>
                {["#", "Player", "W-L-T"].map((h, i) => (
                  <span key={h} style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", textAlign: i === 2 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {members.length === 0 && (
                <div className="empty" style={{ padding: "18px 0" }}><div className="empty-text">No members yet</div></div>
              )}
              {members.map((m: any, idx: number) => (
                <RankRow key={m.userId} m={m} rank={m.rank} isMe={m.userId === userId} idx={idx} total={members.length} href={`/leagues/${leagueId}/members/${m.userId}`} />
              ))}
            </div>

            {!isCreator && !league.seasonStarted && membership && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <button className="ghost" style={{ width: "100%", fontSize: "0.8rem", padding: "9px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={leaveLeague}>
                  Leave League
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
