"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

function CashOutBtn({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      style={{ padding: "3px 9px", borderRadius: "var(--radius-sm)", fontSize: "0.68rem", fontWeight: 700, background: "none", border: "1px solid var(--border-2)", color: "var(--text-2)", cursor: "pointer", boxShadow: "none" }}>
      {busy ? "…" : "Cash Out"}
    </button>
  );
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
  const winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : null;

  const propGroups = groupByWeek(picks, (p) => p.prop?.game?.week?.number ?? null);
  const lineGroups = groupByWeek(gamePicks, (g) => g.gameLine?.game?.week?.number ?? null);
  const parlayGroups = groupByWeek(parlays, (p) => {
    const g = p.legs?.[0]?.prop?.game ?? p.legs?.[0]?.gameLine?.game;
    return g?.week?.number ?? null;
  });

  const WeekHeader = ({ wk, net }: { wk: number; net: number }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 2px" }}>
      <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
        Week {wk}
      </span>
      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: net >= 0 ? "var(--win)" : "var(--loss)", fontVariantNumeric: "tabular-nums" }}>
        {net >= 0 ? "+" : ""}${net.toLocaleString()}
      </span>
    </div>
  );

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>History</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
          {totalCount} bet{totalCount !== 1 ? "s" : ""} all season
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>

        {loading && <div className="loading" style={{ height: "20vh" }}>Loading…</div>}

        {!loading && totalCount === 0 && (
          <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>
            No bets yet — head to the Sportsbook to get started
          </div>
        )}

        {!loading && totalCount > 0 && (
          <>
            {/* Summary strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Wins", value: wins, color: "var(--win)" },
                { label: "Losses", value: losses, color: "var(--loss)" },
                { label: "Pending", value: pending, color: "var(--pending)" },
                { label: "Win Rate", value: winRate != null ? `${winRate}%` : "—", color: "var(--text)" },
                { label: "Net", value: (netReturn >= 0 ? "+" : "-") + "$" + Math.abs(netReturn).toLocaleString(), color: netReturn >= 0 ? "var(--win)" : "var(--loss)" },
              ].map((s) => (
                <div key={s.label} className="card" style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="tab-bar" style={{ marginBottom: 16 }}>
              {([
                ["props", `Props (${picks.length})`],
                ["lines", `Game Lines (${gamePicks.length})`],
                ["parlays", `Parlays (${parlays.length})`],
              ] as const).map(([t, label]) => (
                <button key={t} className={`tab-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Props ── */}
            {tab === "props" && (
              <>
                {picks.length === 0 && <div style={{ padding: "16px 2px", color: "var(--text-3)", fontSize: "0.8rem" }}>No prop bets yet</div>}
                {propGroups.byWeek.map(([wk, wkPicks]) => {
                  const net = weekNet(wkPicks, (p) => p.odds ?? -110);
                  return (
                    <div key={wk} style={{ marginBottom: 20 }}>
                      <WeekHeader wk={wk} net={net} />
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8, alignItems: "start" }}>
                        {wkPicks.map((pick: any) => {
                          const profit = pick.outcome === "WIN" ? calcProfit(Number(pick.stake), pick.odds ?? -110) : null;
                          const canCashout = pick.outcome === "PENDING" && !pick.cashedOut && !gameStarted(pick.prop?.game?.gameDate);
                          return (
                            <div key={pick.id} className="card" style={{ padding: "11px 14px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
                                <div style={{ minWidth: 0, paddingRight: 8 }}>
                                  <div style={{ fontWeight: 700, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pick.prop?.player?.name}</div>
                                  <div style={{ color: "var(--text-3)", fontSize: "0.68rem", marginTop: 1 }}>
                                    {pick.prop?.player?.position} · {pick.prop?.player?.team}
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                  {canCashout && <CashOutBtn busy={cashingOut === pick.id} onClick={() => cashOut("pick", pick.id)} />}
                                  <OutcomeBadge outcome={pick.outcome} cashedOut={pick.cashedOut} />
                                </div>
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: "0.72rem", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                                <span style={{ fontWeight: 500, color: "var(--text)" }}>
                                  {pick.direction} {pick.altLine ?? pick.prop?.line} {pick.prop?.statType?.split("_").join(" ")}
                                </span>
                                <span>{fmtOdds(pick.odds ?? -110)}</span>
                                <span style={{ color: "var(--text-3)" }}>stake ${pick.stake}</span>
                                {profit != null && <span style={{ color: "var(--win)", fontWeight: 700 }}>+${profit}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Lines ── */}
            {tab === "lines" && (
              <>
                {gamePicks.length === 0 && <div style={{ padding: "16px 2px", color: "var(--text-3)", fontSize: "0.8rem" }}>No game line bets yet</div>}
                {lineGroups.byWeek.map(([wk, wkPicks]) => {
                  const net = weekNet(wkPicks, (g) => g.odds);
                  return (
                    <div key={wk} style={{ marginBottom: 20 }}>
                      <WeekHeader wk={wk} net={net} />
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8, alignItems: "start" }}>
                        {wkPicks.map((gp: any) => {
                          const profit = gp.outcome === "WIN" ? calcProfit(Number(gp.stake), gp.odds) : null;
                          const canCashout = gp.outcome === "PENDING" && !gp.cashedOut && !gameStarted(gp.gameLine?.game?.gameDate);
                          return (
                            <div key={gp.id} className="card" style={{ padding: "11px 14px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
                                <div style={{ minWidth: 0, paddingRight: 8 }}>
                                  <div style={{ fontWeight: 700, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gp.gameLine?.label}</div>
                                  <div style={{ color: "var(--text-3)", fontSize: "0.68rem", marginTop: 1 }}>
                                    {gp.gameLine?.game?.awayTeam} @ {gp.gameLine?.game?.homeTeam}
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                  {canCashout && <CashOutBtn busy={cashingOut === gp.id} onClick={() => cashOut("gamepick", gp.id)} />}
                                  <OutcomeBadge outcome={gp.outcome} cashedOut={gp.cashedOut} />
                                </div>
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: "0.72rem", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                                <span style={{ fontWeight: 500, color: "var(--text)" }}>{gp.gameLine?.market?.split("_").join(" ")}</span>
                                <span>{fmtOdds(gp.odds)}</span>
                                <span style={{ color: "var(--text-3)" }}>stake ${gp.stake}</span>
                                {profit != null && <span style={{ color: "var(--win)", fontWeight: 700 }}>+${profit}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Parlays ── */}
            {tab === "parlays" && (
              <>
                {parlays.length === 0 && <div style={{ padding: "16px 2px", color: "var(--text-3)", fontSize: "0.8rem" }}>No parlays yet</div>}
                {parlayGroups.byWeek.map(([wk, wkParlays]) => {
                  const net = weekNet(wkParlays, (p) => p.totalOdds, (p) => p.payout);
                  return (
                    <div key={wk} style={{ marginBottom: 20 }}>
                      <WeekHeader wk={wk} net={net} />
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8, alignItems: "start" }}>
                        {wkParlays.map((parlay: any) => {
                          const profit = parlay.outcome === "WIN" ? parlay.payout - parlay.stake : null;
                          const firstLegGame = parlay.legs?.[0]?.prop?.game ?? parlay.legs?.[0]?.gameLine?.game;
                          const canCashout = parlay.outcome === "PENDING" && !parlay.cashedOut && !gameStarted(firstLegGame?.gameDate);
                          return (
                            <div key={parlay.id} className="card" style={{ padding: "11px 14px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: "0.82rem" }}>{parlay.legs?.length}-Leg Parlay</div>
                                  <div style={{ color: "var(--text-3)", fontSize: "0.68rem", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                                    {fmtOdds(parlay.totalOdds)} · stake ${parlay.stake}
                                  </div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    {canCashout && <CashOutBtn busy={cashingOut === parlay.id} onClick={() => cashOut("parlay", parlay.id)} />}
                                    <OutcomeBadge outcome={parlay.outcome} cashedOut={parlay.cashedOut} />
                                  </div>
                                  {profit != null && <span style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>+${profit.toLocaleString()}</span>}
                                  {parlay.outcome === "PENDING" && (
                                    <span style={{ color: "var(--text-3)", fontSize: "0.68rem", fontVariantNumeric: "tabular-nums" }}>to win ${(parlay.payout - parlay.stake).toLocaleString()}</span>
                                  )}
                                </div>
                              </div>
                              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 7 }}>
                                {parlay.legs?.map((leg: any, i: number) => (
                                  <div key={i} style={{
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    padding: "5px 0",
                                    borderBottom: i < parlay.legs.length - 1 ? "1px solid var(--border)" : "none",
                                  }}>
                                    <div style={{ fontSize: "0.72rem", color: "var(--text-2)", flex: 1, minWidth: 0, paddingRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {leg.prop
                                        ? `${leg.prop.player?.name} ${leg.direction} ${leg.altLine ?? leg.prop.line} ${leg.prop.statType?.split("_").join(" ")}`
                                        : leg.gameLine?.label ?? "—"}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                      <span style={{ fontSize: "0.68rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{fmtOdds(leg.odds)}</span>
                                      <OutcomeBadge outcome={leg.outcome} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
