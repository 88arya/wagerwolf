import type { Metadata } from "next";

// The walkthrough, read once before your first bet. How It Works is the
// reference beside it and answers "why did my bet settle like that".
//
// HOUSE RULES FOR THIS COPY:
//   no em dashes
//   no "not X but Y" or "X rather than Y" antithesis as a rhetorical move
//   plain declaratives, one idea per sentence
//
// SEQUENCING is the player's own order of operations, and every step is
// something they do or receive: join, get the allowance, pick a game, bet a
// prop, bet the game, build a parlay, watch it lock, collect, win the matchup,
// reach the playoffs. Nothing here explains a rule the player cannot act on;
// those live in How It Works.
//
// A SERVER COMPONENT. It was "use client" for a Back button that DocsShell's
// topbar now carries, and being a server component is what lets it export
// metadata.
//
// FACTS VERIFIED against the backend on 18 Sept 2026:
//   allowance     30000 cents, so $300, on leagues matchmaking creates
//                 (services/matchmaking.ts createLeagueFor)
//   league size   default 10, must be even, accepted range 2 to 20. Enforced in
//                 BOTH creation paths (leagues.routes.ts rejects an odd
//                 maxPlayers; matchmaking.ts coerces to 10).
//
//                 SIZE IS CAPACITY AND IS ALWAYS EVEN. The ghost opponent in
//                 step 9 triggers on an odd count of ACTUAL MEMBERS
//                 (scheduleMatchups.ts, userIds.length % 2), which is what a
//                 league that starts before it fills produces. The two are not
//                 in conflict, and step 1 says "size" while step 9 says
//                 "members" so a reader does not think they are.
//   invite code   6 characters, letters AND digits
//                 (Math.random().toString(36).substring(2, 8).toUpperCase())
//   parlay maths  two legs at -110 is 1.909^2 = 3.645 decimal, so about +264
//   parlay legs   League.maxParlayLegs defaults to 10
//   prop tabs     Game Lines, Passing, Rushing, Receiving, Defensive, Kicking,
//                 Other. Each tab appears only when that week has props for it
//                 (app/leagues/[leagueId]/bet/page.tsx)
//   locking       game.gameDate <= now, enforced server side
//   resolve       hourly cron; a week's endDate is its last kickoff plus 18
//                 hours, which lands Tuesday evening UTC for a Monday night
//                 finish (services/scheduler.ts, services/espnApi.ts)
//   matchup       decided on ENDING BALANCE, and a tie is possible
//                 (services/resolveWeek.ts sets isTie when they are equal)
//   cashout       NOT a priced cashout. POST /picks/:id/cashout refunds the
//                 FULL STAKE and voids the bet, and refuses once
//                 game.gameDate has passed. An earlier draft of step 7 said
//                 "at its current price", which described a feature that does
//                 not exist.
//
// THE TIE WAS MISSING from every previous version of this document, and so was
// the ghost opponent an odd numbered league produces. Both are in step 9 now.

export const metadata: Metadata = {
  title: "Wagerwolf How to Play",
  description: "How to play Wagerwolf, from joining a league to winning a weekly matchup.",
};

