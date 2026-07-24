"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

function calcProfit(stake: number, odds: number): number {
  if (odds > 0) return Math.round((stake * odds) / 100);
  return Math.round((stake * 100) / Math.abs(odds));
}

function fmtOdds(n: number) { return n > 0 ? `+${n}` : `${n}`; }

function gameStarted(dateStr?: string) {
  if (!dateStr) return true;
  return new Date(dateStr) <= new Date();
}

function OutcomeBadge({ outcome, cashedOut }: { outcome: string; cashedOut?: boolean }) {
  const label = outcome === "VOID" && cashedOut ? "CASHED" : outcome;
  if (label === "WIN")    return <span className="badge badge-green">WIN</span>;
  if (label === "LOSS")   return <span className="badge badge-red">LOSS</span>;
  if (label === "CASHED") return <span className="badge" style={{ color: "var(--pending)", borderColor: "rgba(245,158,11,0.3)", background: "var(--pending-bg)" }}>CASHED</span>;
  if (label === "PENDING") return <span className="badge badge-yellow">PENDING</span>;
  return <span className="badge">{label}</span>;
}

function CashOutBtn({ busy, onClick, full }: { busy: boolean; onClick: () => void; full?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      style={{ padding: full ? "6px" : "3px 9px", width: full ? "100%" : undefined, borderRadius: "var(--radius-sm)", fontSize: full ? "0.72rem" : "0.68rem", fontWeight: 700, background: "none", border: "1px solid var(--border-2)", color: "var(--text-2)", cursor: "pointer", boxShadow: "none" }}>
      {busy ? "…" : "Cash Out"}
    </button>
  );
}

