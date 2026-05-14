"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";
import BetSlip, { addToSlip, removeFromSlip, getBetSlip } from "@/components/BetSlip";
import TeamLogo from "@/components/TeamLogo";
import PlayerAvatar from "@/components/PlayerAvatar";

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

function fmtGameTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function lineCategory(market: string): "Moneyline" | "Spread" | "Total" | null {
  if (market.startsWith("MONEYLINE")) return "Moneyline";
  if (market.startsWith("SPREAD")) return "Spread";
  if (market.startsWith("TOTAL")) return "Total";
  return null;
}

export default function BetPage({ params }: PageProps<"/leagues/[leagueId]/bet">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [leagueId, setLeagueId] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [weekLocked, setWeekLocked] = useState(false);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [leagueWeekLabel, setLeagueWeekLabel] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [betSection, setBetSection] = useState<string>("lines");
  const [submittedProps, setSubmittedProps] = useState<string[]>([]);
  const [submittedLines, setSubmittedLines] = useState<string[]>([]);
  const [slipIds, setSlipIds] = useState<Set<string>>(new Set());
  const [slipLegs, setSlipLegs] = useState<any[]>([]);

  async function loadSubmitted(lid: string, weekGames: any[]) {
    try {
      const [existingPicks, existingGamePicks] = await Promise.all([
        api(`/picks?leagueId=${lid}`),
        api(`/gamepicks?leagueId=${lid}`),
      ]);
      const allPropIds = new Set(weekGames.flatMap((g: any) => (g.props ?? []).map((p: any) => p.id)));
      const allLineIds = new Set(weekGames.flatMap((g: any) => (g.gameLines ?? []).map((l: any) => l.id)));
      setSubmittedProps(existingPicks.filter((p: any) => allPropIds.has(p.propId)).map((p: any) => p.propId));
      setSubmittedLines(existingGamePicks.filter((p: any) => allLineIds.has(p.gameLineId)).map((p: any) => p.gameLineId));
    } catch {}
  }

  async function loadBalance(lid: string) {
    try {
      const memberships = await api("/memberships");
      const m = memberships.find((m: any) => m.leagueId === lid);
      if (m) setBalance(m.balance);
    } catch {}
  }

  useEffect(() => {
    let weekGamesRef: any[] = [];
    let lidRef = "";

    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId } = await params;
      setLeagueId(leagueId);
      lidRef = leagueId;
      try {
        const [weeks, memberships, leagueData] = await Promise.all([
          api(`/weeks?current=true&leagueId=${leagueId}`),
          api("/memberships"),
          api(`/leagues/${leagueId}`),
        ]);
        const m = memberships.find((m: any) => m.leagueId === leagueId);
        if (m) setBalance(m.balance);
        if (weeks?.length) {
          const week = weeks[0];
          setWeekLocked(week.locked || week.resolved);
          setWeekNumber(week.number);
          const sw = leagueData?.startWeek ?? 1;
          const rsw = leagueData?.regularSeasonWeeks ?? 13;
          const isPlayoff = week.number >= sw + rsw;
          setLeagueWeekLabel(isPlayoff
            ? `Playoff Week ${week.number - (sw + rsw) + 1}`
            : `League Week ${week.number - sw + 1} of ${rsw}`
          );
          const weekGames = week.games ?? [];
          weekGamesRef = weekGames;
          setGames(weekGames);
          await loadSubmitted(leagueId, weekGames);

          const gid = searchParams.get("gameId");
          if (gid) {
            const target = weekGames.find((g: any) => g.id === gid);
            if (target) setSelectedGame(target);
          }
        }
      } catch {}

      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
      setSlipLegs(slip);
    }
    load();

    const onSlipUpdate = () => {
      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
      setSlipLegs(slip);
    };
    const onBetPlaced = () => {
      loadBalance(lidRef);
      loadSubmitted(lidRef, weekGamesRef);
    };
    window.addEventListener("betslip-update", onSlipUpdate);
    window.addEventListener("bet-placed", onBetPlaced);
    return () => {
      window.removeEventListener("betslip-update", onSlipUpdate);
      window.removeEventListener("bet-placed", onBetPlaced);
    };
  }, []);

  const OPPOSITE_MARKET: Record<string, string> = {
    MONEYLINE_HOME: "MONEYLINE_AWAY", MONEYLINE_AWAY: "MONEYLINE_HOME",
    SPREAD_HOME: "SPREAD_AWAY", SPREAD_AWAY: "SPREAD_HOME",
    TOTAL_OVER: "TOTAL_UNDER", TOTAL_UNDER: "TOTAL_OVER",
  };

  function toggleLineinSlip(line: any) {
    const inSlip = slipIds.has(`${line.id}:`);
    if (inSlip) { removeFromSlip(line.id, undefined); return; }
    const oppMarket = OPPOSITE_MARKET[line.market];
    if (oppMarket) {
      const gameForLine = games.find((g: any) => (g.gameLines ?? []).some((l: any) => l.id === line.id));
      const oppLine = (gameForLine?.gameLines ?? []).find((l: any) => l.market === oppMarket);
      if (oppLine && slipIds.has(`${oppLine.id}:`)) removeFromSlip(oppLine.id, undefined);
    }
    addToSlip({
      type: "gameline", id: line.id, label: line.label, odds: line.odds,
      market: line.market,
      line: line.line ?? undefined,
    });
  }

  const PROP_OFFSETS = [-2, -1, 0, 1, 2];

  function propStep(statType: string): number {
    const yardTypes = [
      "PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS",
      "PASSING_LONGEST", "RUSHING_LONGEST", "RECEIVING_LONGEST", "FIELD_GOAL_LONGEST",
    ];
    if (yardTypes.includes(statType)) return 5;
    if (statType === "KICKING_POINTS") return 1;
    return 0.5;
  }

  function propBlockLine(baseLine: number, offset: number, step: number): number {
    return Math.round((baseLine + offset * step) * 100) / 100;
  }

  function propBlockOdds(baseOdds: number, baseLine: number, altLine: number, statType: string, direction: "OVER" | "UNDER"): number {
    const step = propStep(statType);
    const steps = (altLine - baseLine) / step;
    const favSteps = direction === "OVER" ? -steps : steps;
    return Math.max(-500, Math.min(500, baseOdds - Math.round(favSteps * 15)));
  }

  function toggleBlockInSlip(prop: any, direction: "OVER" | "UNDER", blockLine: number) {
    const existingLeg = slipLegs.find((l: any) => l.id === prop.id && l.direction === direction);
    const existingBlockLine = existingLeg?.altLine ?? existingLeg?.line ?? null;
    if (existingLeg && Math.abs((existingBlockLine ?? 0) - blockLine) < 0.001) {
      removeFromSlip(prop.id, direction, existingLeg.altLine);
      return;
    }
    if (existingLeg) removeFromSlip(prop.id, direction, existingLeg.altLine);
    const isDefault = Math.abs(blockLine - prop.line) < 0.001;
    addToSlip({
      type: "prop", id: prop.id, direction,
      label: `${prop.player?.name} ${direction} ${blockLine} ${(prop.statType as string).split("_").join(" ")}`,
      odds: prop.odds ?? -110,
      line: prop.line,
      statType: prop.statType,
      altLine: isDefault ? undefined : blockLine,
    });
  }

  function renderPropCard(prop: any) {
    const placed = submittedProps.includes(prop.id);
    const step = propStep(prop.statType);
    const overLeg = slipLegs.find((l: any) => l.id === prop.id && l.direction === "OVER");
    const underLeg = slipLegs.find((l: any) => l.id === prop.id && l.direction === "UNDER");

    return (
      <div key={prop.id} className="card" style={{ marginBottom: 8, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <PlayerAvatar playerId={prop.player?.id} espnId={prop.player?.espnId} imageUrl={prop.player?.imageUrl} name={prop.player?.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {prop.player?.name}
              {placed && <span style={{ fontSize: "0.68rem", color: "var(--win)", fontWeight: 700 }}>✓ bet</span>}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>
              {prop.player?.position} · {prop.player?.team}
            </div>
          </div>
        </div>

        {weekLocked ? (
          <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.85rem" }}>Locked</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            {/* Line headers */}
            <div style={{ display: "grid", gridTemplateColumns: "42px repeat(5, 1fr)", gap: 3, marginBottom: 4 }}>
              <div />
              {PROP_OFFSETS.map((offset) => {
                const blockLine = propBlockLine(prop.line, offset, step);
                const isDefault = offset === 0;
                return (
                  <div key={offset} style={{ textAlign: "center", fontSize: "0.78rem", fontWeight: isDefault ? 800 : 500, color: isDefault ? "var(--text)" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                    {blockLine}
                  </div>
                );
              })}
            </div>

            {/* OVER row */}
            {(["OVER", "UNDER"] as const).map((direction) => {
              const activeLeg = direction === "OVER" ? overLeg : underLeg;
              const activeBlockLine = activeLeg ? (activeLeg.altLine ?? activeLeg.line) : null;
              return (
                <div key={direction} style={{ display: "grid", gridTemplateColumns: "42px repeat(5, 1fr)", gap: 3, marginBottom: direction === "OVER" ? 3 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", fontSize: "0.63rem", fontWeight: 800, letterSpacing: "0.06em", color: direction === "OVER" ? "var(--accent)" : "var(--text-3)" }}>
                    {direction}
                  </div>
                  {PROP_OFFSETS.map((offset) => {
                    const blockLine = propBlockLine(prop.line, offset, step);
                    const blockOdds = propBlockOdds(prop.odds ?? -110, prop.line, blockLine, prop.statType, direction);
                    const isActive = activeBlockLine != null && Math.abs(activeBlockLine - blockLine) < 0.001;
                    const isDefault = offset === 0;
                    return (
                      <button
                        key={offset}
                        type="button"
                        onClick={() => toggleBlockInSlip(prop, direction, blockLine)}
                        style={{
                          padding: "7px 2px", borderRadius: 4, textAlign: "center", cursor: "pointer",
                          background: isActive ? "var(--accent-dim)" : isDefault ? "var(--surface-2)" : "var(--surface)",
                          border: isActive ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                          fontSize: "0.78rem", fontWeight: 800, fontVariantNumeric: "tabular-nums",
                          color: isActive ? "var(--accent)" : "var(--text-2)",
                        }}
                      >
                        {fmtOdds(blockOdds)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const statsBar = balance !== null && (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
      <div className="card" style={{ margin: 0, textAlign: "center", padding: "10px 0" }}>
        <div className="label">Balance</div>
        <div style={{ fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.03em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
          ${balance.toLocaleString()}
        </div>
      </div>
      <div className="card" style={{ margin: 0, textAlign: "center", padding: "10px 0" }}>
        <div className="label">Bets Placed</div>
        <div style={{ fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.03em", marginTop: 4, color: "var(--accent)" }}>
          {submittedProps.length + submittedLines.length}
        </div>
      </div>
    </div>
  );

  const lockedBanner = weekLocked && (
    <div style={{ background: "var(--loss-bg)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ color: "var(--loss)", fontWeight: 700, fontSize: "0.85rem" }}>Betting is locked for this week</div>
    </div>
  );

  function fmtStatType(s: string): string {
    return (s as string).split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
  }

  function renderPropSection(props: any[]) {
    const groups: Record<string, any[]> = {};
    for (const p of props) {
      if (!groups[p.statType]) groups[p.statType] = [];
      groups[p.statType].push(p);
    }
    return Object.entries(groups).map(([statType, groupProps]) => (
      <div key={statType} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>
          {fmtStatType(statType)}
        </div>
        {groupProps.map(renderPropCard)}
      </div>
    ));
  }

  // ── Selected game view ────────────────────────────────────────────
  if (selectedGame) {
    const gameProps = selectedGame.props ?? [];
    const gameLinesList = selectedGame.gameLines ?? [];
    const linesByCategory = ["Moneyline", "Spread", "Total"] as const;

    const DEFENSE_TYPES = new Set(["SACKS", "TACKLES_ASSISTS", "DEFENSIVE_INTERCEPTIONS"]);
    const KICKING_TYPES = new Set(["FIELD_GOALS_MADE", "FIELD_GOAL_LONGEST", "KICKING_POINTS", "EXTRA_POINTS_MADE"]);

    const qbProps = gameProps.filter((p: any) => p.player?.position === "QB");
    const rushingProps = gameProps.filter((p: any) =>
      (p.statType as string).includes("RUSHING") && p.player?.position !== "QB"
    );
    const receivingProps = gameProps.filter((p: any) =>
      ((p.statType as string).includes("RECEIVING") || p.statType === "RECEPTIONS" || p.statType === "RECEIVING_TARGETS") &&
      p.player?.position !== "QB"
    );
    const defenseProps = gameProps.filter((p: any) => DEFENSE_TYPES.has(p.statType));
    const kickingProps = gameProps.filter((p: any) => KICKING_TYPES.has(p.statType));

    const tabs = [
      { key: "lines", label: "Game Lines" },
      ...(qbProps.length > 0 ? [{ key: "qb", label: "QB Props" }] : []),
      ...(rushingProps.length > 0 ? [{ key: "rushing", label: "Rushing Props" }] : []),
      ...(receivingProps.length > 0 ? [{ key: "receiving", label: "Receiving Props" }] : []),
      ...(defenseProps.length > 0 ? [{ key: "defense", label: "Defense" }] : []),
      ...(kickingProps.length > 0 ? [{ key: "kicking", label: "Kicking" }] : []),
    ];

    const activeSection = tabs.some((t) => t.key === betSection) ? betSection : "lines";

    return (
      <>
        <nav className="nav">
          <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
          <Link href={`/leagues/${leagueId}`}>‹ Home</Link>
        </nav>

        <div className="page" style={{ paddingBottom: 160 }}>
          <button
            className="ghost"
            style={{ fontSize: "0.82rem", padding: "6px 12px", marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => setSelectedGame(null)}
          >
            ← All Games
          </button>

          {/* Game header */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <TeamLogo team={selectedGame.awayTeam} size={52} />
                <div style={{ fontWeight: 700, fontSize: "0.82rem", textAlign: "center", lineHeight: 1.2 }}>{selectedGame.awayTeam}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Away</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "0 8px" }}>
                <div style={{ fontWeight: 900, fontSize: "1.2rem", color: "var(--text-3)" }}>@</div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", textAlign: "center", whiteSpace: "nowrap" }}>
                  {fmtGameTime(selectedGame.gameDate)}
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <TeamLogo team={selectedGame.homeTeam} size={52} />
                <div style={{ fontWeight: 700, fontSize: "0.82rem", textAlign: "center", lineHeight: 1.2 }}>{selectedGame.homeTeam}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Home</div>
              </div>
            </div>
          </div>

          {statsBar}
          {lockedBanner}

          {/* Horizontal tab bar */}
          <div style={{ display: "flex", overflowX: "auto", borderBottom: "1.5px solid var(--border)", marginBottom: 16, gap: 0 }}>
            {tabs.map(({ key, label }) => {
              const active = activeSection === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBetSection(key)}
                  style={{
                    flexShrink: 0, padding: "10px 16px",
                    fontSize: "0.82rem", fontWeight: active ? 800 : 500,
                    background: "transparent", border: "none",
                    borderBottom: active ? "2.5px solid var(--accent)" : "2.5px solid transparent",
                    color: active ? "var(--accent)" : "var(--text-2)",
                    cursor: "pointer", marginBottom: -1.5, whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Game Lines */}
          {activeSection === "lines" && (
            <>
              {gameLinesList.length === 0 && (
                <div className="card">
                  <div className="empty"><div className="empty-icon">📊</div><div className="empty-text">No lines for this game</div></div>
                </div>
              )}
              {linesByCategory.map((cat) => {
                const catLines = gameLinesList.filter((l: any) => lineCategory(l.market) === cat);
                if (catLines.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>
                      {cat}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {catLines.map((line: any) => {
                        const placed = submittedLines.includes(line.id);
                        const inSlip = slipIds.has(`${line.id}:`);
                        return (
                          <button
                            key={line.id}
                            type="button"
                            disabled={weekLocked}
                            onClick={() => !weekLocked && toggleLineinSlip(line)}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "12px 14px", borderRadius: 6, cursor: weekLocked ? "default" : "pointer",
                              background: inSlip ? "var(--accent-dim)" : "var(--surface)",
                              border: inSlip ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                              textAlign: "left", width: "100%",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>
                                {line.label}
                                {placed && <span style={{ marginLeft: 8, fontSize: "0.68rem", color: "var(--win)", fontWeight: 700 }}>✓ bet</span>}
                              </div>
                              {line.line != null && (
                                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>line {line.line}</div>
                              )}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              {weekLocked
                                ? <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>Locked</span>
                                : (
                                  <div>
                                    <div style={{ fontSize: "1rem", fontWeight: 900, color: inSlip ? "var(--accent)" : "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                                      {fmtOdds(line.odds)}
                                    </div>
                                    {inSlip && <div style={{ fontSize: "0.68rem", color: "var(--accent)", fontWeight: 700, marginTop: 1 }}>Added ✓</div>}
                                  </div>
                                )
                              }
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {activeSection === "qb" && renderPropSection(qbProps)}
          {activeSection === "rushing" && renderPropSection(rushingProps)}
          {activeSection === "receiving" && renderPropSection(receivingProps)}
          {activeSection === "defense" && renderPropSection(defenseProps)}
          {activeSection === "kicking" && renderPropSection(kickingProps)}

          {gameLinesList.length === 0 && gameProps.length === 0 && (
            <div className="card">
              <div className="empty"><div className="empty-icon">🏈</div><div className="empty-text">No bets available for this game</div></div>
            </div>
          )}
        </div>

        <BetSlip leagueId={leagueId} />
        <BottomNav leagueId={leagueId} />
      </>
    );
  }

  // ── Games list view ───────────────────────────────────────────────
  function fmtDateHeader(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  }

  const gamesByDate: { date: string; games: any[] }[] = [];
  for (const game of games) {
    const dateKey = new Date(game.gameDate).toDateString();
    const group = gamesByDate.find((g) => g.date === dateKey);
    if (group) group.games.push(game);
    else gamesByDate.push({ date: dateKey, games: [game] });
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`}>‹ Home</Link>
      </nav>

      <div className="page" style={{ paddingBottom: 160 }}>
        {weekNumber && (
          <p className="subtitle" style={{ marginBottom: 12 }}>
            {leagueWeekLabel ?? `Week ${weekNumber}`}
            {weekLocked ? " · Locked" : ""}
          </p>
        )}

        {statsBar}
        {lockedBanner}

        {games.length === 0 && (
          <div className="card">
            <div className="empty"><div className="empty-icon">🏈</div><div className="empty-text">No games this week</div></div>
          </div>
        )}

        {gamesByDate.map(({ date, games: dayGames }) => (
          <div key={date}>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--text-2)", letterSpacing: "0.06em", margin: "16px 0 8px" }}>
              {fmtDateHeader(dayGames[0].gameDate)}
            </div>

            {dayGames.map((game: any) => {
              const lines: any[] = game.gameLines ?? [];
              const now = new Date();
              const isLive = game.status === "IN_PROGRESS" ||
                (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);

              const mlAway  = lines.find((l) => l.market === "MONEYLINE_AWAY");
              const mlHome  = lines.find((l) => l.market === "MONEYLINE_HOME");
              const spAway  = lines.find((l) => l.market === "SPREAD_AWAY");
              const spHome  = lines.find((l) => l.market === "SPREAD_HOME");
              const totOver = lines.find((l) => l.market === "TOTAL_OVER");
              const totUnder = lines.find((l) => l.market === "TOTAL_UNDER");

              function OddsBlock({ line, topLabel }: { line: any; topLabel?: string }) {
                const BLOCK: React.CSSProperties = {
                  width: 70, height: 52, borderRadius: 4, flexShrink: 0,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                  cursor: "pointer", transition: "all 0.12s",
                };
                if (!line) return <div style={{ ...BLOCK, background: "transparent", border: "1px solid var(--border)", cursor: "default", opacity: 0.3 }} />;
                const done  = submittedLines.includes(line.id);
                const inSlip = slipIds.has(`${line.id}:`);
                return (
                  <button
                    type="button"
                    disabled={weekLocked || done}
                    onClick={(e) => { e.stopPropagation(); if (!weekLocked && !done) toggleLineinSlip(line); }}
                    style={{
                      ...BLOCK,
                      background: done ? "var(--win-bg)" : inSlip ? "var(--accent-dim)" : "var(--surface-2)",
                      border: done ? "1.5px solid rgba(34,197,94,0.35)" : inSlip ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    }}
                  >
                    {topLabel && (
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: done ? "var(--win)" : "var(--text)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                        {topLabel}
                      </div>
                    )}
                    <div style={{ fontSize: "0.82rem", fontWeight: 800, color: done ? "var(--win)" : inSlip ? "var(--accent)" : "var(--accent)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {done ? "✓" : fmtOdds(line.odds)}
                    </div>
                  </button>
                );
              }

              return (
                <div key={game.id} className="card" style={{ marginBottom: 8, padding: 0, overflow: "hidden", cursor: "pointer", userSelect: "none" }}
                  onClick={() => setSelectedGame(game)}>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", gap: 4, padding: "10px 12px 4px" }}>
                    <div />
                    {["Spread", "Total", "ML"].map((h) => (
                      <div key={h} style={{ textAlign: "center", fontSize: "0.62rem", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", gap: 4, alignItems: "center", padding: "6px 12px" }}
                    onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }} onClick={() => setSelectedGame(game)}>
                      <TeamLogo team={game.awayTeam} size={30} />
                      <span style={{ fontWeight: 700, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.awayTeam}</span>
                    </div>
                    <OddsBlock line={spAway} topLabel={spAway?.line != null ? String(spAway.line > 0 ? `+${spAway.line}` : spAway.line) : undefined} />
                    <OddsBlock line={totOver} topLabel={totOver?.line != null ? `O ${totOver.line}` : undefined} />
                    <OddsBlock line={mlAway} />
                  </div>

                  <div style={{ padding: "0 12px 0 54px" }}>
                    <div style={{ fontSize: "0.62rem", color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.04em" }}>AT</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", gap: 4, alignItems: "center", padding: "6px 12px" }}
                    onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }} onClick={() => setSelectedGame(game)}>
                      <TeamLogo team={game.homeTeam} size={30} />
                      <span style={{ fontWeight: 700, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.homeTeam}</span>
                    </div>
                    <OddsBlock line={spHome} topLabel={spHome?.line != null ? String(spHome.line > 0 ? `+${spHome.line}` : spHome.line) : undefined} />
                    <OddsBlock line={totUnder} topLabel={totUnder?.line != null ? `U ${totUnder.line}` : undefined} />
                    <OddsBlock line={mlHome} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px 10px", borderTop: "1px solid var(--border)", marginTop: 6 }}>
                    <div>
                      {isLive ? (
                        <span style={{ fontSize: "0.68rem", color: "var(--win)", fontWeight: 800, letterSpacing: "0.06em" }}>LIVE</span>
                      ) : game.status === "FINAL" ? (
                        <span style={{ fontSize: "0.68rem", color: "var(--text-3)", fontWeight: 700 }}>FINAL</span>
                      ) : game.status === "CANCELLED" ? (
                        <span style={{ fontSize: "0.68rem", color: "var(--loss)", fontWeight: 700 }}>CANCELLED</span>
                      ) : (
                        <span style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>{fmtGameTime(game.gameDate)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedGame(game); }}
                      style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "1rem", fontWeight: 700, padding: 0, cursor: "pointer" }}
                    >
                      ›
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <BetSlip leagueId={leagueId} />
      <BottomNav leagueId={leagueId} />
    </>
  );
}
