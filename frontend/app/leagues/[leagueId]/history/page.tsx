"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

function calcProfit(stake: number, odds: number): number {
  if (odds > 0) return Math.round((stake * odds) / 100);
  return Math.round((stake * 100) / Math.abs(odds));
}

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

function gameStarted(gameDate?: string): boolean {
  if (!gameDate) return true;
  return new Date(gameDate) <= new Date();
}

function OutcomeBadge({ outcome, cashedOut }: { outcome: string; cashedOut?: boolean }) {
  const label = outcome === "VOID" && cashedOut ? "CASHED" : outcome;
  if (label === "WIN") return <span className="badge badge-green">WIN</span>;
  if (label === "LOSS") return <span className="badge badge-red">LOSS</span>;
  if (label === "CASHED") return <span className="badge" style={{ color: "var(--pending)", borderColor: "rgba(245,158,11,0.3)", background: "var(--pending-bg)" }}>CASHED</span>;
  if (label === "PENDING") return <span className="badge badge-yellow">PENDING</span>;
  return <span className="badge">{label}</span>;
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
  const [userId, setUserId] = useState("");

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
      setUserId(localStorage.getItem("userId") ?? "");
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

  function groupByWeek<T>(items: T[], weekNumFn: (item: T) => number | null) {
    const map = new Map<number, T[]>();
    const noWeek: T[] = [];
    for (const item of items) {
      const w = weekNumFn(item);
      if (w == null) { noWeek.push(item); continue; }
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(item);
    }
    const sorted = [...map.entries()].sort((a, b) => b[0] - a[0]);
    return { byWeek: sorted, noWeek };
  }

  function weekNet(items: any[], getOdds: (i: any) => number, getPayout?: (i: any) => number) {
    return items.reduce((sum, b) => {
      if (b.outcome === "WIN") return sum + (getPayout ? getPayout(b) - b.stake : calcProfit(Number(b.stake), getOdds(b)));
      if (b.outcome === "LOSS") return sum - Number(b.stake);
      return sum;
    }, 0);
  }

  const allBets = [
    ...picks.map((p) => ({ outcome: p.outcome, stake: p.stake, odds: p.odds ?? -110, type: "prop" })),
    ...gamePicks.map((g) => ({ outcome: g.outcome, stake: g.stake, odds: g.odds, type: "line" })),
    ...parlays.map((p) => ({ outcome: p.outcome, stake: p.stake, odds: p.totalOdds, type: "parlay", payout: p.payout })),
  ];

  const wins = allBets.filter((b) => b.outcome === "WIN").length;
  const losses = allBets.filter((b) => b.outcome === "LOSS").length;
  const pending = allBets.filter((b) => b.outcome === "PENDING").length;
  const netReturn = weekNet(allBets, (b) => b.odds, (b) => b.payout);
  const totalCount = picks.length + gamePicks.length + parlays.length;

  const propGroups = groupByWeek(picks, (p) => p.prop?.game?.week?.number ?? null);
  const lineGroups = groupByWeek(gamePicks, (g) => g.gameLine?.game?.week?.number ?? null);
  const parlayGroups = groupByWeek(parlays, (p) => {
    const g = p.legs?.[0]?.prop?.game ?? p.legs?.[0]?.gameLine?.game;
    return g?.week?.number ?? null;
  });

  return (
    <>
      <div className="page">
        <div style={{ marginBottom: 16 }}>
          <h1>History</h1>
          {league && <p className="subtitle">{league.name} · {totalCount} bet{totalCount !== 1 ? "s" : ""}</p>}
        </div>

        {loading && <div className="loading" style={{ height: "20vh" }}>Loading…</div>}

        {!loading && totalCount > 0 && (
          <>
            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
              {[
                { label: "W", value: wins, color: "var(--win)" },
                { label: "L", value: losses, color: "var(--loss)" },
                { label: "Pend", value: pending, color: "var(--pending)" },
                { label: "Net", value: (netReturn >= 0 ? "+" : "") + "$" + Math.abs(netReturn).toLocaleString(), color: netReturn >= 0 ? "var(--win)" : "var(--loss)" },
              ].map((s) => (
                <div key={s.label} className="card" style={{ margin: 0, textAlign: "center", padding: "10px 4px" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 900, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                  <div style={{ fontSize: "0.6rem", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {(wins + losses) > 0 && (
              <div className="card" style={{ marginBottom: 10, padding: "9px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-2)" }}>Win rate</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      height: 4, width: 80, background: "var(--surface-3)", borderRadius: 2, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.round((wins / (wins + losses)) * 100)}%`,
                        background: "var(--win)", borderRadius: 2,
                      }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "0.92rem" }}>
                      {Math.round((wins / (wins + losses)) * 100)}%
                    </span>
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
              <div className="empty-text">No bets yet — head to the Bet tab to get started</div>
            </div>
          </div>
        )}

        {!loading && totalCount > 0 && (
          <>
            <div className="segment" style={{ marginBottom: 14 }}>
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

            {/* ── Props ── */}
            {tab === "props" && (
              <>
                {picks.length === 0 && <div className="card"><div className="empty"><div className="empty-text">No prop bets yet</div></div></div>}
                {propGroups.byWeek.map(([wk, wkPicks]) => {
                  const net = weekNet(wkPicks, (p) => p.odds ?? -110);
                  return (
                    <div key={wk} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                          Week {wk}
                        </span>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: net >= 0 ? "var(--win)" : "var(--loss)", fontVariantNumeric: "tabular-nums" }}>
                          {net >= 0 ? "+" : ""}${net.toLocaleString()}
                        </span>
                      </div>
                      {wkPicks.map((pick: any) => {
                        const profit = pick.outcome === "WIN" ? calcProfit(Number(pick.stake), pick.odds ?? -110) : null;
                        const canCashout = pick.outcome === "PENDING" && !pick.cashedOut && !gameStarted(pick.prop?.game?.gameDate);
                        return (
                          <div key={pick.id} className="card" style={{ marginBottom: 6, padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{pick.prop?.player?.name}</div>
                                <div style={{ color: "var(--text-3)", fontSize: "0.7rem", marginTop: 2 }}>
                                  {pick.prop?.player?.position} · {pick.prop?.player?.team}
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {canCashout && (
                                  <button className="secondary" style={{ fontSize: "0.68rem", padding: "3px 9px" }} disabled={cashingOut === pick.id} onClick={() => cashOut("pick", pick.id)}>
                                    {cashingOut === pick.id ? "…" : "Cash Out"}
                                  </button>
                                )}
                                <OutcomeBadge outcome={pick.outcome} cashedOut={pick.cashedOut} />
                              </div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                              <span className="tag">{pick.prop?.statType?.split("_").join(" ")}</span>
                              <span className="tag">{pick.direction} {pick.prop?.line}</span>
                              <span style={{ color: "var(--text-2)", fontSize: "0.72rem" }}>{fmtOdds(pick.odds ?? -110)}</span>
                              <span style={{ color: "var(--text-3)", fontSize: "0.72rem" }}>stake ${pick.stake}</span>
                              {profit != null && <span style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>+${profit}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Lines ── */}
            {tab === "lines" && (
              <>
                {gamePicks.length === 0 && <div className="card"><div className="empty"><div className="empty-text">No game line bets yet</div></div></div>}
                {lineGroups.byWeek.map(([wk, wkPicks]) => {
                  const net = weekNet(wkPicks, (g) => g.odds);
                  return (
                    <div key={wk} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Week {wk}</span>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: net >= 0 ? "var(--win)" : "var(--loss)", fontVariantNumeric: "tabular-nums" }}>
                          {net >= 0 ? "+" : ""}${net.toLocaleString()}
                        </span>
                      </div>
                      {wkPicks.map((gp: any) => {
                        const profit = gp.outcome === "WIN" ? calcProfit(Number(gp.stake), gp.odds) : null;
                        const canCashout = gp.outcome === "PENDING" && !gp.cashedOut && !gameStarted(gp.gameLine?.game?.gameDate);
                        return (
                          <div key={gp.id} className="card" style={{ marginBottom: 6, padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{gp.gameLine?.label}</div>
                                <div style={{ color: "var(--text-3)", fontSize: "0.7rem", marginTop: 2 }}>
                                  {gp.gameLine?.game?.awayTeam} @ {gp.gameLine?.game?.homeTeam}
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {canCashout && (
                                  <button className="secondary" style={{ fontSize: "0.68rem", padding: "3px 9px" }} disabled={cashingOut === gp.id} onClick={() => cashOut("gamepick", gp.id)}>
                                    {cashingOut === gp.id ? "…" : "Cash Out"}
                                  </button>
                                )}
                                <OutcomeBadge outcome={gp.outcome} cashedOut={gp.cashedOut} />
                              </div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                              <span className="tag">{gp.gameLine?.market?.split("_").join(" ")}</span>
                              <span style={{ color: "var(--text-2)", fontSize: "0.72rem" }}>{fmtOdds(gp.odds)}</span>
                              <span style={{ color: "var(--text-3)", fontSize: "0.72rem" }}>stake ${gp.stake}</span>
                              {profit != null && <span style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>+${profit}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Parlays ── */}
            {tab === "parlays" && (
              <>
                {parlays.length === 0 && <div className="card"><div className="empty"><div className="empty-text">No parlays yet</div></div></div>}
                {parlayGroups.byWeek.map(([wk, wkParlays]) => {
                  const net = weekNet(wkParlays, (p) => p.totalOdds, (p) => p.payout);
                  return (
                    <div key={wk} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Week {wk}</span>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: net >= 0 ? "var(--win)" : "var(--loss)", fontVariantNumeric: "tabular-nums" }}>
                          {net >= 0 ? "+" : ""}${net.toLocaleString()}
                        </span>
                      </div>
                      {wkParlays.map((parlay: any) => {
                        const profit = parlay.outcome === "WIN" ? parlay.payout - parlay.stake : null;
                        const firstLegGame = parlay.legs?.[0]?.prop?.game ?? parlay.legs?.[0]?.gameLine?.game;
                        const canCashout = parlay.outcome === "PENDING" && !parlay.cashedOut && !gameStarted(firstLegGame?.gameDate);
                        return (
                          <div key={parlay.id} className="card" style={{ marginBottom: 8, padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: "0.92rem" }}>{parlay.legs?.length}-Leg Parlay</div>
                                <div style={{ color: "var(--text-3)", fontSize: "0.72rem", marginTop: 2 }}>
                                  {fmtOdds(parlay.totalOdds)} · stake ${parlay.stake}
                                </div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  {canCashout && (
                                    <button className="secondary" style={{ fontSize: "0.68rem", padding: "3px 9px" }} disabled={cashingOut === parlay.id} onClick={() => cashOut("parlay", parlay.id)}>
                                      {cashingOut === parlay.id ? "…" : "Cash Out"}
                                    </button>
                                  )}
                                  <OutcomeBadge outcome={parlay.outcome} cashedOut={parlay.cashedOut} />
                                </div>
                                {profit != null && <span style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>+${profit.toLocaleString()}</span>}
                                {parlay.outcome === "PENDING" && (
                                  <span style={{ color: "var(--text-2)", fontSize: "0.72rem", fontVariantNumeric: "tabular-nums" }}>to win ${(parlay.payout - parlay.stake).toLocaleString()}</span>
                                )}
                              </div>
                            </div>
                            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                              {parlay.legs?.map((leg: any, i: number) => (
                                <div key={i} style={{
                                  display: "flex", justifyContent: "space-between", alignItems: "center",
                                  padding: "5px 0",
                                  borderBottom: i < parlay.legs.length - 1 ? "1px solid var(--border)" : "none",
                                }}>
                                  <div style={{ fontSize: "0.76rem", color: "var(--text-2)", flex: 1, minWidth: 0, paddingRight: 8 }}>
                                    {leg.prop
                                      ? `${leg.prop.player?.name} ${leg.direction} ${leg.prop.line} ${leg.prop.statType?.split("_").join(" ")}`
                                      : leg.gameLine?.label ?? "—"}
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                    <span style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>{fmtOdds(leg.odds)}</span>
                                    <OutcomeBadge outcome={leg.outcome} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

    </>
  );
}
