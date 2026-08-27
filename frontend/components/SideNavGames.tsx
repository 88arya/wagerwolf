"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import TeamLogo from "@/components/TeamLogo";

/**
 * The week's upcoming games, as the contents of the sidebar's "Games" section.
 *
 * ONE ROW PER GAME, and nothing above them. An earlier version grouped the
 * games under kickoff headings — "Sun 1:00 PM" and eight fixtures beneath it —
 * which is how a scoreboard reads but is not what this is. A nav lists things
 * you can go to. The time is on the game's own page, and printing it here cost
 * a line per slot in the one column with none to spare.
 *
 * WHAT IT IS NOT: the games strip. That was a horizontal auto-scrolling ticker
 * of odds cards, and it was removed from the signed-in app. This is a list of
 * fixtures in a 220px column — no odds, no prices, no motion. If you want to
 * bet into one, the row takes you to it.
 *
 * UPCOMING ONLY, which is the same rule the server enforces: a bet is locked
 * server-side once `game.gameDate <= now`, so a kicked-off game is one you can
 * look at but not act on. Games drop out of the list as they start.
 *
 * The consequence, stated so it is not mistaken for a bug: **late in a week
 * this section is short, and after the last kickoff it is empty.** That is the
 * true answer to "what can I bet on".
 *
 * WHERE THE DATA COMES FROM. `GET /weeks/public/current` — the one
 * unauthenticated read in the app, built for the landing page's strip. It is
 * league-agnostic, and so is the sidebar: the league-scoped week endpoints
 * would make this list change depending on which league you happened to be
 * looking at, which is not what "the games this week" means.
 *
 * IT ANSWERS WITH AN ARRAY, not a week. `weeks[0]` is the week — the same shape
 * GamesStrip unpacks. Reading `.games` straight off the response yields
 * undefined and an empty list that looks exactly like a week with no fixtures,
 * which is precisely how this shipped broken the first time.
 *
 * ROWS ARE LINKS ONLY INSIDE A LEAGUE, the rule the strip followed. There is
 * nowhere to send a click otherwise: betting happens in a league, and
 * /leagues/<id>/bet?gameId=<id> needs an <id> the route has to supply.
 */

// How often the list re-checks which games have started. No network in it — the
// fixtures do not change during a week, so this only moves the "upcoming" line
// forward through an already-fetched list.
const TICK_MS = 60_000;

// The same box a label's icon gets, because the away logo has to land in that
// same column — see the note on .sidenav-game in globals.css. Changing one
// without the other breaks the nav's single left edge.
const LOGO = 15;

const LEAGUE_ROUTE = /^\/leagues\/([^/]+)/;

type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  status: "SCHEDULED" | "LIVE" | "FINAL" | "CANCELLED";
};

/** A logo and its abbreviation, kept together so the pair cannot be split by the gap. */
function Side({ team }: { team: string }) {
  return (
    <span className="sidenav-game-side">
      {/* `plain` drops TeamLogo's 2px padding, so the image fills the same 15px
          box a lucide icon occupies rather than sitting inset within it. */}
      <TeamLogo team={team} size={LOGO} plain />
      <span>{team}</span>
    </span>
  );
}

export default function SideNavGames() {
  const pathname = usePathname() ?? "";
  const leagueId = LEAGUE_ROUTE.exec(pathname)?.[1] ?? "";
  const [games, setGames] = useState<Game[] | null>(null);
  // 0 until the client sets it. Never read in a useState initialiser: Date.now()
  // there runs during SSR too and would differ from the client's value.
  const [now, setNow] = useState(0);

  useEffect(() => {
    let live = true;

    // ARRAY, not an object — see the header. `weeks[0]` is the week.
    api("/weeks/public/current")
      .then((weeks: any) => { if (live) setGames(weeks?.[0]?.games ?? []); })
      .catch(() => { if (live) setGames([]); });

    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => { live = false; window.clearInterval(id); };
  }, []);

  // Nothing at all until the fetch lands. A skeleton here would be grey bars in
  // a nav already full of real rows.
  if (games === null) return null;

  const upcoming = games.filter(
    // CANCELLED is out whatever its date says, and the kickoff comparison is
    // the server's own lock rule rather than a status check: a game can sit at
    // SCHEDULED for a few minutes past its start while the score sync catches
    // up, and it is unbettable from the moment the clock passes it.
    g => g.status !== "CANCELLED" && new Date(g.gameDate).getTime() > now,
  );

  if (upcoming.length === 0) {
    return <div className="sidenav-note">No games left to bet this week.</div>;
  }

  // Still in kickoff order — the API sorts by date, and dropping the headings
  // did not make the ordering arbitrary. The soonest game is simply at the top
  // without a heading saying so.
  return (
    <>
      {upcoming.map((g) => {
        const body = (
          <>
            {/* Away first, the way a fixture is written — and it is the away
                side that has to sit in the icon column. */}
            <Side team={g.awayTeam} />
            <span className="sidenav-game-at">@</span>
            <Side team={g.homeTeam} />
          </>
        );

        // Inside a league the row is a shortcut to that game's board; outside
        // one there is no league to bet in, so it is a plain row.
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
    </>
  );
}
