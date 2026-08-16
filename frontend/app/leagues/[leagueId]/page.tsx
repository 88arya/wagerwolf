"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENT } from "@/lib/constants";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
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
  const [myHelmetColor, setMyHelmetColor] = useState(ACCENT);
  const [showIdentityEditor, setShowIdentityEditor] = useState(false);
  const [pendingColor, setPendingColor] = useState(ACCENT);
  const [nameInput, setNameInput] = useState("");
  const [abrInput, setAbrInput] = useState("");
  const [liveBetsCount, setLiveBetsCount] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  // LeagueNav's profile menu offers "Edit Profile" from every page in the
  // league, but this modal lives here — so it routes to this page with
  // ?edit=profile and this opens it. Held until members and userId have landed,
  // since the editor prefills from them; fires once, then strips the parameter
  // so a refresh or a back-navigation does not reopen it.
  // window.location rather than useSearchParams: this page is entirely client
  // rendered, and useSearchParams would force a Suspense boundary around it.
  const editParamHandledRef = useRef(false);
  useEffect(() => {
    if (editParamHandledRef.current) return;
    if (!leagueId || !userId || members.length === 0) return;
    if (new URLSearchParams(window.location.search).get("edit") !== "profile") return;
    editParamHandledRef.current = true;
    openIdentityEditor();
    router.replace(`/leagues/${leagueId}`, { scroll: false });
  }, [leagueId, userId, members, myHelmetColor]);

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
    window.dispatchEvent(new Event("league-profile-updated"));
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
  members.forEach(m => { helmetColors[m.userId] = m.helmetColor ?? ACCENT; });

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
            <HelmetAvatar color={helmetColors[m.userId] ?? ACCENT} initials={m.displayName.slice(0, 2)} size={24} />
            <span style={{ fontWeight: isMe ? 700 : 400, fontSize: "0.8rem", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 }}>
              {m.displayName.length > 7 ? m.displayName.slice(0, 7) + "…" : m.displayName}
            </span>
          </div>
          <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{m.wins}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{m.losses}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{m.ties}</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{gbStr}</span>
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
            borderRadius: "var(--radius)",
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
            <div className="card" style={{ gridColumn: "1", gridRow: "1", padding: "14px 16px", background: "var(--surface)", minHeight: 160, display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
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
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>Balance</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(myRecord.balance)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>Live Bets</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{liveBetsCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* COL 1 ROW 2-4: Matchups */}
          <div className="card" style={{ gridColumn: "1", gridRow: "2 / 4", padding: 0, overflow: "hidden", background: "var(--surface)", minWidth: 0 }}>
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
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
                          <HelmetAvatar color={homeName === "Ghost" ? "#ffffff" : (helmetColors[matchup.homeUserId] ?? ACCENT)} initials={homeName.slice(0, 2)} size={20} />
                          <span style={{ fontWeight: isHome ? 700 : 400, fontSize: "0.75rem", color: "var(--text)", fontStyle: homeName === "Ghost" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {homeName}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <HelmetAvatar color={awayName === "Ghost" ? "#ffffff" : (helmetColors[matchup.awayUserId] ?? ACCENT)} initials={awayName.slice(0, 2)} size={20} />
                          <span style={{ fontWeight: isAway ? 700 : 400, fontSize: "0.75rem", color: "var(--text)", fontStyle: awayName === "Ghost" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {awayName}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(homeScore)}</span>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(awayScore)}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

          {/* CENTER TOP: League Banner */}
          <div style={{ gridColumn: "2", gridRow: "1" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", position: "relative", minHeight: 160 }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: myHelmetColor }} />
              {/* Banner body */}
              <div style={{ padding: "20px 20px 20px", position: "relative" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", lineHeight: 1.15 }}>
                  {league.name.endsWith(" League")
                    ? <>{league.name.slice(0, -7)}<br /><span style={{ color: "var(--text-3)" }}>League</span></>
                    : league.name}
                </div>
              </div>
              {/* Right panel: stats */}
              <div style={{ position: "absolute", top: 20, right: 14, display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-2)" }}>
                  <span style={{ fontWeight: 700, color: "var(--text-3)" }}>Format:</span> Standard
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-2)" }}>
                  <span style={{ fontWeight: 700, color: "var(--text-3)" }}>Allowance:</span> {fmtMoney(league.weeklyAllowance)}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-2)" }}>
                  <span style={{ fontWeight: 700, color: "var(--text-3)" }}>Teams:</span> {members.length}
                </span>
              </div>
            </div>
          </div>

          {/* CENTER ROW 2: Recent Activity */}
          <div style={{ gridColumn: "2", gridRow: "2" }}>
            <div className="card" style={{ padding: 0, overflow: "hidden", background: "var(--surface)" }}>
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
            <div className="card" style={{ padding: 0, overflow: "hidden", background: "var(--surface)" }}>
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
                            const rankChange = m.prevRank != null ? m.prevRank - m.powerRank : 0;
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
                                <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={abr} size={24} />
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
            <div className="card" style={{ padding: 0, overflow: "hidden", background: "var(--surface)" }}>
              <div style={{ padding: "8px 12px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Standings</span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: RANK_COLS,
                padding: "6px 12px", gap: 6,
                background: "var(--surface)", borderBottom: "1px solid var(--border)",
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
          background: "var(--surface)",
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
        background: "var(--surface)",
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
          onClick={() => setShowIdentityEditor(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, padding: 24 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)" }}>League Profile</div>
              <button onClick={() => setShowIdentityEditor(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "none", borderRadius: "var(--radius-sm)", lineHeight: 1 }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "none"; }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Preview row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <HelmetAvatar color={pendingColor} initials={(abrInput || nameInput || myRecord?.displayName || "").slice(0, 2)} size={44} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nameInput || myRecord?.displayName || "—"}
                </div>
                <div style={{ fontSize: "0.62rem", color: "var(--text)", fontWeight: 700, fontStyle: "italic", letterSpacing: "0.1em", marginTop: 1 }}>
                  {abrInput || "—"}
                </div>
              </div>
            </div>

            <div className="form">
              <div>
                <div className="label">Display Name</div>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value.replace(/[^A-Za-z ]/g, "").replace(/ {2,}/g, " ").slice(0, 20))}
                  onKeyDown={e => { if (e.key === "Escape") setShowIdentityEditor(false); }}
                  minLength={3}
                  maxLength={20}
                  placeholder="Your name in this league"
                />
              </div>

              <div>
                <div className="label">Abbreviation (2–3 letters)</div>
                <input
                  value={abrInput}
                  onChange={e => setAbrInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                  onKeyDown={e => { if (e.key === "Enter") saveIdentity(); if (e.key === "Escape") setShowIdentityEditor(false); }}
                  minLength={3}
                  maxLength={3}
                  placeholder="e.g. NYG"
                  style={{ letterSpacing: "0.2em", fontWeight: 800, textTransform: "uppercase", maxWidth: 120 }}
                />
              </div>

              <div>
                <div className="label">Helmet Color</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 28px)", gap: 8, marginTop: 6 }}>
                  {HELMET_COLORS.map(c => {
                    const taken = takenColors.has(c);
                    const selected = pendingColor === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => !taken && setPendingColor(c)}
                        style={{
                          width: 28, height: 28, borderRadius: 6, background: c, padding: 0, border: "none",
                          cursor: taken ? "not-allowed" : "pointer",
                          opacity: taken ? 0.25 : 1,
                          outline: selected ? "2.5px solid var(--accent)" : "2px solid transparent",
                          outlineOffset: 2, flexShrink: 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              <button
                onClick={saveIdentity}
                style={{ width: "100%", padding: "11px", fontSize: "0.9rem", fontWeight: 700 }}
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}


    </>
  );
}
