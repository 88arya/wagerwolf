"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import PlacedBetCard, { type BetKind } from "@/components/PlacedBetCard";

function calcProfit(stake: number, odds: number): number {
  if (odds > 0) return Math.round((stake * odds) / 100);
  return Math.round((stake * 100) / Math.abs(odds));
}

export default function HistoryPage({ params }: PageProps<"/leagues/[leagueId]/history">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [picks, setPicks] = useState<any[]>([]);
  const [gamePicks, setGamePicks] = useState<any[]>([]);
  const [parlays, setParlays] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
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

  async function cashOut(type: BetKind, id: string) {
    setCashingOut(id);
    try {
      const endpoint = type === "pick" ? `/picks/${id}/cashout` : type === "gamepick" ? `/gamepicks/${id}/cashout` : `/parlays/${id}/cashout`;
      const res = await api(endpoint, { method: "POST" });
      alert(`Cashed out — ${fmtMoney(res.refunded)} refunded to your balance`);
      await load(leagueId);
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    } finally {
      setCashingOut(null);
    }
  }

  function weekNet(items: any[]) {
    return items.reduce((sum, b) => {
      const odds = b.kind === "parlay" ? b.data.totalOdds : (b.data.odds ?? -110);
      if (b.data.outcome === "WIN") {
        return sum + (b.kind === "parlay" ? Number(b.data.payout) - Number(b.data.stake) : calcProfit(Number(b.data.stake), odds));
      }
      if (b.data.outcome === "LOSS") return sum - Number(b.data.stake);
      return sum;
    }, 0);
  }

  const allBets = [
    ...picks.map((p) => ({ kind: "pick" as const, data: p, week: p.prop?.game?.week?.number ?? null })),
    ...gamePicks.map((g) => ({ kind: "gamepick" as const, data: g, week: g.gameLine?.game?.week?.number ?? null })),
    ...parlays.map((p) => ({
      kind: "parlay" as const, data: p,
      week: (p.legs?.[0]?.prop?.game ?? p.legs?.[0]?.gameLine?.game)?.week?.number ?? null,
    })),
  ];

  const totalCount = allBets.length;

  const weekMap = new Map<number, typeof allBets>();
  const noWeek: typeof allBets = [];
  for (const b of allBets) {
    if (b.week == null) { noWeek.push(b); continue; }
    if (!weekMap.has(b.week)) weekMap.set(b.week, []);
    weekMap.get(b.week)!.push(b);
  }
  const byWeek = [...weekMap.entries()].sort((a, b) => b[0] - a[0]);

  const WeekHeader = ({ wk, net }: { wk: number; net: number }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 2px" }}>
      <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
        Week {wk}
      </span>
      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: net >= 0 ? "var(--win)" : "var(--loss)", fontVariantNumeric: "tabular-nums" }}>
        {fmtMoney(net, { sign: true })}
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
            {byWeek.map(([wk, wkBets]) => (
              <div key={wk} style={{ marginBottom: 20 }}>
                <WeekHeader wk={wk} net={weekNet(wkBets)} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8, alignItems: "start" }}>
                  {wkBets.map((b) => (
                    <PlacedBetCard key={b.data.id} kind={b.kind} data={b.data} cashingOut={cashingOut} onCashOut={cashOut} />
                  ))}
                </div>
              </div>
            ))}

            {noWeek.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8, alignItems: "start" }}>
                  {noWeek.map((b) => (
                    <PlacedBetCard key={b.data.id} kind={b.kind} data={b.data} cashingOut={cashingOut} onCashOut={cashOut} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
