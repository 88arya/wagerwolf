"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TeamLogo from "@/components/TeamLogo";
import { api } from "@/lib/api";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
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
  const [myHelmetColor, setMyHelmetColor] = useState("#2563EB");
  const [showIdentityEditor, setShowIdentityEditor] = useState(false);
  const [pendingColor, setPendingColor] = useState("#2563EB");
  const [nameInput, setNameInput] = useState("");
  const [abrInput, setAbrInput] = useState("");
  const [liveBetsCount, setLiveBetsCount] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const gamesScrollRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    const games: any[] = week?.games ?? [];
    if (!games.length) return;
    const el = gamesScrollRef.current;
    if (!el) return;

    const now = new Date();
    const firstUpcoming = games.findIndex(
      (g) => g.status !== "FINAL" && g.status !== "CANCELLED" && new Date(g.gameDate) > now
    );
    // All games done → anchor to last 8; otherwise anchor to first upcoming, capped so 8 always fill
    const rawIndex = firstUpcoming === -1 ? games.length : firstUpcoming;
    const targetIndex = Math.min(rawIndex, Math.max(0, games.length - 8));

    requestAnimationFrame(() => {
      const cardWidth = el.scrollWidth / games.length;
      el.scrollLeft = targetIndex * cardWidth;
    });
  }, [week]);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId } = await params;
      setLeagueId(leagueId);
      localStorage.setItem("leagueId", leagueId);

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
      try {
        const [picksData, gamePicksData, parlaysData] = await Promise.all([
          api(`/picks?leagueId=${leagueId}`),
          api(`/gamepicks?leagueId=${leagueId}`),
          api(`/parlays?leagueId=${leagueId}`),
        ]);
        const pending = [...(picksData ?? []), ...(gamePicksData ?? []), ...(parlaysData ?? [])].filter((p: any) => p.outcome === "PENDING").length;
        setLiveBetsCount(pending);
      } catch {}
    }
    load();
  }, []);

  function openIdentityEditor() {
    const me = members.find(m => m.userId === userId);
    setPendingColor(myHelmetColor);
    setNameInput(me?.displayName ?? "");
    setAbrInput(me?.abbreviation ?? "");
    setShowIdentityEditor(true);
  }

  async function saveIdentity() {
    const trimmedName = nameInput.trim();
    if (trimmedName.length < 3 || trimmedName.length > 20) return;
    let trimmedAbr = abrInput.trim().toUpperCase();
    if (!trimmedAbr) {
      trimmedAbr = trimmedName.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
      while (trimmedAbr.length < 3) trimmedAbr = trimmedAbr + (trimmedAbr[0] ?? "X");
      setAbrInput(trimmedAbr);
    }
    if (trimmedAbr.length !== 3) return;

    const { leagueId: lId } = await params;
    const uid = localStorage.getItem("userId") ?? "";
    const me = members.find(m => m.userId === uid);
    const colorChanged = pendingColor !== myHelmetColor;
    const nameChanged = trimmedName !== me?.displayName;
    const abrChanged = trimmedAbr !== me?.abbreviation;

    setShowIdentityEditor(false);
    setMyHelmetColor(pendingColor);
    setMembers(prev => prev.map(m => m.userId === uid ? {
      ...m,
      helmetColor: pendingColor,
      displayName: trimmedName,
      abbreviation: trimmedAbr,
    } : m));
    setWeekMatchups(prev => prev.map(matchup => {
      if (matchup.homeUserId !== uid && matchup.awayUserId !== uid) return matchup;
      return {
        ...matchup,
        ...(matchup.homeUserId === uid ? { homeUser: { ...matchup.homeUser, displayName: trimmedName } } : {}),
        ...(matchup.awayUserId === uid ? { awayUser: { ...matchup.awayUser, displayName: trimmedName } } : {}),
      };
    }));

    await Promise.allSettled([
      colorChanged ? api(`/leagues/${lId}/my-helmet`, { method: "PATCH", body: JSON.stringify({ helmetColor: pendingColor }) }) : Promise.resolve(),
      nameChanged ? api(`/leagues/${lId}/my-display-name`, { method: "PATCH", body: JSON.stringify({ displayName: trimmedName }) }) : Promise.resolve(),
      abrChanged ? api(`/leagues/${lId}/my-abbreviation`, { method: "PATCH", body: JSON.stringify({ abbreviation: trimmedAbr }) }) : Promise.resolve(),
    ]);
  }


  async function loadChatMessages() {
    if (!leagueId) return;
    try {
      const msgs = await api(`/leagues/${leagueId}/messages`);
      setChatMessages(msgs ?? []);
    } catch {}
  }

  async function sendChatMessage() {
    const body = chatInput.trim();
    if (!body || !leagueId) return;
    setChatInput("");
    try {
      const msg = await api(`/leagues/${leagueId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {}
  }

  useEffect(() => {
    if (!showChat || !leagueId) return;
    loadChatMessages();
    const interval = setInterval(loadChatMessages, 5000);
    return () => clearInterval(interval);
  }, [showChat, leagueId]);

  useEffect(() => {
    if (showChat) setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "auto" }), 60);
  }, [showChat]);

  const takenColors = new Set(members.filter(m => m.userId !== userId).map(m => m.helmetColor));

  const helmetColors: Record<string, string> = {};
  members.forEach(m => { helmetColors[m.userId] = m.helmetColor ?? "#2563EB"; });

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

  const RankRow = ({ m, rank, isMe, idx, total, gb }: any) => {
    const gbStr = gb === 0 ? "--" : gb % 1 === 0 ? String(gb) : String(gb);
    return (
        <div style={{
          display: "grid",
          gridTemplateColumns: RANK_COLS,
          padding: "6px 12px",
          borderBottom: idx < total - 1 ? "1px solid var(--border)" : "none",
          background: "transparent",
          alignItems: "center",
          transition: "background 0.12s",
          gap: 6,
        }}>
          <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "var(--text)" }}>{rank}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <HelmetAvatar color={helmetColors[m.userId] ?? "#2563EB"} initials={m.displayName.slice(0, 2)} size={24} />
            <span style={{ fontWeight: isMe ? 700 : 400, fontSize: "0.8rem", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 }}>
              {m.displayName.length > 7 ? m.displayName.slice(0, 7) + "…" : m.displayName}
            </span>
          </div>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>{m.wins}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>{m.losses}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>{m.ties}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>{gbStr}</span>
        </div>
    );
  };

  return (
    <>
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
          gridTemplateColumns: "270px 1fr 270px",
          gridTemplateRows: "auto auto 1fr",
          gap: "14px 14px",
          alignItems: "start",
        }}>

          {/* COL 1 ROW 1: User card */}
          {myRecord && (
            <div className="card" style={{ gridColumn: "1", gridRow: "1", padding: "14px 16px", background: "#fff", minHeight: 160, display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
              {/* Identity row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, marginTop: 10, paddingLeft: 10, paddingRight: 10 }}>
                <HelmetAvatar color={myHelmetColor} initials={myRecord.displayName.slice(0, 2)} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {myRecord.displayName}
                  </div>
                  <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {myRecord.abbreviation || myRecord.displayName.slice(0, 3).toUpperCase()}
                  </div>
                </div>
                <button
                  onClick={openIdentityEditor}
                  style={{ background: "none", border: "none", padding: 3, cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", borderRadius: 4, lineHeight: 1, flexShrink: 0 }}
                  title="Edit your league identity"
                >
                  <PencilIcon />
                </button>
              </div>
              {/* Stats */}
              <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>Balance</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>${myRecord.balance.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>Live Bets</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{liveBetsCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* COL 1 ROW 2-4: Matchups */}
          <div className="card" style={{ gridColumn: "1", gridRow: "2 / 4", padding: 0, overflow: "hidden", background: "#fff", minWidth: 0 }}>
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "#fff" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Matchups</span>
              </div>
              {(() => {
                if (weekMatchups.length === 0) return (
                  <div style={{ padding: "12px 12px" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>No matchups yet</span>
                  </div>
                );
                return weekMatchups.map((matchup: any, idx: number) => {
                  const total = weekMatchups.length;
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
                          <HelmetAvatar color={homeName === "Ghost" ? "#ffffff" : (helmetColors[matchup.homeUserId] ?? "#2563EB")} initials={homeName.slice(0, 2)} size={20} />
                          <span style={{ fontWeight: isHome ? 700 : 400, fontSize: "0.75rem", color: "var(--text)", fontStyle: homeName === "Ghost" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {homeName}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <HelmetAvatar color={awayName === "Ghost" ? "#ffffff" : (helmetColors[matchup.awayUserId] ?? "#2563EB")} initials={awayName.slice(0, 2)} size={20} />
                          <span style={{ fontWeight: isAway ? 700 : 400, fontSize: "0.75rem", color: "var(--text)", fontStyle: awayName === "Ghost" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {awayName}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>${homeScore.toFixed(2)}</span>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>${awayScore.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

          {/* CENTER TOP: League Banner */}
          <div style={{ gridColumn: "2", gridRow: "1" }}>
            <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", border: "1px solid #1e3a5f", borderRadius: "var(--radius-lg)", overflow: "hidden", position: "relative", minHeight: 160 }}>
              {/* Banner body */}
              <div style={{ padding: "20px 20px 20px", position: "relative" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1.15 }}>
                  {league.name.endsWith(" League")
                    ? <>{league.name.slice(0, -7)}<br /><span style={{ color: "rgba(255,255,255,0.55)" }}>League</span></>
                    : league.name}
                </div>
              </div>
              {/* Right panel: stats */}
              <div style={{ position: "absolute", top: 20, right: 14, display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.65)" }}>
                  <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>Format:</span> Standard
                </span>
                <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.65)" }}>
                  <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>Allowance:</span> ${league.weeklyAllowance}
                </span>
                <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.65)" }}>
                  <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>Teams:</span> {members.length}
                </span>
              </div>
            </div>
          </div>

          {/* CENTER ROW 2: Recent Activity */}
          <div style={{ gridColumn: "2", gridRow: "2" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Recent Activity</span>
              </div>
              <div style={{ padding: "18px 16px", minHeight: 160 }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>No recent activity</span>
              </div>
            </div>
          </div>

          {/* CENTER ROW 3: Power Rankings chart */}
          <div style={{ gridColumn: "2", gridRow: "3" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Power Rankings</span>
              </div>
              <div style={{ padding: "12px 16px 8px" }}>
                {(() => {
                  const N = powerRankings.length;
                  if (N === 0) return (
                    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>No members yet</span>
                    </div>
                  );

                  const W = 400, H = 190;
                  const ml = 30, mr = 16, mt = 14, mb = 32;
                  const pw = W - ml - mr;
                  const ph = H - mt - mb;
                  const yMax = Math.max(1, N - 1);

                  const xPad = 20;
                  const cx = (rank: number) =>
                    N === 1 ? ml + pw / 2 : ml + xPad + ((N - rank) / (N - 1)) * (pw - 2 * xPad);
                  const cy = (change: number) =>
                    mt + ph / 2 - (Math.max(-yMax, Math.min(yMax, change)) / yMax) * (ph / 2);

                  const yTicks = [-yMax, -Math.round(yMax / 2), 0, Math.round(yMax / 2), yMax]
                    .filter((v, i, a) => a.indexOf(v) === i);

                  // Convert rank/change to % within the plot area
                  const xPctPlot = (rank: number) => N === 1 ? 50 : (xPad + ((N - rank) / (N - 1)) * (pw - 2 * xPad)) / pw * 100;
                  const yPctPlot = (change: number) => {
                    const clamped = Math.max(-yMax, Math.min(yMax, change));
                    return (1 - clamped / yMax) / 2 * 100;
                  };

                  return (
                    <div style={{ position: "relative" }}>
                      {/* SVG for grid lines and axes only */}
                      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
                        {yTicks.map(v => (
                          <line key={v} x1={ml} x2={ml + pw} y1={cy(v)} y2={cy(v)}
                            stroke={v === 0 ? "var(--border-2)" : "var(--border)"}
                            strokeWidth={v === 0 ? 1.5 : 0.75}
                            strokeDasharray={v === 0 ? undefined : "3 3"} />
                        ))}
                        {yTicks.map(v => (
                          <text key={v} x={ml - 5} y={cy(v) + 3.5} textAnchor="end"
                            fontSize={8} fill="var(--text-3)" fontFamily="system-ui">
                            {v > 0 ? `+${v}` : v}
                          </text>
                        ))}
                        <line x1={ml} x2={ml + pw} y1={mt + ph + 6} y2={mt + ph + 6}
                          stroke="var(--border)" strokeWidth={0.75} />
                        {powerRankings.map((m: any) => (
                          <text key={m.userId} x={cx(m.powerRank)} y={H - 4} textAnchor="middle"
                            fontSize={8} fill="var(--text-3)" fontFamily="system-ui">
                            {m.powerRank}
                          </text>
                        ))}
                      </svg>

                      {/* HTML overlay for HelmetAvatar bubbles */}
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        {/* Plot area matches SVG margins as percentages */}
                        <div style={{
                          position: "absolute",
                          top: `${mt / H * 100}%`,
                          left: `${ml / W * 100}%`,
                          right: `${mr / W * 100}%`,
                          bottom: `${mb / H * 100}%`,
                        }}>
                          {powerRankings.map((m: any) => {
                            const rankChange = 0;
                            const xp = xPctPlot(m.powerRank);
                            const yp = yPctPlot(rankChange);
                            const isMe = m.userId === userId;
                            const abr = m.abbreviation || m.displayName.slice(0, 3).toUpperCase();
                            return (
                              <div key={m.userId} style={{
                                position: "absolute",
                                left: `${xp}%`,
                                top: `${yp}%`,
                                transform: "translate(-50%, -50%)",
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 3,
                                pointerEvents: "auto",
                              }}>
                                <HelmetAvatar color={m.helmetColor ?? "#2563EB"} initials={abr} size={24} />
                                <span style={{
                                  fontSize: "0.45rem",
                                  fontWeight: 800,
                                  color: "var(--text-2)",
                                  letterSpacing: "0.04em",
                                  lineHeight: 1,
                                  whiteSpace: "nowrap",
                                }}>
                                  {abr}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* RIGHT: Standings (spans both rows) */}
          <div style={{ gridColumn: "3", gridRow: "1 / 4", minWidth: 0 }}>
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
                const leader = members[0];
                return members.map((m: any, idx: number) => {
                  const total = members.length;
                  const gb = leader ? ((leader.wins - m.wins) + (m.losses - leader.losses)) / 2 : 0;
                  return <RankRow key={m.userId} m={m} rank={m.rank} isMe={m.userId === userId} idx={idx} total={total} gb={gb} />;
                });
              })()}
            </div>

          </div>

        </div>

        {/* Horizontal games strip */}
        {week?.games?.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", border: "1px solid var(--border)", background: "#fff", overflow: "hidden", borderRadius: "var(--radius-lg)" }}>
            <div onClick={() => { const el = gamesScrollRef.current; if (!el) return; const w = (el.firstElementChild as HTMLElement).getBoundingClientRect().width; el.scrollTo({ left: Math.round(el.scrollLeft / w - 1) * w, behavior: "smooth" }); }} onMouseEnter={e => (e.currentTarget.style.background = "#f4f6f9")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")} style={{ flexShrink: 0, width: 28, background: "#fff", borderRight: "1px solid var(--border)", cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none", transition: "background 0.12s" }}><svg width="6" height="10" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="7,1 2,7 7,13" /></svg></div>
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: "linear-gradient(to right, rgba(0,0,0,0.07), transparent)", zIndex: 1, pointerEvents: "none" }} />
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 14, background: "linear-gradient(to left, rgba(0,0,0,0.07), transparent)", zIndex: 1, pointerEvents: "none" }} />
            <div ref={gamesScrollRef} style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
              {week.games.map((game: any, idx: number) => {
                const now = new Date();
                const isLive = game.status === "IN_PROGRESS" ||
                  (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);
                return (
                  <div key={game.id} onClick={() => router.push(`/leagues/${leagueId}/bet?gameId=${game.id}`)} onMouseEnter={e => (e.currentTarget.style.background = "#f4f6f9")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 14px",
                    gap: 16,
                    flex: "0 0 calc(100% / 8)",
                    boxSizing: "border-box",
                    background: "#fff",
                    borderRight: "1px solid var(--border)",
                    transition: "background 0.12s",
                    cursor: "pointer",
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
            <div onClick={() => { const el = gamesScrollRef.current; if (!el) return; const w = (el.firstElementChild as HTMLElement).getBoundingClientRect().width; el.scrollTo({ left: Math.round(el.scrollLeft / w + 1) * w, behavior: "smooth" }); }} onMouseEnter={e => (e.currentTarget.style.background = "#f4f6f9")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")} style={{ flexShrink: 0, width: 28, background: "#fff", borderLeft: "1px solid var(--border)", marginLeft: -1, cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none", transition: "background 0.12s" }}><svg width="6" height="10" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,1 7,7 2,13" /></svg></div>
          </div>
        )}


      </div>

      {/* Chat tab handle */}
      <div
        onClick={() => setShowChat(v => !v)}
        style={{
          position: "fixed",
          right: showChat ? 320 : 0,
          top: "50%",
          transform: "translateY(-50%)",
          transition: "right 0.25s cubic-bezier(0.4,0,0.2,1)",
          background: "#fff",
          border: "1px solid var(--border)",
          borderRight: "none",
          borderRadius: "8px 0 0 8px",
          padding: "10px 7px",
          cursor: "pointer",
          zIndex: 36,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxShadow: "-2px 0 10px rgba(0,0,0,0.08)",
          userSelect: "none",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-3)" }}>
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>

      {/* Chat panel */}
      <div style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 60,
        width: 320,
        transform: showChat ? "translateX(0)" : "translateX(320px)",
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        background: "#fff",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 35,
        boxShadow: showChat ? "-4px 0 24px rgba(0,0,0,0.08)" : "none",
      }}>
        {/* Header */}
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--text)" }}>League Chat</span>
          <button onClick={() => setShowChat(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "2px 4px", fontSize: "1rem", lineHeight: 1, borderRadius: 4 }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {chatMessages.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>No messages yet</span>
            </div>
          )}
          {chatMessages.map((msg: any) => {
            const isOwn = msg.user?.id === userId;
            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--text-3)", marginBottom: 3 }}>
                  {isOwn ? "You" : msg.user?.displayName}
                  <span style={{ fontWeight: 400, marginLeft: 5 }}>
                    {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <div style={{
                  fontSize: "0.8rem",
                  lineHeight: 1.45,
                  color: isOwn ? "#fff" : "var(--text)",
                  background: isOwn ? "var(--accent)" : "var(--surface-2)",
                  borderRadius: isOwn ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                  padding: "7px 11px",
                  maxWidth: "82%",
                  wordBreak: "break-word",
                }}>
                  {msg.body}
                </div>
              </div>
            );
          })}
          <div ref={chatBottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexShrink: 0 }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
            placeholder="Message…"
            maxLength={500}
            style={{ flex: 1, fontSize: "0.82rem", padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: 6, outline: "none", color: "var(--text)" }}
          />
          <button
            onClick={sendChatMessage}
            disabled={!chatInput.trim()}
            style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: "0.8rem", fontWeight: 700, cursor: chatInput.trim() ? "pointer" : "default", opacity: chatInput.trim() ? 1 : 0.45, transition: "opacity 0.12s" }}
          >
            Send
          </button>
        </div>
      </div>

      {showIdentityEditor && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", position: "relative" }}>
            {/* X close */}
            <button
              onClick={() => setShowIdentityEditor(false)}
              style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontSize: "1.1rem", lineHeight: 1, padding: 2 }}
            >✕</button>

            {/* Helmet preview */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <HelmetAvatar color={pendingColor} initials={(nameInput || myRecord?.displayName || "").slice(0, 2)} size={52} />
            </div>

            {/* Color grid */}
            <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text)", marginBottom: 8 }}>Helmet color</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 16 }}>
              {HELMET_COLORS.map(c => {
                const taken = takenColors.has(c);
                const selected = pendingColor === c;
                return (
                  <div
                    key={c}
                    onClick={() => !taken && setPendingColor(c)}
                    style={{
                      width: 36, height: 36, borderRadius: 6, background: c,
                      cursor: taken ? "not-allowed" : "pointer",
                      opacity: taken ? 0.25 : 1,
                      outline: selected ? "3px solid var(--accent)" : "2px solid transparent",
                      outlineOffset: 2,
                      transition: "transform 0.1s",
                    }}
                  />
                );
              })}
            </div>

            {/* Display name */}
            <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text)", marginBottom: 6 }}>Display name</div>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value.replace(/[^A-Za-z ]/g, "").replace(/ {2,}/g, " ").slice(0, 20))}
              onKeyDown={e => { if (e.key === "Escape") setShowIdentityEditor(false); }}
              minLength={3}
              maxLength={20}
              placeholder="Your name in this league"
              style={{ width: "100%", boxSizing: "border-box", fontSize: "0.85rem", fontWeight: 600, color: "var(--text)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "7px 10px", outline: "none", marginBottom: 12 }}
            />

            {/* Abbreviation */}
            <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text)", marginBottom: 6 }}>Abbreviation</div>
            <input
              value={abrInput}
              onChange={e => setAbrInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
              onKeyDown={e => { if (e.key === "Enter") saveIdentity(); if (e.key === "Escape") setShowIdentityEditor(false); }}
              minLength={3}
              maxLength={3}
              placeholder="e.g. NYG"
              style={{ width: "100%", boxSizing: "border-box", fontSize: "0.85rem", fontWeight: 700, color: "var(--text)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "7px 10px", outline: "none", marginBottom: 16, letterSpacing: "0.08em" }}
            />

            {/* Actions */}
            <button
              onClick={saveIdentity}
              className="btn btn-primary"
              style={{ width: "100%", fontSize: "0.82rem", padding: "8px" }}
            >
              Save
            </button>
          </div>
        </div>
      )}


    </>
  );
}
