"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { getCached, readCached, setCached } from "@/lib/pageCache";
import { fmtOdds } from "@/lib/odds";
import TeamLogo from "@/components/TeamLogo";

// Re-checks which games have kicked off; no network.
const TICK_MS = 60_000;

// Odds move at most hourly near kickoff, so polling faster gains nothing.
const REFETCH_MS = 60 * 60_000;

const LOGO = 13;

const LEAGUE_ROUTE = /^\/leagues\/([^/]+)/;

type GameLine = { market: string; odds: number };

// The public week endpoint sends games with just the two moneylines.
type NavGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  status: "SCHEDULED" | "LIVE" | "FINAL" | "CANCELLED";
  // Absent on an unpriced game.
  gameLines?: GameLine[];
};

function Side({ team, odds }: { team: string; odds: number | null }) {
  return (
    <span className="sidenav-game-side">
      <TeamLogo team={team} size={LOGO} plain />
      <span className="sidenav-game-team">{team}</span>
      <span className="sidenav-game-odds">{odds != null ? fmtOdds(odds) : ""}</span>
    </span>
  );
}

const NAV_GAMES_KEY = "nav:games";

export default function SideNavGames() {
  const pathname = usePathname() ?? "";
  const leagueId = LEAGUE_ROUTE.exec(pathname)?.[1] ?? "";
  const [games, setGames] = useState<NavGame[] | null>(() => getCached<NavGame[]>(NAV_GAMES_KEY) ?? null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let live = true;

    // A failed refresh keeps the old list; a failed first load shows none.
    const warm = readCached<NavGame[]>(NAV_GAMES_KEY);
    if (warm) setGames(warm);

    const load = (first: boolean) => {
      // ARRAY, not an object - see the header. `weeks[0]` is the week.
      api("/weeks/public/current", undefined, { gate: !(first && warm) })
        .then((weeks: { games?: NavGame[] }[]) => {
          if (!live) return;
          const next: NavGame[] = weeks?.[0]?.games ?? [];
          setCached(NAV_GAMES_KEY, next);
          setGames(next);
        })
        .catch(() => { if (live && first) setGames([]); });
    };

    load(true);

    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    const refetch = window.setInterval(() => load(false), REFETCH_MS);
    return () => {
      live = false;
      window.clearInterval(tick);
      window.clearInterval(refetch);
    };
  }, []);

  if (games === null) return null;

  const upcoming = games.filter(
    g => g.status !== "CANCELLED" && new Date(g.gameDate).getTime() > now,
  );

  if (upcoming.length === 0) {
    return <div className="sidenav-note">No games left to bet this week.</div>;
  }

  return (
    <div className="sidenav-games">
      {upcoming.map((g) => {
        const ml = (market: string) =>
          g.gameLines?.find((l) => l.market === market)?.odds ?? null;

        const body = (
          <>
            <Side team={g.awayTeam} odds={ml("MONEYLINE_AWAY")} />
            <Side team={g.homeTeam} odds={ml("MONEYLINE_HOME")} />
          </>
        );

        return leagueId ? (
          <Link
            key={g.id}
            href={`/leagues/${leagueId}/bet?gameId=${g.id}`}
            className="sidenav-game"
            title={`${g.awayTeam} at ${g.homeTeam}`}
          >
            {body}
          </Link>
        ) : (
          <div key={g.id} className="sidenav-game is-static">{body}</div>
        );
      })}
    </div>
  );
}
