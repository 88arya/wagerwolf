"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import { api } from "@/lib/api";
import LeagueNav from "@/components/LeagueNav";

export default function DashboardPage({ params }: PageProps<"/leagues/[leagueId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [membership, setMembership] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [week, setWeek] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);

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
        if (currentWeek) setWeek(currentWeek);
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


  if (!league) return <div className="loading">Loading…</div>;

  return (
    <>
      <LeagueNav leagueId={leagueId} />

      <div className="page">

        {/* Champion banner */}
        {league.seasonEnded && (
          <div style={{
            background: "linear-gradient(135deg, #5a3800 0%, #a06c00 100%)",
            borderRadius: "var(--radius-lg)",
            padding: "14px 16px",
            marginBottom: 10,
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

        {/* League hero */}
        <div className="league-banner" style={{ marginBottom: 10 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
              {league.isPublic ? "Public League" : "Private League"}
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: 900, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1.2 }}>
              {league.name}
            </div>
          </div>

          <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)", marginBottom: 2 }}>Balance</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                ${(membership?.balance ?? 0).toLocaleString()}
              </div>
            </div>
            {myRecord && (myRecord.wins > 0 || myRecord.losses > 0) && (
              <div>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)", marginBottom: 2 }}>Record</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1 }}>
                  {myRecord.wins}–{myRecord.losses}{myRecord.ties > 0 ? `–${myRecord.ties}` : ""}
                </div>
              </div>
            )}
            {myRank > 0 && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)", marginBottom: 2 }}>Rank</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-0.03em", color: myRank === 1 ? "var(--gold)" : "#fff", lineHeight: 1 }}>
                  #{myRank}
                </div>
              </div>
            )}
          </div>

          {weekLabel && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
                {weekLabel}
              </span>
              {weekStatus && (
                <span style={{
                  fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: weekStatusColor, background: "rgba(255,255,255,0.08)",
                  borderRadius: 4, padding: "2px 7px",
                }}>
                  {weekStatus}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Bet CTA */}
        {week && !week.locked && !week.resolved && (
          <Link href={`/leagues/${leagueId}/bet`} style={{ display: "block", marginBottom: 10 }}>
            <button style={{ width: "100%", padding: "13px", fontSize: "0.92rem", fontWeight: 800, letterSpacing: "0.01em" }}>
              Place Bets →
            </button>
          </Link>
        )}

        {/* Standings */}
        <div className="section-title" style={{ marginBottom: 8 }}>Standings</div>
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "26px 1fr 72px",
            padding: "7px 14px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
          }}>
            {["#", "Player", "W-L"].map((h, i) => (
              <span key={h} style={{
                fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--text-3)",
                textAlign: i >= 2 ? "center" : "left",
              }}>{h}</span>
            ))}
          </div>

          {members.length === 0 && (
            <div className="empty" style={{ padding: "20px 0" }}>
              <div className="empty-text">No members yet</div>
            </div>
          )}
          {members.map((m: any, idx: number) => {
            const isMe = m.userId === userId;
            const rank = m.rank;
            const rankColor = rank === 1 ? "var(--gold)" : rank === 2 ? "var(--silver)" : rank === 3 ? "var(--bronze)" : "var(--text-3)";
            return (
              <Link key={m.userId} href={`/leagues/${leagueId}/members/${m.userId}`} style={{ textDecoration: "none", display: "block" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "26px 1fr 72px",
                  padding: "10px 14px",
                  borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
                  background: isMe ? "var(--accent-dim)" : "transparent",
                  alignItems: "center",
                  cursor: "pointer",
                  transition: "background 0.12s",
                }}>
                  <span style={{ fontWeight: 900, fontSize: "0.85rem", color: rankColor }}>{rank}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="avatar" style={{
                      width: 26, height: 26, fontSize: "0.6rem", flexShrink: 0,
                      ...(rank === 1 ? { borderColor: "var(--gold)", color: "var(--gold)", background: "rgba(245,158,11,0.1)" } : {}),
                    }}>
                      {m.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: isMe ? 800 : 500, fontSize: "0.85rem", color: isMe ? "var(--accent)" : "var(--text)" }}>
                      {m.displayName}
                      {isMe && <span style={{ color: "var(--accent)", fontSize: "0.65rem", marginLeft: 6, fontWeight: 700 }}>YOU</span>}
                    </span>
                  </div>
                  <span style={{ textAlign: "center", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)" }}>
                    {m.wins}–{m.losses}{m.ties > 0 ? `–${m.ties}` : ""}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* This week's games */}
        {week && (
          <>
            <div className="section-title" style={{ marginBottom: 8 }}>This Week&apos;s Games</div>
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
              {week.games?.length ? week.games.map((game: any, idx: number) => {
                const now = new Date();
                const isLive = game.status === "IN_PROGRESS" ||
                  (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);
                return (
                  <div key={game.id} style={{
                    display: "flex", alignItems: "center",
                    padding: "11px 14px",
                    borderBottom: idx < week.games.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.85rem", textAlign: "right" }}>{game.awayTeam}</span>
                      <TeamLogo team={game.awayTeam} size={30} />
                    </div>
                    <div style={{ width: 44, textAlign: "center", fontWeight: 700, fontSize: "0.78rem", color: "var(--text-3)", flexShrink: 0 }}>
                      {game.status === "FINAL"
                        ? <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-2)" }}>{game.awayScore}–{game.homeScore}</span>
                        : isLive
                          ? <span style={{ fontSize: "0.6rem", color: "var(--win)", fontWeight: 800, letterSpacing: "0.04em" }}>LIVE</span>
                          : game.status === "CANCELLED"
                            ? <span style={{ fontSize: "0.58rem", color: "var(--loss)", fontWeight: 800 }}>CANC</span>
                            : <span style={{ fontSize: "0.72rem" }}>@</span>
                      }
                    </div>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <TeamLogo team={game.homeTeam} size={30} />
                      <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{game.homeTeam}</span>
                    </div>
                  </div>
                );
              }) : (
                <div className="empty" style={{ padding: "20px 0" }}>
                  <div className="empty-text">No games this week yet</div>
                </div>
              )}
            </div>
          </>
        )}

        {!isCreator && !league.seasonStarted && membership && (
          <div style={{ marginTop: 24, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <button className="ghost" style={{ width: "100%", fontSize: "0.8rem", padding: "10px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={leaveLeague}>
              Leave League
            </button>
          </div>
        )}
      </div>

    </>
  );
}