export default function MyBetsPage({ params }: PageProps<"/leagues/[leagueId]/mybets">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [week, setWeek] = useState<any>(null);
  const [picks, setPicks] = useState<any[]>([]);
  const [gamePicks, setGamePicks] = useState<any[]>([]);
  const [parlays, setParlays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashingOut, setCashingOut] = useState<string | null>(null);

  async function load(lid: string, currentWeek: any) {
    const weekPropIds = new Set((currentWeek?.games ?? []).flatMap((g: any) => (g.props ?? []).map((p: any) => p.id)));
    const weekLineIds = new Set((currentWeek?.games ?? []).flatMap((g: any) => (g.gameLines ?? []).map((l: any) => l.id)));

    const [picksData, gamePicksData, parlaysData] = await Promise.all([
      api(`/picks?leagueId=${lid}`),
      api(`/gamepicks?leagueId=${lid}`),
      api(`/parlays?leagueId=${lid}`),
    ]);

    setPicks(picksData.filter((p: any) => weekPropIds.has(p.propId)));
    setGamePicks(gamePicksData.filter((p: any) => weekLineIds.has(p.gameLineId)));

    // parlays: include if any leg is in this week
    setParlays(parlaysData.filter((p: any) =>
      p.legs?.some((l: any) =>
        (l.propId && weekPropIds.has(l.propId)) ||
        (l.gameLineId && weekLineIds.has(l.gameLineId))
      )
    ));
  }

  useEffect(() => {
    async function init() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId: lid } = await params;
      setLeagueId(lid);

      try {
        const weeks = await api(`/weeks?current=true&leagueId=${lid}`);
        const currentWeek = weeks?.[0] ?? null;
        setWeek(currentWeek);
        await load(lid, currentWeek);
      } catch {}

      setLoading(false);
    }
    init();
  }, []);

  async function cashOut(type: "pick" | "gamepick" | "parlay", id: string) {
    setCashingOut(id);
    try {
      const endpoint = type === "pick" ? `/picks/${id}/cashout`
        : type === "gamepick" ? `/gamepicks/${id}/cashout`
        : `/parlays/${id}/cashout`;
      const res = await api(endpoint, { method: "POST" });
      alert(`Cashed out — ${fmtMoney(res.refunded)} refunded`);
      if (week) await load(leagueId, week);
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    } finally {
      setCashingOut(null);
    }
  }

  const totalBets = picks.length + gamePicks.length + parlays.length;
  const pending = [...picks, ...gamePicks, ...parlays].filter((b) => b.outcome === "PENDING").length;
  const wins    = [...picks, ...gamePicks, ...parlays].filter((b) => b.outcome === "WIN").length;
  const losses  = [...picks, ...gamePicks, ...parlays].filter((b) => b.outcome === "LOSS").length;

  const net = [
    ...picks.map((p) => ({ outcome: p.outcome, stake: Number(p.stake), odds: p.odds ?? -110 })),
    ...gamePicks.map((g) => ({ outcome: g.outcome, stake: Number(g.stake), odds: g.odds })),
    ...parlays.map((p) => ({ outcome: p.outcome, stake: Number(p.stake), odds: p.totalOdds, payout: Number(p.payout) })),
  ].reduce((sum, b) => {
    if (b.outcome === "WIN") return sum + ((b as any).payout != null ? (b as any).payout - b.stake : calcProfit(b.stake, b.odds));
    if (b.outcome === "LOSS") return sum - b.stake;
    return sum;
  }, 0);

  const allBets = [
    ...picks.map((p) => ({ kind: "pick" as const, createdAt: p.createdAt, data: p })),
    ...gamePicks.map((g) => ({ kind: "gamepick" as const, createdAt: g.createdAt, data: g })),
    ...parlays.map((p) => ({ kind: "parlay" as const, createdAt: p.createdAt, data: p })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8, alignItems: "start" } as const;

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>My Bets</div>
        {week && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
            {week.resolved ? "Final" : week.locked ? "Locked" : "Current week"} · {totalBets} bet{totalBets !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>

        {loading && <div className="loading" style={{ height: "20vh" }}>Loading…</div>}

        {!loading && !week && (
          <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>No active week</div>
        )}

        {!loading && week && totalBets === 0 && (
          <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>
            No bets placed this week — head to the Sportsbook to get started
          </div>
        )}

        {!loading && week && totalBets > 0 && (
          <>
            {/* Summary strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Wins",    value: wins,    color: "var(--win)" },
                { label: "Losses",  value: losses,  color: "var(--loss)" },
                { label: "Pending", value: pending, color: "var(--pending)" },
                { label: "Net",     value: fmtMoney(net, { sign: true }), color: net >= 0 ? "var(--win)" : "var(--loss)" },
              ].map((s) => (
                <div key={s.label} className="card" style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* All bets, most recent first */}
            <div style={grid}>
              {allBets.map(({ kind, data }) => {
                if (kind === "pick") {
                  const pick = data;
                  const profit = pick.outcome === "WIN" ? calcProfit(Number(pick.stake), pick.odds ?? -110) : null;
                  const toWin = calcProfit(Number(pick.stake), pick.odds ?? -110);
                  const canCashout = pick.outcome === "PENDING" && !pick.cashedOut && !gameStarted(pick.prop?.game?.gameDate);
                  const effectiveLine = pick.altLine ?? pick.prop?.line;
                  return (
                    <div key={pick.id} className="card" style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pick.prop?.player?.name}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-2)", marginTop: 2 }}>
                            {pick.direction} {effectiveLine} {pick.prop?.statType?.split("_").join(" ")}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 1 }}>
                            {pick.prop?.player?.position} · {pick.prop?.player?.team}
                          </div>
                        </div>
                        <OutcomeBadge outcome={pick.outcome} cashedOut={pick.cashedOut} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 10, fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                          <span>{fmtOdds(pick.odds ?? -110)}</span>
                          <span>stake {fmtMoney(pick.stake)}</span>
                          {profit != null
                            ? <span style={{ color: "var(--win)", fontWeight: 700 }}>{fmtMoney(profit, { sign: true })}</span>
                            : <span>to win {fmtMoney(toWin)}</span>
                          }
                        </div>
                        {canCashout && <CashOutBtn busy={cashingOut === pick.id} onClick={() => cashOut("pick", pick.id)} />}
                      </div>
                    </div>
                  );
                }

                if (kind === "gamepick") {
                  const gp = data;
                  const profit = gp.outcome === "WIN" ? calcProfit(Number(gp.stake), gp.odds) : null;
                  const toWin = calcProfit(Number(gp.stake), gp.odds);
                  const canCashout = gp.outcome === "PENDING" && !gp.cashedOut && !gameStarted(gp.gameLine?.game?.gameDate);
                  return (
                    <div key={gp.id} className="card" style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gp.gameLine?.label}</div>
                          <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 2 }}>
                            {gp.gameLine?.game?.awayTeam} @ {gp.gameLine?.game?.homeTeam}
                          </div>
                        </div>
                        <OutcomeBadge outcome={gp.outcome} cashedOut={gp.cashedOut} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 10, fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                          <span>{fmtOdds(gp.odds)}</span>
                          <span>stake {fmtMoney(gp.stake)}</span>
                          {profit != null
                            ? <span style={{ color: "var(--win)", fontWeight: 700 }}>{fmtMoney(profit, { sign: true })}</span>
                            : <span>to win {fmtMoney(toWin)}</span>
                          }
                        </div>
                        {canCashout && <CashOutBtn busy={cashingOut === gp.id} onClick={() => cashOut("gamepick", gp.id)} />}
                      </div>
                    </div>
                  );
                }

                // parlay
                const parlay = data;
                const profit = parlay.outcome === "WIN" ? Number(parlay.payout) - Number(parlay.stake) : null;
                const firstGame = parlay.legs?.[0]?.prop?.game ?? parlay.legs?.[0]?.gameLine?.game;
                const canCashout = parlay.outcome === "PENDING" && !parlay.cashedOut && !gameStarted(firstGame?.gameDate);
                return (
                  <div key={parlay.id} className="card" style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "0.82rem" }}>{parlay.legs?.length}-Leg Parlay</div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                          {fmtOdds(parlay.totalOdds)} · stake {fmtMoney(parlay.stake)}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <OutcomeBadge outcome={parlay.outcome} cashedOut={parlay.cashedOut} />
                        {profit != null && <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--win)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(profit, { sign: true })}</span>}
                        {parlay.outcome === "PENDING" && <span style={{ fontSize: "0.68rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>to win {fmtMoney(Number(parlay.payout) - Number(parlay.stake))}</span>}
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 7, marginBottom: canCashout ? 10 : 0 }}>
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
                    {canCashout && <CashOutBtn full busy={cashingOut === parlay.id} onClick={() => cashOut("parlay", parlay.id)} />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
