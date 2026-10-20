"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api";
import { getCached, readCached, setCached } from "@/lib/pageCache";
import { fmtMoney } from "@/lib/money";
import PlacedBetCard, { type BetKind } from "@/components/PlacedBetCard";
import type { Game, GamePick, Parlay, Pick, Week } from "@/lib/types";

type Cached = { week: Week | null; picks: Pick[]; gamePicks: GamePick[]; parlays: Parlay[] };

/** League-scoped: the sidebar switches leagues without unmounting this page. */
const cacheKey = (leagueId: string) => `mybets:${leagueId}`;

export default function MyBetsPage({ params }: PageProps<"/leagues/[leagueId]/mybets">) {
  const router = useRouter();
  const { leagueId } = use(params);
  const cached = getCached<Cached>(cacheKey(leagueId));

  const [week, setWeek] = useState<Week | null>(cached?.week ?? null);
  const [picks, setPicks] = useState<Pick[]>(cached?.picks ?? []);
  const [gamePicks, setGamePicks] = useState<GamePick[]>(cached?.gamePicks ?? []);
  const [parlays, setParlays] = useState<Parlay[]>(cached?.parlays ?? []);
  const [loading, setLoading] = useState(!cached);
  const [cashingOut, setCashingOut] = useState<string | null>(null);

  async function load(lid: string, currentWeek: Week | null, gate = true) {
    const weekId = currentWeek?.id;
    const inWeek = (game?: Game) => weekId != null && game?.weekId === weekId;

    const [picksData, gamePicksData, parlaysData] = await Promise.all([
      api<Pick[]>(`/picks?leagueId=${lid}`, undefined, { gate }),
      api<GamePick[]>(`/gamepicks?leagueId=${lid}`, undefined, { gate }),
      api<Parlay[]>(`/parlays?leagueId=${lid}`, undefined, { gate }),
    ]);

    const nextPicks = picksData.filter((p) => inWeek(p.prop?.game));
    const nextGamePicks = gamePicksData.filter((p) => inWeek(p.gameLine?.game));
    // parlays: include if any leg is in this week
    const nextParlays = parlaysData.filter((p) =>
      p.legs?.some((l) =>
        inWeek(l.prop?.game) || inWeek(l.gameLine?.game)
      )
    );

    setPicks(nextPicks);
    setGamePicks(nextGamePicks);
    setParlays(nextParlays);

    setCached<Cached>(cacheKey(lid), {
      week: currentWeek, picks: nextPicks, gamePicks: nextGamePicks, parlays: nextParlays,
    });
  }

  useEffect(() => {
    async function init() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const lid = leagueId;

      const warm = cached ? undefined : readCached<Cached>(cacheKey(lid));
      if (warm) {
        setWeek(warm.week);
        setPicks(warm.picks);
        setGamePicks(warm.gamePicks);
        setParlays(warm.parlays);
        setLoading(false);
      }

      try {
        const weeks = await api(`/weeks?current=true&leagueId=${lid}&markets=none`, undefined, { gate: !warm });
        const currentWeek = weeks?.[0] ?? null;
        setWeek(currentWeek);
        await load(lid, currentWeek, !warm);
      } catch {}

      setLoading(false);
    }
    init();
  }, [leagueId]);

  async function cashOut(type: BetKind, id: string) {
    setCashingOut(id);
    try {
      const endpoint = type === "pick" ? `/picks/${id}/cashout`
        : type === "gamepick" ? `/gamepicks/${id}/cashout`
        : `/parlays/${id}/cashout`;
      const res = await api(endpoint, { method: "POST" });
      alert(`Cashed out — ${fmtMoney(res.refunded)} refunded`);
      if (week) await load(leagueId, week);
    } catch (err) {
      alert(apiError(err));
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

  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 8, alignItems: "start" } as const;

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>My Bets</div>
        {week && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
            {week.resolved ? "Final" : week.locked ? "Locked" : "Current week"} · {totalBets} bet{totalBets !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div style={{ width: "100%" }}>

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
            <div style={grid}>
              {allBets.map((bet) => (
                <PlacedBetCard
                  key={bet.data.id}
                  bet={bet}
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
