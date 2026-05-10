"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";
import BetSlip, { addToSlip, getBetSlip } from "@/components/BetSlip";
import TeamLogo from "@/components/TeamLogo";

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

function fmtGameTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

  const [picks, setPicks] = useState<Record<string, { direction: string; stake: string }>>({});
  const [submittedProps, setSubmittedProps] = useState<string[]>([]);
  const [lineStakes, setLineStakes] = useState<Record<string, string>>({});
  const [submittedLines, setSubmittedLines] = useState<string[]>([]);
  const [slipIds, setSlipIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId } = await params;
      setLeagueId(leagueId);
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

          const [existingPicks, existingGamePicks] = await Promise.all([
            api(`/picks?leagueId=${leagueId}`),
            api(`/gamepicks?leagueId=${leagueId}`),
          ]);

          const weekGames = week.games ?? [];
          setGames(weekGames);

          const gid = searchParams.get("gameId");
          if (gid) {
            const target = weekGames.find((g: any) => g.id === gid);
            if (target) { setSelectedGame(target); setBetTab("lines"); }
          }

          const allPropIds = new Set(weekGames.flatMap((g: any) => (g.props ?? []).map((p: any) => p.id)));
          const allLineIds = new Set(weekGames.flatMap((g: any) => (g.gameLines ?? []).map((l: any) => l.id)));
          setSubmittedProps(existingPicks.filter((p: any) => allPropIds.has(p.propId)).map((p: any) => p.propId));
          setSubmittedLines(existingGamePicks.filter((p: any) => allLineIds.has(p.gameLineId)).map((p: any) => p.gameLineId));
        }
      } catch {}

      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
    }
    load();

    const refresh = () => {
      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
    };
    window.addEventListener("betslip-update", refresh);
    return () => window.removeEventListener("betslip-update", refresh);
  }, []);

  function setPick(propId: string, field: "direction" | "stake", value: string) {
    setPicks((prev) => ({ ...prev, [propId]: { ...prev[propId], [field]: value } }));
  }

  async function placeBet(propId: string) {
    const pick = picks[propId];
    if (!pick?.direction || !pick?.stake) { setError("Select OVER or UNDER and enter a stake."); return; }
    if (Number(pick.stake) <= 0) { setError("Stake must be greater than 0."); return; }
    setError("");
    try {
      await api("/picks", {
        method: "POST",
        body: JSON.stringify({ leagueId, propId, direction: pick.direction, stake: Number(pick.stake) }),
      });
      setSubmittedProps((prev) => [...prev, propId]);
      setBalance((prev) => prev !== null ? prev - Number(pick.stake) : prev);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  async function placeLineBet(gameLineId: string) {
    const stakeStr = lineStakes[gameLineId];
    if (!stakeStr || Number(stakeStr) <= 0) { setError("Enter a valid stake."); return; }
    setError("");
    try {
      await api("/gamepicks", {
        method: "POST",
        body: JSON.stringify({ leagueId, gameLineId, stake: Number(stakeStr) }),
      });
      setSubmittedLines((prev) => [...prev, gameLineId]);
      setBalance((prev) => prev !== null ? prev - Number(stakeStr) : prev);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  function addPropToSlip(prop: any, direction: "OVER" | "UNDER") {
    const ok = addToSlip({
      type: "prop", id: prop.id, direction,
      label: `${prop.player?.name} ${direction} ${prop.line} ${prop.statType.replaceAll("_", " ")}`,
      odds: prop.odds ?? -110,
    });
    if (!ok) setError("Already in slip"); else setError("");
  }

  function addLineToSlip(line: any) {
    const ok = addToSlip({ type: "gameline", id: line.id, label: line.label, odds: line.odds });
    if (!ok) setError("Already in slip"); else setError("");
  }

  const totalBets = submittedProps.length + submittedLines.length;

  // ── Stats bar (shown in both views) ──────────────────────────────
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
      <div style={{ color: "var(--loss)", fontWeight: 700, fontSize: "0.85rem" }}>
        Betting is locked for this week
      </div>
    </div>
  );

  // ── Selected game view ────────────────────────────────────────────
  if (selectedGame) {
    const gameProps = selectedGame.props ?? [];
    const gameLinesList = selectedGame.gameLines ?? [];

    const linesByCategory = ["Moneyline", "Spread", "Total"] as const;

    return (
      <>
        <nav className="nav">
          <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
          <Link href={`/leagues/${leagueId}`}>‹ Home</Link>
        </nav>

        <div className="page">
          {/* Back button */}
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
                <div style={{ fontWeight: 700, fontSize: "0.82rem", textAlign: "center", lineHeight: 1.2 }}>
                  {selectedGame.awayTeam}
                </div>
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
                <div style={{ fontWeight: 700, fontSize: "0.82rem", textAlign: "center", lineHeight: 1.2 }}>
                  {selectedGame.homeTeam}
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Home</div>
              </div>
            </div>
          </div>

          {statsBar}
          {lockedBanner}
          {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

          {/* Lines / Props tabs */}
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
                  <div className="empty">
                    <div className="empty-icon">📊</div>
                    <div className="empty-text">No lines for this game</div>
                  </div>
                </div>
              )}

              {linesByCategory.map((cat) => {
                const catLines = gameLinesList.filter((l: any) => lineCategory(l.market) === cat);
                if (catLines.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)",
                      textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6,
                    }}>
                      {cat}
                    </div>
                    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                      {catLines.map((line: any, i: number) => {
                        const done = submittedLines.includes(line.id);
                        const inSlip = slipIds.has(`${line.id}:`);
                        return (
                          <div key={line.id} style={{
                            padding: "12px 14px",
                            borderBottom: i < catLines.length - 1 ? "1px solid var(--border)" : "none",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: done || weekLocked ? 0 : 8 }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{line.label}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, marginTop: 2 }}>
                                  {fmtOdds(line.odds)}
                                  {line.line != null && <span style={{ color: "var(--text-3)", fontWeight: 500, marginLeft: 8 }}>line {line.line}</span>}
                                </div>
                              </div>
                              {done && (
                                <span style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.85rem" }}>✓ Placed</span>
                              )}
                              {weekLocked && !done && (
                                <span style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>Locked</span>
                              )}
                            </div>
                            {!done && !weekLocked && (
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <input
                                  type="number"
                                  placeholder="Stake"
                                  min="1"
                                  value={lineStakes[line.id] ?? ""}
                                  onChange={(e) => setLineStakes((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                  style={{ flex: 1, fontSize: "0.88rem", padding: "8px 10px" }}
                                />
                                <button style={{ fontSize: "0.82rem", padding: "9px 14px", flexShrink: 0 }} onClick={() => placeLineBet(line.id)}>
                                  Bet
                                </button>
                                <button
                                  className="ghost"
                                  style={{ fontSize: "0.78rem", padding: "9px 10px", flexShrink: 0, color: inSlip ? "var(--accent)" : "var(--text-3)" }}
                                  onClick={() => addLineToSlip(line)}
                                  disabled={inSlip}
                                >
                                  {inSlip ? "✓" : "+ Slip"}
                                </button>
                              </div>
                            )}
                          </div>
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
              {gameProps.length === 0 && (
                <div className="card">
                  <div className="empty">
                    <div className="empty-icon">🎯</div>
                    <div className="empty-text">No props for this game</div>
                  </div>
                </div>
              )}

              {gameProps.map((prop: any) => {
                const done = submittedProps.includes(prop.id);
                const selected = picks[prop.id]?.direction;
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
                      letterSpacing: "-0.04em", lineHeight: 1, padding: "8px 0 6px",
                      fontVariantNumeric: "tabular-nums", color: "var(--text)",
                    }}>
                      {prop.line}
                      <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--text-3)", marginLeft: 6 }}>
                        {fmtOdds(prop.odds ?? -110)}
                      </span>
                    </div>

                    {done ? (
                      <div style={{ textAlign: "center", padding: "8px 0", color: "var(--accent)", fontWeight: 700, fontSize: "0.9rem" }}>
                        ✓ Bet submitted
                      </div>
                    ) : weekLocked ? (
                      <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.85rem", padding: "8px 0" }}>Locked</div>
                    ) : (
                      <>
                        <div style={{ display: "flex", gap: 8, marginBottom: selected ? 10 : 0 }}>
                          <button
                            className={`over-btn${selected === "OVER" ? " active" : ""}`}
                            onClick={() => setPick(prop.id, "direction", selected === "OVER" ? "" : "OVER")}
                          >
                            OVER
                          </button>
                          <button
                            className={`under-btn${selected === "UNDER" ? " active" : ""}`}
                            onClick={() => setPick(prop.id, "direction", selected === "UNDER" ? "" : "UNDER")}
                          >
                            UNDER
                          </button>
                        </div>

                        {selected && (
                          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <input
                              type="number"
                              placeholder="Stake"
                              min="1"
                              max={balance ?? undefined}
                              value={picks[prop.id]?.stake ?? ""}
                              onChange={(e) => setPick(prop.id, "stake", e.target.value)}
                              style={{ fontSize: "1rem", fontWeight: 700 }}
                            />
                            <button onClick={() => placeBet(prop.id)} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                              Bet {selected}
                            </button>
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="ghost"
                            style={{ flex: 1, fontSize: "0.73rem", padding: "6px 0", color: inSlipOver ? "var(--accent)" : "var(--text-3)" }}
                            onClick={() => addPropToSlip(prop, "OVER")}
                            disabled={inSlipOver}
                          >
                            {inSlipOver ? "✓ Over in Slip" : "+ Parlay Over"}
                          </button>
                          <button
                            className="ghost"
                            style={{ flex: 1, fontSize: "0.73rem", padding: "6px 0", color: inSlipUnder ? "var(--accent)" : "var(--text-3)" }}
                            onClick={() => addPropToSlip(prop, "UNDER")}
                            disabled={inSlipUnder}
                          >
                            {inSlipUnder ? "✓ Under in Slip" : "+ Parlay Under"}
                          </button>
                        </div>
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

      <div className="page">
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
        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        {games.length === 0 && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">🏈</div>
              <div className="empty-text">No games this week</div>
            </div>
          </div>
        )}

        {games.map((game: any) => {
          const linesCount = game.gameLines?.length ?? 0;
          const propsCount = game.props?.length ?? 0;
          const totalAvailable = linesCount + propsCount;

          const placedForGame =
            submittedProps.filter((id) => (game.props ?? []).some((p: any) => p.id === id)).length +
            submittedLines.filter((id) => (game.gameLines ?? []).some((l: any) => l.id === id)).length;

          return (
            <div
              key={game.id}
              className="card"
              onClick={() => { setSelectedGame(game); setBetTab("lines"); setError(""); }}
              style={{ marginBottom: 8, cursor: "pointer", userSelect: "none" }}
            >
              {/* Teams row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                {/* Away */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                  <TeamLogo team={game.awayTeam} size={42} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", lineHeight: 1.2 }}>{game.awayTeam}</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Away</div>
                  </div>
                </div>

                {/* @ divider */}
                <div style={{ fontWeight: 900, fontSize: "0.95rem", color: "var(--text-3)", flexShrink: 0 }}>@</div>

                {/* Home */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", flexDirection: "row-reverse" }}>
                  <TeamLogo team={game.homeTeam} size={42} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", lineHeight: 1.2 }}>{game.homeTeam}</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Home</div>
                  </div>
                </div>
              </div>

              {/* Footer row */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingTop: 10, borderTop: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                  {fmtGameTime(game.gameDate)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {placedForGame > 0 && (
                    <span style={{ fontSize: "0.7rem", color: "var(--win)", fontWeight: 700 }}>
                      {placedForGame} placed
                    </span>
                  )}
                  <span style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 600 }}>
                    {totalAvailable} bets →
                  </span>
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
