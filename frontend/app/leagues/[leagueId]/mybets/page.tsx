"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import PlacedBetCard, { type BetKind } from "@/components/PlacedBetCard";

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

  async function cashOut(type: BetKind, id: string) {
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
            {/* All bets, most recent first */}
            <div style={grid}>
              {allBets.map(({ kind, data }) => (
                <PlacedBetCard
                  key={data.id}
                  kind={kind}
                  data={data}
                  cashingOut={cashingOut}
                  onCashOut={cashOut}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
