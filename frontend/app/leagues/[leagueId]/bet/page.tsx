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
  const [propSearch, setPropSearch] = useState("");
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
    }
    load();

    const onSlipUpdate = () => {
      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
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
    addToSlip({ type: "gameline", id: line.id, label: line.label, odds: line.odds });
  }

  function togglePropInSlip(prop: any, direction: "OVER" | "UNDER") {
    const key = `${prop.id}:${direction}`;
    if (slipIds.has(key)) { removeFromSlip(prop.id, direction); return; }
    // Remove the opposing direction if it's already in the slip
    const oppDir: "OVER" | "UNDER" = direction === "OVER" ? "UNDER" : "OVER";
    if (slipIds.has(`${prop.id}:${oppDir}`)) removeFromSlip(prop.id, oppDir);
    addToSlip({
      type: "prop", id: prop.id, direction,
      label: `${prop.player?.name} ${direction} ${prop.line} ${prop.statType.replaceAll("_", " ")}`,
      odds: prop.odds ?? -110,
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

    const filteredProps = gameProps.filter((p: any) => {
      const nameMatch = !propSearch || p.player?.name?.toLowerCase().includes(propSearch.toLowerCase());
      const statMatch = !propStatFilter || p.statType === propStatFilter;
      return nameMatch && statMatch;
    });

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
                        const done = submittedLines.includes(line.id);
                        const inSlip = slipIds.has(`${line.id}:`);
                        return (
                          <button
                            key={line.id}
                            type="button"
                            disabled={weekLocked || done}
                            onClick={() => !done && !weekLocked && toggleLineinSlip(line)}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "12px 14px", borderRadius: 10, cursor: done || weekLocked ? "default" : "pointer",
                              background: done ? "var(--win-bg)" : inSlip ? "var(--accent-dim)" : "var(--surface)",
                              border: done ? "1.5px solid rgba(22,163,74,0.35)" : inSlip ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                              textAlign: "left", width: "100%",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: "0.92rem", color: done ? "var(--win)" : "var(--text)" }}>{line.label}</div>
                              {line.line != null && (
                                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>line {line.line}</div>
                              )}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              {done
                                ? <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--win)" }}>✓ Placed</span>
                                : weekLocked
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
              {gameProps.length > 0 && (
                <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Search players…"
                    value={propSearch}
                    onChange={(e) => setPropSearch(e.target.value)}
                    style={{ fontSize: "0.88rem", padding: "9px 12px" }}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["", "passing_yards", "passing_touchdowns", "rushing_yards", "receiving_yards", "receptions"].map((stat) => {
                      const label = stat === "" ? "All" : stat.replaceAll("_", " ");
                      const active = propStatFilter === stat;
                      return (
                        <button key={stat} type="button" onClick={() => setPropStatFilter(stat)} style={{
                          padding: "5px 12px", fontSize: "0.76rem", fontWeight: active ? 800 : 500, borderRadius: 20,
                          background: active ? "var(--accent)" : "var(--surface-2)",
                          color: active ? "#fff" : "var(--text-2)",
                          border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                        }}>{label}</button>
                      );
                    })}
                  </div>
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
                const done = submittedProps.includes(prop.id);
                const inSlipOver = slipIds.has(`${prop.id}:OVER`);
                const inSlipUnder = slipIds.has(`${prop.id}:UNDER`);
                return (
                  <div key={prop.id} className="card" style={{ marginBottom: 8, opacity: done ? 0.65 : 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "1rem" }}>{prop.player?.name}</div>
                        <div style={{ color: "var(--text-3)", fontSize: "0.73rem", marginTop: 2 }}>
                          {prop.player?.position} · {prop.player?.team}
                        </div>
                      </div>
                      <span className="tag">{prop.statType.replaceAll("_", " ")}</span>
                    </div>

                    <div style={{
                      textAlign: "center", fontSize: "2.4rem", fontWeight: 900,
                      letterSpacing: "-0.04em", lineHeight: 1, padding: "8px 0 10px",
                      fontVariantNumeric: "tabular-nums", color: "var(--text)",
                    }}>
                      {prop.line}
                      <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--text-3)", marginLeft: 6 }}>
                        {fmtOdds(prop.odds ?? -110)}
                      </span>
                    </div>

                    {done ? (
                      <div style={{ textAlign: "center", padding: "8px 0", color: "var(--accent)", fontWeight: 700, fontSize: "0.9rem" }}>
                        ✓ Bet placed
                      </div>
                    ) : weekLocked ? (
                      <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.85rem", padding: "8px 0" }}>Locked</div>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className={`over-btn${inSlipOver ? " active" : ""}`}
                          onClick={() => togglePropInSlip(prop, "OVER")}
                          style={{ flex: 1 }}
                        >
                          {inSlipOver ? "✓ OVER" : "OVER"}
                        </button>
                        <button
                          type="button"
                          className={`under-btn${inSlipUnder ? " active" : ""}`}
                          onClick={() => togglePropInSlip(prop, "UNDER")}
                          style={{ flex: 1 }}
                        >
                          {inSlipUnder ? "✓ UNDER" : "UNDER"}
                        </button>
                      </div>
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
