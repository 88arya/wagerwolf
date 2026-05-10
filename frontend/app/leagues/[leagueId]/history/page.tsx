"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

function calcProfit(stake: number, odds: number): number {
  if (odds > 0) return Math.round((stake * odds) / 100);
  return Math.round((stake * 100) / Math.abs(odds));
}

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

function outcomeCard(outcome: string) {
  if (outcome === "WIN") return "card card-win";
  if (outcome === "LOSS") return "card card-loss";
  return "card";
}

function outcomeText(outcome: string) {
  if (outcome === "WIN") return "text-win";
  if (outcome === "LOSS") return "text-loss";
  return "text-pending";
}

function gameStarted(gameDate?: string): boolean {
  if (!gameDate) return true;
  return new Date(gameDate) <= new Date();
}

export default function HistoryPage({ params }: PageProps<"/leagues/[leagueId]/history">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [picks, setPicks] = useState<any[]>([]);
  const [gamePicks, setGamePicks] = useState<any[]>([]);
  const [parlays, setParlays] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [tab, setTab] = useState<"props" | "lines" | "parlays">("props");
  const [loading, setLoading] = useState(true);
  const [cashingOut, setCashingOut] = useState<string | null>(null);

  async function load(lId: string) {
    try {
      const [picksData, gamePicksData, parlaysData, leagueData] = await Promise.all([
        api(`/picks?leagueId=${lId}`),
        api(`/gamepicks?leagueId=${lId}`),
        api(`/parlays?leagueId=${lId}`),
        api(`/leagues/${lId}`),
      ]);
      setPicks(picksData);
      setGamePicks(gamePicksData);
      setParlays(parlaysData);
      setLeague(leagueData);
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId } = await params;
      setLeagueId(leagueId);
      await load(leagueId);
    }
    init();
  }, []);

  async function cashOut(type: "pick" | "gamepick" | "parlay", id: string) {
    setCashingOut(id);
    try {
      const endpoint = type === "pick" ? `/picks/${id}/cashout` : type === "gamepick" ? `/gamepicks/${id}/cashout` : `/parlays/${id}/cashout`;
      const res = await api(endpoint, { method: "POST" });
      alert(`Cashed out — $${res.refunded} refunded to your balance`);
      await load(leagueId);
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    } finally {
      setCashingOut(null);
    }
  }

  // Aggregate stats across all bet types
  const allBets = [
    ...picks.map((p) => ({ outcome: p.outcome, stake: p.stake, odds: p.odds ?? -110, type: "prop" })),
    ...gamePicks.map((g) => ({ outcome: g.outcome, stake: g.stake, odds: g.odds, type: "line" })),
    ...parlays.map((p) => ({ outcome: p.outcome, stake: p.stake, odds: p.totalOdds, type: "parlay", payout: p.payout })),
  ];

  const wins = allBets.filter((b) => b.outcome === "WIN").length;
  const losses = allBets.filter((b) => b.outcome === "LOSS").length;
  const pending = allBets.filter((b) => b.outcome === "PENDING").length;

  const netReturn = allBets.reduce((sum, b) => {
    if (b.outcome === "WIN") return sum + (b.type === "parlay" ? (b as any).payout - b.stake : calcProfit(Number(b.stake), b.odds));
    if (b.outcome === "LOSS") return sum - Number(b.stake);
    return sum;
  }, 0);

  const totalCount = picks.length + gamePicks.length + parlays.length;

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`}>‹ Home</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20 }}>
          <h1>History</h1>
          {league && <p className="subtitle">{league.name} · {totalCount} bet{totalCount !== 1 ? "s" : ""}</p>}
        </div>

        {loading && (
          <div className="card">
            <div className="empty"><div className="empty-text">Loading…</div></div>
          </div>
        )}

        {!loading && totalCount > 0 && (
          <>
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <div className="stat-cell">
                <div className="stat-cell-value text-win">{wins}</div>
                <div className="stat-cell-label">Wins</div>
              </div>
              <div className="stat-cell">
                <div className="stat-cell-value text-loss">{losses}</div>
                <div className="stat-cell-label">Losses</div>
              </div>
              <div className="stat-cell">
                <div className="stat-cell-value text-pending">{pending}</div>
                <div className="stat-cell-label">Pending</div>
              </div>
            </div>

            {(wins + losses) > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="row">
                  <div>
                    <div className="label">Win Rate</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", marginTop: 2 }}>
                      {Math.round((wins / (wins + losses)) * 100)}%
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="label">Net Return</div>
                    <div style={{
                      fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", marginTop: 2,
                      color: netReturn >= 0 ? "var(--win)" : "var(--loss)",
                    }}>
                      {netReturn >= 0 ? "+" : ""}${netReturn.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!loading && totalCount === 0 && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div className="empty-text">No bets yet. Place some bets!</div>
            </div>
          </div>
        )}

        {!loading && totalCount > 0 && (
          <>
            {/* Tab toggle */}
            <div className="segment" style={{ marginBottom: 16 }}>
              {([
                ["props", `Props (${picks.length})`],
                ["lines", `Lines (${gamePicks.length})`],
                ["parlays", `Parlays (${parlays.length})`],
              ] as const).map(([t, label]) => (
                <button key={t} className={`segment-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
                  {label}
                </button>
              ))}
            </div>

            {/* Prop picks */}
            {tab === "props" && (
              <>
                {picks.length === 0 && (
                  <div className="card"><div className="empty"><div className="empty-text">No prop bets yet</div></div></div>
                )}
                {picks.map((pick: any) => {
                  const profit = pick.outcome === "WIN" ? calcProfit(Number(pick.stake), pick.odds ?? -110) : null;
                  const canCashout = pick.outcome === "PENDING" && !pick.cashedOut && !gameStarted(pick.prop?.game?.gameDate);
                  return (
                    <div key={pick.id} className={outcomeCard(pick.outcome)} style={{ marginBottom: 8 }}>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{pick.prop?.player?.name}</div>
                          <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: 2 }}>
                            {pick.prop?.player?.position} · {pick.prop?.player?.team}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {canCashout && (
                            <button
                              className="secondary"
                              style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                              disabled={cashingOut === pick.id}
                              onClick={() => cashOut("pick", pick.id)}
                            >
                              {cashingOut === pick.id ? "…" : "Cash Out"}
                            </button>
                          )}
                          <span className={outcomeText(pick.outcome)} style={{ fontWeight: 800, fontSize: "0.9rem", letterSpacing: "0.04em" }}>
                            {pick.outcome === "VOID" && pick.cashedOut ? "CASHED" : pick.outcome}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="tag">{pick.prop?.statType?.replaceAll("_", " ")}</span>
                        <span className="tag">{pick.direction} {pick.prop?.line}</span>
                        <span style={{ color: "var(--text-2)", fontSize: "0.78rem" }}>{fmtOdds(pick.odds ?? -110)}</span>
                        <span style={{ color: "var(--text-2)", fontSize: "0.78rem" }}>stake ${pick.stake}</span>
                        {profit != null && <span style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.78rem" }}>+${profit}</span>}
                        {pick.prop?.game?.week?.number != null && (
                          <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>· Wk {pick.prop.game.week.number}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Game picks */}
            {tab === "lines" && (
              <>
                {gamePicks.length === 0 && (
                  <div className="card"><div className="empty"><div className="empty-text">No game line bets yet</div></div></div>
                )}
                {gamePicks.map((gp: any) => {
                  const profit = gp.outcome === "WIN" ? calcProfit(Number(gp.stake), gp.odds) : null;
                  const canCashout = gp.outcome === "PENDING" && !gp.cashedOut && !gameStarted(gp.gameLine?.game?.gameDate);
                  return (
                    <div key={gp.id} className={outcomeCard(gp.outcome)} style={{ marginBottom: 8 }}>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{gp.gameLine?.label}</div>
                          <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: 2 }}>
                            {gp.gameLine?.game?.homeTeam} vs {gp.gameLine?.game?.awayTeam}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {canCashout && (
                            <button
                              className="secondary"
                              style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                              disabled={cashingOut === gp.id}
                              onClick={() => cashOut("gamepick", gp.id)}
                            >
                              {cashingOut === gp.id ? "…" : "Cash Out"}
                            </button>
                          )}
                          <span className={outcomeText(gp.outcome)} style={{ fontWeight: 800, fontSize: "0.9rem", letterSpacing: "0.04em" }}>
                            {gp.outcome === "VOID" && gp.cashedOut ? "CASHED" : gp.outcome}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="tag">{gp.gameLine?.market?.replaceAll("_", " ")}</span>
                        <span style={{ color: "var(--text-2)", fontSize: "0.78rem" }}>{fmtOdds(gp.odds)}</span>
                        <span style={{ color: "var(--text-2)", fontSize: "0.78rem" }}>stake ${gp.stake}</span>
                        {profit != null && <span style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.78rem" }}>+${profit}</span>}
                        {gp.gameLine?.game?.week?.number != null && (
                          <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>· Wk {gp.gameLine.game.week.number}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Parlays */}
            {tab === "parlays" && (
              <>
                {parlays.length === 0 && (
                  <div className="card"><div className="empty"><div className="empty-text">No parlays yet</div></div></div>
                )}
                {parlays.map((parlay: any) => {
                  const profit = parlay.outcome === "WIN" ? parlay.payout - parlay.stake : null;
                  const firstLegGame = parlay.legs?.[0]?.prop?.game ?? parlay.legs?.[0]?.gameLine?.game;
                  const canCashout = parlay.outcome === "PENDING" && !parlay.cashedOut && !gameStarted(firstLegGame?.gameDate);
                  return (
                    <div key={parlay.id} className={outcomeCard(parlay.outcome)} style={{ marginBottom: 10 }}>
                      <div className="row" style={{ marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>{parlay.legs?.length}-Leg Parlay</div>
                          <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: 2 }}>
                            {fmtOdds(parlay.totalOdds)} · stake ${parlay.stake}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                            {canCashout && (
                              <button
                                className="secondary"
                                style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                                disabled={cashingOut === parlay.id}
                                onClick={() => cashOut("parlay", parlay.id)}
                              >
                                {cashingOut === parlay.id ? "…" : "Cash Out"}
                              </button>
                            )}
                            <span className={outcomeText(parlay.outcome)} style={{ fontWeight: 800, fontSize: "0.9rem", letterSpacing: "0.04em" }}>
                              {parlay.outcome === "VOID" && parlay.cashedOut ? "CASHED" : parlay.outcome}
                            </span>
                          </div>
                          {profit != null && (
                            <div style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.82rem", marginTop: 4 }}>+${profit.toLocaleString()}</div>
                          )}
                          {parlay.outcome === "PENDING" && (
                            <div style={{ color: "var(--text-2)", fontSize: "0.78rem", marginTop: 4 }}>
                              to win ${(parlay.payout - parlay.stake).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                        {parlay.legs?.map((leg: any, i: number) => (
                          <div key={i} style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "5px 0",
                            borderBottom: i < parlay.legs.length - 1 ? "1px solid var(--border)" : "none",
                          }}>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-2)" }}>
                              {leg.prop
                                ? `${leg.prop.player?.name} ${leg.direction} ${leg.prop.line} ${leg.prop.statType?.replaceAll("_", " ")}`
                                : leg.gameLine?.label ?? "—"}
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{fmtOdds(leg.odds)}</span>
                              <span className={`${outcomeText(leg.outcome)}`} style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                                {leg.outcome}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