/** One numbered step. The number is a marker and not a heading. */
function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontSize: "0.65rem",
            // 600, the design system's ceiling for a label.
            fontWeight: 600,
            color: "var(--accent)",
            background: "var(--accent-dim)",
            padding: "2px 7px",
            letterSpacing: "0.05em",
          }}
        >
          {n}
        </span>
        <span style={{ fontWeight: 600, fontSize: "1rem" }}>{title}</span>
      </div>
      <div style={{ color: "var(--text-2)", fontSize: "0.95rem", lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

export default function HowToPlayPage() {
  return (
    <div className="legal">
      <h1>How to Play</h1>
      <p className="legal-updated">
        Wagerwolf is a fantasy football game played with fake money. Each NFL
        week you bet a fixed allowance on real player statistics and real game
        lines, and you play head to head against one other member of your
        league.
      </p>

      <div style={{ marginTop: 34 }}>
        <Step n="1" title="Get into a league">
          <p>
            Everything happens inside a league. Tell us which NFL week you want
            to start, how many teams you want, and whether you want a beginner
            or a pro league. You are then placed in the open league closest to
            filling up, which is the one most likely to actually start. If
            nothing open matches your week and level, we create a league and
            make you its commissioner.
          </p>
          <p>
            A league holds ten teams by default, and its size is always an even
            number between two and twenty. To play with people you know, start
            your own league and send them its six character invite code.
          </p>
        </Step>

        <Step n="2" title="Collect your weekly allowance">
          <p>
            At the start of each NFL week your balance is set to your
            league&apos;s weekly allowance. That is $300 unless your
            commissioner chose a different figure, and it is the entire budget
            for the week. Anything you do not spend expires, and so does
            anything you win.
          </p>
        </Step>

        <Step n="3" title="Open the board and pick a game">
          <p>
            The Bet page lists the week&apos;s games with their kickoff times.
            Choosing one opens its board. Tabs across the top separate the
            markets: Game Lines first, then Passing, Rushing, Receiving,
            Defensive and Kicking props. A tab appears only when that game has
            markets priced for it, so the board differs from game to game.
          </p>
        </Step>

        <Step n="4" title="Bet a player prop">
          <p>
            A prop is a single player&apos;s statistic with a number attached,
            for example a quarterback at 267.5 passing yards. You take the over
            or the under, enter a stake and confirm. Most players offer several
            alternative numbers at different prices, so you can move the line to
            where you want it and accept the odds that come with it.
          </p>
          <p>
            Your stake leaves your balance as soon as the bet is placed. The
            number you see beside a pick is what the bet returns in total if it
            wins.
          </p>
        </Step>

        <Step n="5" title="Or bet the game itself">
          <p>
            The Game Lines tab covers the result instead of one player:
            moneyline for the winner, spread for the margin, and total for the
            combined points. Alternative numbers are available here too.
          </p>
        </Step>

        <Step n="6" title="Build a parlay">
          <p>
            Add several picks to your slip and their prices multiply into one
            larger price. Two legs at -110 pay around +264 together. Every leg
            has to win for the parlay to pay, so each one you add increases both
            the return and the chance of collecting nothing. Your league caps
            the number of legs, and the cap is ten unless your commissioner
            changed it.
          </p>
          <p>
            The slip blocks combinations that cannot all win, such as the over
            and the under on the same prop, or a team&apos;s moneyline against
            its opponent&apos;s spread.
          </p>
        </Step>

        <Step n="7" title="Watch the clock">
          <p>
            Every market on a game closes the moment that game kicks off, and
            cashing out closes with it. Games in one week start at different
            times, so Sunday afternoon is still open long after Thursday night
            has closed. Up until kickoff you can cash out a pending bet, which
            cancels it and returns the whole stake.
          </p>
        </Step>

        <Step n="8" title="Collect on Tuesday">
          <p>
            Bets settle once their game is final and the official statistics
            have been published, and the week as a whole closes out on Tuesday
            evening after Monday night finishes. Winning bets pay at the price
            you took. My Bets shows what is still running and History shows
            everything that has settled, with the outcome of each.
          </p>
        </Step>

        <Step n="9" title="Win your matchup">
          <p>
            Each week you are drawn against one member of your league, and the
            higher balance at the end of the week takes the matchup. Equal
            balances are recorded as a tie. If your league has an odd number of
            members, one person each week plays a stand-in opponent whose score
            is the league average.
          </p>
        </Step>

        <Step n="10" title="Reach the playoffs">
          <p>
            Your weekly results build a record, which you can see on the
            Leaderboard. When the regular season ends, the top of the standings
            goes into a playoff bracket that advances every week until one
            member is champion. None of this needs anybody to press anything.
          </p>
        </Step>
      </div>

      <p style={{ marginTop: 8, fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-2)" }}>
        {/* THE ONLY ROUTE TO How It Works from inside this document. The rail's
            Play section lists both, so this is a convenience and no longer the
            sole path. It sits once, at the end. */}
        For the rules underneath the game, covering how bets are graded, when a
        stake comes back and where the odds come from, read{" "}
        <a href="/docs/how-it-works">How It Works</a>.
      </p>
    </div>
  );
}
