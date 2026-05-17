"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import { api } from "@/lib/api";
import LeagueNav from "@/components/LeagueNav";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";

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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [myHelmetColor, setMyHelmetColor] = useState("#2563EB");
  const gamesScrollRef = useRef<HTMLDivElement>(null);

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
        const me = board.find((m: any) => m.userId === id);
        if (me?.helmetColor) setMyHelmetColor(me.helmetColor);
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

  async function pickColor(color: string) {
    const takenByOther = members.some(m => m.userId !== userId && m.helmetColor === color);
    if (takenByOther) return;
    setMyShieldColor(color);
    setShowColorPicker(false);
    setMembers(prev => prev.map(m => m.userId === userId ? { ...m, helmetColor: color } : m));
    try {
      await api(`/leagues/${leagueId}/my-helmet`, { method: "PATCH", body: JSON.stringify({ helmetColor: color }) });
    } catch {
      setMyHelmetColor(members.find(m => m.userId === userId)?.helmetColor ?? "#2563EB");
    }
  }

  const takenColors = new Set(members.filter(m => m.userId !== userId).map(m => m.helmetColor));

  const helmetColors: Record<string, string> = {};
  members.forEach(m => { helmetColors[m.userId] = m.helmetColor ?? "#2563EB"; });

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

  const RANK_COLS = "22px 1fr 20px 20px 20px 26px";

  const RankRow = ({ m, rank, isMe, idx, total, href, gb }: any) => {
    const gbStr = gb === 0 ? "--" : gb % 1 === 0 ? String(gb) : String(gb);
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: RANK_COLS,
          padding: "6px 12px",
          borderBottom: idx < total - 1 ? "1px solid var(--border)" : "none",
          background: "transparent",
          alignItems: "center",
          cursor: "pointer",
          transition: "background 0.12s",
          gap: 6,
        }}>
          <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "var(--text)" }}>{rank}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <div
              onClick={isMe ? (e) => { e.preventDefault(); e.stopPropagation(); setShowColorPicker(true); } : undefined}
              style={isMe ? { cursor: "pointer" } : undefined}
            >
              <HelmetAvatar color={helmetColors[m.userId] ?? "#2563EB"} initials={m.displayName.slice(0, 2)} size={24} />
            </div>
            <span style={{ fontWeight: isMe ? 700 : 400, fontSize: "0.8rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.displayName}
            </span>
          </div>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>{m.wins}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>{m.losses}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>{m.ties}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>{gbStr}</span>
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


        {/* 3-column grid: Matchups | Banner + Power Rankings | Standings */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "185px 1fr 260px",
          gridTemplateRows: "auto 1fr",
          gap: "0 14px",
          alignItems: "start",
        }}>

          {/* COL 1: Matchups (spans both rows) */}
          <div style={{ gridColumn: "1", gridRow: "1 / 3" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "#fff" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Matchups</span>
              </div>
              {(() => {
                const totalSlots = Math.floor((league?.maxTeams ?? 0) / 2);
                const slots = Array.from({ length: Math.max(totalSlots, weekMatchups.length) }, (_, i) => weekMatchups[i] ?? null);
                if (slots.length === 0) return (
                  <div className="empty" style={{ padding: "18px 0" }}>
                    <div className="empty-text" style={{ fontSize: "0.75rem" }}>No matchups yet</div>
                  </div>
                );
                return slots.map((matchup: any, idx: number) => {
                  const total = slots.length;
                  if (!matchup) return (
                    <div key={`blank-${idx}`} style={{
                      display: "flex", alignItems: "center", padding: "9px 12px",
                      borderBottom: idx < total - 1 ? "1px solid var(--border)" : "none",
                      gap: 8, minHeight: 54,
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                        <div style={{ height: 14, width: 70, background: "var(--surface-2)", borderRadius: 3 }} />
                        <div style={{ height: 14, width: 70, background: "var(--surface-2)", borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                  const isHome = matchup.homeUserId === userId;
                  const isAway = matchup.awayUserId === userId;
                  const homeName = matchup.isGhostMatchup && matchup.homeUser?.email === "ghost@system.internal" ? "Ghost" : (matchup.homeUser?.displayName ?? "—");
                  const awayName = matchup.isGhostMatchup && matchup.awayUser?.email === "ghost@system.internal" ? "Ghost" : (matchup.awayUser?.displayName ?? "—");
                  const homeScore = matchup.homeProfit ?? 0;
                  const awayScore = matchup.awayProfit ?? 0;
                  return (
                    <div key={matchup.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "9px 12px",
                      borderBottom: idx < total - 1 ? "1px solid var(--border)" : "none",
                      background: "transparent", gap: 8,
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <HelmetAvatar color={helmetColors[matchup.homeUserId] ?? "#2563EB"} initials={homeName.slice(0, 2)} size={20} />
                          <span style={{ fontWeight: isHome ? 700 : 400, fontSize: "0.75rem", color: "var(--text)", fontStyle: homeName === "Ghost" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {homeName}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <HelmetAvatar color={helmetColors[matchup.awayUserId] ?? "#2563EB"} initials={awayName.slice(0, 2)} size={20} />
                          <span style={{ fontWeight: isAway ? 700 : 400, fontSize: "0.75rem", color: "var(--text)", fontStyle: awayName === "Ghost" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {awayName}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>${homeScore}</span>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>${awayScore}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* CENTER TOP: League Banner */}
          <div style={{ gridColumn: "2", gridRow: "1", marginBottom: 14 }}>
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              {/* Accent strip */}
              <div style={{ height: 6, background: "var(--accent)" }} />
              {/* Banner body */}
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1.2 }}>
                  {league.name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, textAlign: "right" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>Teams:</span> {members.length}/{league.maxTeams}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>Allowance:</span> ${league.weeklyAllowance}/wk
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CENTER BOTTOM: Power Rankings */}
          <div style={{ gridColumn: "2", gridRow: "2" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
              <div style={{ padding: "8px 12px", background: "#fff", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)", gridColumn: "1 / 4" }}>Power Rankings</span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: RANK_COLS,
                padding: "6px 12px", gap: 6,
                background: "#fff", borderBottom: "1px solid var(--border)",
              }}>
                {["#", "Player", "W", "L", "T", "GB"].map((h, i) => (
                  <span key={h} style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text)", textAlign: i >= 2 ? "center" : "left" }}>{h}</span>
                ))}
              </div>
              {(() => {
                const totalSlots = league?.maxTeams ?? 0;
                const slots = Array.from({ length: Math.max(totalSlots, powerRankings.length) }, (_, i) => powerRankings[i] ?? null);
                const leader = powerRankings[0];
                return slots.map((m: any, idx: number) => {
                  const total = slots.length;
                  if (!m) return (
                    <div key={`blank-pr-${idx}`} style={{ display: "grid", gridTemplateColumns: RANK_COLS, padding: "8px 12px", borderBottom: idx < total - 1 ? "1px solid var(--border)" : "none", gap: 6, alignItems: "center", minHeight: 38 }}>
                      <div style={{ height: 12, width: 14, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 70, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 14, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 14, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 14, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 26, background: "var(--surface-2)", borderRadius: 3 }} />
                    </div>
                  );
                  const gb = leader ? ((leader.wins - m.wins) + (m.losses - leader.losses)) / 2 : 0;
                  return <RankRow key={m.userId} m={m} rank={m.powerRank} isMe={m.userId === userId} idx={idx} total={total} href={`/leagues/${leagueId}/members/${m.userId}`} gb={gb} />;
                });
              })()}
            </div>
          </div>

          {/* RIGHT: Standings (spans both rows) */}
          <div style={{ gridColumn: "3", gridRow: "1 / 3" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
              <div style={{ padding: "8px 12px", background: "#fff", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Standings</span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: RANK_COLS,
                padding: "6px 12px", gap: 6,
                background: "#fff", borderBottom: "1px solid var(--border)",
              }}>
                {["#", "Player", "W", "L", "T", "GB"].map((h, i) => (
                  <span key={h} style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text)", textAlign: i >= 2 ? "center" : "left" }}>{h}</span>
                ))}
              </div>
              {(() => {
                const totalSlots = league?.maxTeams ?? 0;
                const slots = Array.from({ length: Math.max(totalSlots, members.length) }, (_, i) => members[i] ?? null);
                const leader = members[0];
                return slots.map((m: any, idx: number) => {
                  const total = slots.length;
                  if (!m) return (
                    <div key={`blank-st-${idx}`} style={{ display: "grid", gridTemplateColumns: RANK_COLS, padding: "8px 12px", borderBottom: idx < total - 1 ? "1px solid var(--border)" : "none", gap: 6, alignItems: "center", minHeight: 38 }}>
                      <div style={{ height: 12, width: 14, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 70, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 14, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 14, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 14, background: "var(--surface-2)", borderRadius: 3 }} />
                      <div style={{ height: 12, width: 26, background: "var(--surface-2)", borderRadius: 3 }} />
                    </div>
                  );
                  const gb = leader ? ((leader.wins - m.wins) + (m.losses - leader.losses)) / 2 : 0;
                  return <RankRow key={m.userId} m={m} rank={m.rank} isMe={m.userId === userId} idx={idx} total={total} href={`/leagues/${leagueId}/members/${m.userId}`} gb={gb} />;
                });
              })()}
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

        {/* Horizontal games strip */}
        {week?.games?.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", border: "1px solid var(--border)", background: "#f4f6f9", overflow: "hidden", borderRadius: "var(--radius-lg)" }}>
            <div onClick={() => { const el = gamesScrollRef.current; if (!el) return; const w = (el.firstElementChild as HTMLElement).getBoundingClientRect().width; el.scrollTo({ left: Math.round(el.scrollLeft / w - 1) * w, behavior: "smooth" }); }} onMouseEnter={e => (e.currentTarget.style.background = "#fff")} onMouseLeave={e => (e.currentTarget.style.background = "#f4f6f9")} style={{ flexShrink: 0, width: 28, background: "#f4f6f9", borderRight: "1px solid var(--border)", cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none", transition: "background 0.12s" }}><svg width="6" height="10" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="7,1 2,7 7,13" /></svg></div>
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: "linear-gradient(to right, rgba(0,0,0,0.07), transparent)", zIndex: 1, pointerEvents: "none" }} />
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 14, background: "linear-gradient(to left, rgba(0,0,0,0.07), transparent)", zIndex: 1, pointerEvents: "none" }} />
            <div ref={gamesScrollRef} style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
              {week.games.map((game: any, idx: number) => {
                const now = new Date();
                const isLive = game.status === "IN_PROGRESS" ||
                  (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);
                return (
                  <div key={game.id} onMouseEnter={e => (e.currentTarget.style.background = "#fff")} onMouseLeave={e => (e.currentTarget.style.background = "#f4f6f9")} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 14px",
                    gap: 16,
                    flex: "0 0 calc(100% / 6)",
                    boxSizing: "border-box",
                    background: "#f4f6f9",
                    borderRight: "1px solid var(--border)",
                    transition: "background 0.12s",
                    cursor: "default",
                  }}>
                    {/* Teams stacked: away top, home bottom */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            <div onClick={() => { const el = gamesScrollRef.current; if (!el) return; const w = (el.firstElementChild as HTMLElement).getBoundingClientRect().width; el.scrollTo({ left: Math.round(el.scrollLeft / w + 1) * w, behavior: "smooth" }); }} onMouseEnter={e => (e.currentTarget.style.background = "#fff")} onMouseLeave={e => (e.currentTarget.style.background = "#f4f6f9")} style={{ flexShrink: 0, width: 28, background: "#f4f6f9", borderLeft: "1px solid var(--border)", marginLeft: -1, cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none", transition: "background 0.12s" }}><svg width="6" height="10" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,1 7,7 2,13" /></svg></div>
          </div>
        )}


      </div>

      {showColorPicker && (
        <div
          onClick={() => setShowColorPicker(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 20, width: 280, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 14, color: "var(--text)" }}>Choose your helmet color</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {HELMET_COLORS.map(c => {
                const taken = takenColors.has(c);
                const selected = (helmetColors[userId] ?? "#2563EB") === c;
                return (
                  <div
                    key={c}
                    onClick={() => !taken && pickColor(c)}
                    style={{
                      width: 36, height: 36, borderRadius: "50%", background: c,
                      cursor: taken ? "not-allowed" : "pointer",
                      opacity: taken ? 0.3 : 1,
                      outline: selected ? "3px solid var(--accent)" : "2px solid transparent",
                      outlineOffset: 2,
                      transition: "transform 0.1s",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isCreator && (
        <Link
          href={`/leagues/${leagueId}/settings`}
          style={{ position: "fixed", bottom: 80, right: 20, width: 44, height: 44, borderRadius: "50%", background: "#fff", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", transition: "color 0.12s, box-shadow 0.12s", zIndex: 40 }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.color = "var(--text)"; el.style.boxShadow = "0 4px 14px rgba(0,0,0,0.18)"; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.color = "var(--text-3)"; el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"; }}
        >
          <GearIcon />
        </Link>
      )}
    </>
  );
}
