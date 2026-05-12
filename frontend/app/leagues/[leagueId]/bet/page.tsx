"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";
import BetSlip, { addToSlip, removeFromSlip, getBetSlip } from "@/components/BetSlip";
import TeamLogo from "@/components/TeamLogo";

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
  const [betTab, setBetTab] = useState<"lines" | "props">("lines");
  const [submittedProps, setSubmittedProps] = useState<string[]>([]);
  const [submittedLines, setSubmittedLines] = useState<string[]>([]);
  const [slipIds, setSlipIds] = useState<Set<string>>(new Set());
  const [slipLegs, setSlipLegs] = useState<any[]>([]);
  const [propStatFilter, setPropStatFilter] = useState("");

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
            if (target) { setSelectedGame(target); setBetTab("lines"); }
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
    // Remove the opposing side (same game, opposite market) if it's in the slip
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
    if (statType === "PASSING_YARDS" || statType === "RUSHING_YARDS" || statType === "RECEIVING_YARDS") return 5;
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

    // Clicking the same block → deselect
    if (existingLeg && Math.abs((existingBlockLine ?? 0) - blockLine) < 0.001) {
      removeFromSlip(prop.id, direction, existingLeg.altLine);
      return;
    }

    // Replace any existing leg for this direction
    if (existingLeg) removeFromSlip(prop.id, direction, existingLeg.altLine);

    const isDefault = Math.abs(blockLine - prop.line) < 0.001;
    addToSlip({
      type: "prop", id: prop.id, direction,
      label: `${prop.player?.name} ${direction} ${blockLine} ${prop.statType.replaceAll("_", " ")}`,
      odds: prop.odds ?? -110,
      line: prop.line,
      statType: prop.statType,
      altLine: isDefault ? undefined : blockLine,
    });
  }

  const totalBets = submittedProps.length + submittedLines.length;

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
          {totalBets}
        </div>
      </div>
    </div>
  );

  const lockedBanner = weekLocked && (
    <div style={{
      background: "var(--loss-bg)", border: "1px solid rgba(220,38,38,0.25)",
      borderRadius: 8, padding: "10px 14px", marginBottom: 12,
    }}>
      <div style={{ color: "var(--loss)", fontWeight: 700, fontSize: "0.85rem" }}>Betting is locked for this week</div>
    </div>
  );

  // ── Selected game view ────────────────────────────────────────────
  if (selectedGame) {
    const gameProps = selectedGame.props ?? [];
    const gameLinesList = selectedGame.gameLines ?? [];
    const linesByCategory = ["Moneyline", "Spread", "Total"] as const;

    const filteredProps = gameProps.filter((p: any) =>
      !propStatFilter || p.statType === propStatFilter
    );

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

          <div className="segment" style={{ marginBottom: 14 }}>
            <button className={`segment-btn${betTab === "lines" ? " active" : ""}`} onClick={() => setBetTab("lines")}>
              Lines ({gameLinesList.length})
            </button>
            <button className={`segment-btn${betTab === "props" ? " active" : ""}`} onClick={() => setBetTab("props")}>
              Props ({gameProps.length})
            </button>
          </div>

          {/* ── Lines tab ── */}
          {betTab === "lines" && (
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
                              padding: "12px 14px", borderRadius: 10, cursor: weekLocked ? "default" : "pointer",
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

          {/* ── Props tab ── */}
          {betTab === "props" && (
            <>
              {/* Stat type filter tabs */}
              {gameProps.length > 0 && (
                <div style={{ display: "flex", gap: 0, marginBottom: 14, overflowX: "auto", borderBottom: "1.5px solid var(--border)" }}>
                  {[
                    { key: "", label: "All" },
                    { key: "PASSING_YARDS", label: "Passing" },
                    { key: "RUSHING_YARDS", label: "Rushing" },
                    { key: "RECEIVING_YARDS", label: "Receiving" },
                    { key: "TOUCHDOWNS", label: "TDs" },
                    { key: "RECEPTIONS", label: "Receptions" },
                  ].map(({ key, label }) => {
                    const active = propStatFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPropStatFilter(key)}
                        style={{
                          flexShrink: 0, padding: "9px 14px", fontSize: "0.82rem",
                          fontWeight: active ? 800 : 500, background: "transparent", border: "none",
                          borderBottom: active ? "2.5px solid var(--accent)" : "2.5px solid transparent",
                          color: active ? "var(--accent)" : "var(--text-2)",
                          cursor: "pointer", marginBottom: -1.5,
                        }}
                      >{label}</button>
                    );
                  })}
                </div>
              )}

              {filteredProps.length === 0 && (
                <div className="card">
                  <div className="empty">
                    <div className="empty-icon">🎯</div>
                    <div className="empty-text">{gameProps.length === 0 ? "No props for this game" : "No matching props"}</div>
                  </div>
                </div>
              )}

              {filteredProps.map((prop: any) => {
                const placed = submittedProps.includes(prop.id);
                const step = propStep(prop.statType);
                const overLeg = slipLegs.find((l: any) => l.id === prop.id && l.direction === "OVER");
                const underLeg = slipLegs.find((l: any) => l.id === prop.id && l.direction === "UNDER");

                return (
                  <div key={prop.id} className="card" style={{ marginBottom: 8, padding: "12px 14px" }}>
                    {/* Player header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      {prop.player?.imageUrl ? (
                        <img
                          src={prop.player.imageUrl}
                          alt={prop.player.name}
                          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "var(--surface-2)" }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div style={{
                          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                          background: "var(--surface-2)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "1.1rem", fontWeight: 800, color: "var(--text-3)",
                        }}>
                          {prop.player?.name?.[0] ?? "?"}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {prop.player?.name}
                          {placed && <span style={{ fontSize: "0.68rem", color: "var(--win)", fontWeight: 700 }}>✓ bet</span>}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>
                          {prop.player?.position} · {prop.player?.team}
                        </div>
                      </div>
                      <span className="tag" style={{ flexShrink: 0 }}>{prop.statType.replaceAll("_", " ")}</span>
                    </div>

                    {weekLocked ? (
                      <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.85rem" }}>Locked</div>
                    ) : (
                      <>
                        {(["OVER", "UNDER"] as const).map((direction) => {
                          const activeLeg = direction === "OVER" ? overLeg : underLeg;
                          const activeBlockLine = activeLeg ? (activeLeg.altLine ?? activeLeg.line) : null;

                          return (
                            <div key={direction} style={{ marginBottom: direction === "OVER" ? 8 : 0 }}>
                              <div style={{
                                fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em",
                                color: direction === "OVER" ? "var(--accent)" : "var(--text-3)",
                                marginBottom: 5,
                              }}>{direction}</div>
                              <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
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
                                        flex: "0 0 62px", padding: "8px 4px", borderRadius: 8,
                                        textAlign: "center", cursor: "pointer",
                                        background: isActive ? "var(--accent-dim)" : isDefault ? "var(--surface-2)" : "var(--surface)",
                                        border: isActive ? "1.5px solid var(--accent)" : isDefault ? "1.5px solid var(--border)" : "1px solid var(--border)",
                                      }}
                                    >
                                      <div style={{
                                        fontSize: "0.9rem", fontWeight: 800, fontVariantNumeric: "tabular-nums",
                                        color: isActive ? "var(--accent)" : "var(--text)",
                                      }}>{blockLine}</div>
                                      <div style={{
                                        fontSize: "0.72rem", fontWeight: 700, marginTop: 3,
                                        color: isActive ? "var(--accent)" : "var(--text-2)",
                                      }}>{fmtOdds(blockOdds)}</div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <BetSlip leagueId={leagueId} />
        <BottomNav leagueId={leagueId} />
      </>
    );
  }

  // ── Games list view ───────────────────────────────────────────────
  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`}>‹ Home</Link>
      </nav>

      <div className="page" style={{ paddingBottom: 160 }}>
        <div style={{ marginBottom: 16 }}>
          <h1>Bet</h1>
          {weekNumber && (
            <p className="subtitle">
              {leagueWeekLabel ?? `Week ${weekNumber}`}
              {weekLocked ? " · Locked" : ""}
            </p>
          )}
        </div>

        {statsBar}
        {lockedBanner}

        {games.length === 0 && (
          <div className="card">
            <div className="empty"><div className="empty-icon">🏈</div><div className="empty-text">No games this week</div></div>
          </div>
        )}

        {games.map((game: any) => {
          const lines: any[] = game.gameLines ?? [];
          const propsCount = game.props?.length ?? 0;
          const placedForGame =
            submittedProps.filter((id) => (game.props ?? []).some((p: any) => p.id === id)).length +
            submittedLines.filter((id) => lines.some((l) => l.id === id)).length;

          const mlAway = lines.find((l) => l.market === "MONEYLINE_AWAY");
          const mlHome = lines.find((l) => l.market === "MONEYLINE_HOME");
          const spAway = lines.find((l) => l.market === "SPREAD_AWAY");
          const spHome = lines.find((l) => l.market === "SPREAD_HOME");
          const totOver = lines.find((l) => l.market === "TOTAL_OVER");
          const totUnder = lines.find((l) => l.market === "TOTAL_UNDER");
          const hasQuickLines = mlAway || mlHome || spAway || spHome || totOver || totUnder;

          function shortName(full: string) { return full.split(" ").slice(-1)[0]; }

          function OddsChip({ line, label }: { line: any; label: string }) {
            if (!line) return null;
            const done = submittedLines.includes(line.id);
            const inSlip = slipIds.has(`${line.id}:`);
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!weekLocked && !done) toggleLineinSlip(line);
                }}
                disabled={weekLocked || done}
                style={{
                  flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: "0.73rem", fontWeight: 700,
                  background: done ? "var(--win-bg)" : inSlip ? "var(--accent-dim)" : "var(--surface-2)",
                  color: done ? "var(--win)" : inSlip ? "var(--accent)" : "var(--text-2)",
                  border: done ? "1px solid rgba(22,163,74,0.3)" : inSlip ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  cursor: weekLocked || done ? "default" : "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 1, lineHeight: 1.3,
                }}
              >
                <span style={{ fontSize: "0.65rem", color: done ? "var(--win)" : "var(--text-3)", fontWeight: 500 }}>{label}</span>
                <span>{done ? "✓" : fmtOdds(line.odds)}</span>
                {line.line != null && <span style={{ fontSize: "0.6rem", color: "var(--text-3)", fontWeight: 400 }}>{line.line}</span>}
              </button>
            );
          }

          return (
            <div
              key={game.id}
              className="card"
              onClick={() => { setSelectedGame(game); setBetTab("lines"); }}
              style={{ marginBottom: 8, cursor: "pointer", userSelect: "none", padding: "14px 14px 0" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                  <TeamLogo team={game.awayTeam} size={40} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{game.awayTeam}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Away</div>
                  </div>
                </div>
                <div style={{ fontWeight: 900, fontSize: "0.95rem", color: "var(--text-3)", flexShrink: 0 }}>@</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", flexDirection: "row-reverse" }}>
                  <TeamLogo team={game.homeTeam} size={40} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{game.homeTeam}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Home</div>
                  </div>
                </div>
              </div>

              {hasQuickLines && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }} onClick={(e) => e.stopPropagation()}>
                  {(mlAway || mlHome) && (
                    <div style={{ display: "flex", gap: 5 }}>
                      <OddsChip line={mlAway} label={shortName(game.awayTeam) + " ML"} />
                      <OddsChip line={mlHome} label={shortName(game.homeTeam) + " ML"} />
                    </div>
                  )}
                  {(spAway || spHome) && (
                    <div style={{ display: "flex", gap: 5 }}>
                      <OddsChip line={spAway} label={shortName(game.awayTeam) + " SP"} />
                      <OddsChip line={spHome} label={shortName(game.homeTeam) + " SP"} />
                    </div>
                  )}
                  {(totOver || totUnder) && (
                    <div style={{ display: "flex", gap: 5 }}>
                      <OddsChip line={totOver} label={"O " + (totOver?.line ?? "")} />
                      <OddsChip line={totUnder} label={"U " + (totUnder?.line ?? "")} />
                    </div>
                  )}
                </div>
              )}

              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0 14px", borderTop: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>{fmtGameTime(game.gameDate)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {placedForGame > 0 && (
                    <span style={{ fontSize: "0.7rem", color: "var(--win)", fontWeight: 700 }}>{placedForGame} placed</span>
                  )}
                  {propsCount > 0 && (
                    <span style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 600 }}>{propsCount} props →</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BetSlip leagueId={leagueId} />
      <BottomNav leagueId={leagueId} />
    </>
  );
}
