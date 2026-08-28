"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { fmtOdds } from "@/components/BetRows";
import TeamLogo from "@/components/TeamLogo";

/**
 * The week's upcoming games, as the contents of the sidebar's "Games" section.
 *
 * TWO COLUMNS OF FIXTURES, each fixture two lines: away on top, home beneath,
 * the way a book prints a game. Games fill left to right and then top to
 * bottom in kickoff order, so a 2x2 block of lines is two games.
 *
 * It was one full-width row per game, reading `NE +164 -AT- SEA -196`. Turning
 * the fixture on its side buys back half the vertical space — sixteen games is
 * eight grid rows instead of sixteen — in the one column of the app with none
 * to spare, and it drops the separator entirely: stacking the two sides says
 * "these play each other" without a word between them, and which side is home
 * is carried by position, as it is on every scoreboard.
 *
 * NO KICKOFF HEADINGS. An earlier version grouped the games under "Sun 1:00 PM"
 * and similar, which is how a scoreboard reads but is not what this is. A nav
 * lists things you can go to. The time is on the game's own page, and printing
 * it here cost a line per slot. Order still carries it: soonest first.
 *
 * WHAT IT IS NOT: the games strip. That was a horizontal auto-scrolling ticker
 * of odds *cards*, and it was removed from the signed-in app. This is a grid of
 * fixtures in a 240px column — no cards, no motion. If you want to bet into one,
 * the cell takes you to it.
 *
 * IT DOES CARRY A PRICE, one per side: the moneyline, beside the abbreviation it
 * belongs to. `GET /weeks/public/current` already returns exactly the two
 * moneylines per game and nothing else — that is the endpoint's whole shape, and
 * it is why this costs no extra request and cannot grow into a board by
 * accident. A side the feed has not priced simply shows no number rather than a
 * dash, so the column stays quiet on games the books have not opened.
 *
 * The price is the accent, which is the design system's rule for odds
 * everywhere: it is the one number in the cell you read rather than scan. It
 * sits at the cell's right edge rather than tight against the abbreviation, so
 * the two prices in a fixture line up under each other and can be compared at a
 * glance. Which price belongs to which side is unambiguous either way — they
 * are on the same line as their team.
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

// The same box a label's icon gets, because the LEFT column's logos have to land
// in that same column — see the note on .sidenav-game in globals.css. Changing
// one without the other breaks the nav's single left edge. (The right column
// starts halfway across and lines up with nothing above it, which is what a
// second column costs and is fine: it aligns with itself down the grid.)
const LOGO = 13;


const LEAGUE_ROUTE = /^\/leagues\/([^/]+)/;

type GameLine = { market: string; odds: number };

type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  status: "SCHEDULED" | "LIVE" | "FINAL" | "CANCELLED";
  /** Only ever the two moneylines — see the header. Absent on an unpriced game. */
  gameLines?: GameLine[];
};

/**
 * ONE SIDE OF A FIXTURE, and one line of the cell: logo, abbreviation, price.
 * Two of these stacked are a game — away first, home under it.
 */
function Side({ team, odds }: { team: string; odds: number | null }) {
  return (
    <span className="sidenav-game-side">
      {/* `plain` drops TeamLogo's 2px padding, so the image fills the same box a
          lucide icon occupies rather than sitting inset within it. */}
      <TeamLogo team={team} size={LOGO} plain />
      <span className="sidenav-game-team">{team}</span>
      {/* Rendered even when there is no price, as an empty span: it is what
          holds the second line's team name in the same place as the first's
          when only one side has been posted. */}
      <span className="sidenav-game-odds">{odds != null ? fmtOdds(odds) : ""}</span>
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
  // did not make the ordering arbitrary. The grid's default `row` auto-flow is
  // what turns that order into left-to-right, top-to-bottom: the soonest game
  // is top-left, the next one beside it, with no heading saying so.
  return (
    <div className="sidenav-games">
      {upcoming.map((g) => {
        // `?? null` rather than leaving it undefined: Side's prop is the
        // explicit "no price" case, and an unpriced game arrives as a missing
        // market, a missing gameLines array, or both.
        const ml = (market: string) =>
          g.gameLines?.find((l) => l.market === market)?.odds ?? null;

        const body = (
          <>
            {/* Away on top, home beneath — the order a fixture is written, and
                the whole of what replaced the separator. */}
            <Side team={g.awayTeam} odds={ml("MONEYLINE_AWAY")} />
            <Side team={g.homeTeam} odds={ml("MONEYLINE_HOME")} />
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
    </div>
  );
}
