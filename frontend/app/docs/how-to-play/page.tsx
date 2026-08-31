import type { Metadata } from "next";

// The walkthrough. How It Works is the reference beside it; this one is read
// once, before your first bet.
//
// NO LONGER A CLIENT COMPONENT. It was "use client" for a Back button that used
// router.back(); the button is gone (DocsShell's topbar carries Done), nothing
// here uses a hook or a handler, and being a server component is what lets it
// export metadata. Until this change it was the one document with no title of
// its own, falling back to the root layout's marketing title.
//
// NO EM DASHES in the copy, by house rule.
//
// FACTS CHECKED against the backend on 30 Aug 2026:
//   invite code   6 characters, letters AND digits (matchmaking.ts uses
//                 Math.random().toString(36).substring(2, 8).toUpperCase()).
//                 It was described here as a "6-letter code", which was wrong.
//   allowance     leagues created by matchmaking use 30000 cents, so $300.
//   parlay maths  two legs at -110 is 1.909^2 = 3.645 decimal, about +264.
//   resolve day   the scheduler resolves the past week on Tuesdays.

export const metadata: Metadata = {
  title: "Wagerwolf How to Play",
  description: "How to play Wagerwolf, from joining a league to winning a weekly matchup.",
};

/** One numbered step. The number is a marker, not a heading. */
function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontSize: "0.65rem",
            // 600, the design system's ceiling for a label. This was 800, which
            // is outside the 400 to 700 band and above anything else on the page.
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
        Wagerwolf is a fantasy football betting game played with fake money. You
        bet on real NFL player statistics each week and play head to head
        against one other member of your league.
      </p>

      <div style={{ marginTop: 34 }}>
        <Step n="1" title="Get into a league">
          <p>
            Everything happens inside a league. Tell us which NFL week you want
            to start, how many teams you want, and whether you want a beginner or
            a pro league, and you are placed in the open league closest to
            filling up. If nothing matches, one is created with you as its
            commissioner. You can also start a private league and invite people
            with its six character code.
          </p>
        </Step>

        <Step n="2" title="Get your weekly allowance">
          <p>
            At the start of each NFL week your balance is set to your
            league&apos;s weekly allowance, which is $300 unless your
            commissioner chose otherwise. That is your budget for the week.
            Unused money does not carry over, and neither do winnings.
          </p>
        </Step>

        <Step n="3" title="Bet on player props">
          <p>
            Open the Bet page and pick a game. You will find props for
            quarterbacks, running backs, receivers, defense, and kickers. Each
            prop is a stat line, for example a quarterback&apos;s passing yards
            set at 267.5. You bet over or under that number, choose your stake
            and confirm.
          </p>
        </Step>

        <Step n="4" title="Or bet the game itself">
          <p>
            The Game Lines tab covers the whole game rather than one player:
            moneyline, spread, and total points. Alternate lines are there too,
            if you want a different number at different odds.
          </p>
        </Step>

        <Step n="5" title="Build a parlay">
          <p>
            Add several picks to your slip and their odds multiply together. Two
            legs at -110 each pay around +264. The more legs you add the larger
            the payout and the smaller your chance of collecting it, because
            every leg has to win. Your league caps how many legs a parlay may
            hold, and ten is the default.
          </p>
        </Step>

        <Step n="6" title="Bets lock at kickoff">
          <p>
            Every market on a game locks the moment that game starts. No new
            picks and no cashouts on it after that. Games in the same week kick
            off at different times, so a Sunday game is still open long after
            Thursday night has locked.
          </p>
        </Step>

        <Step n="7" title="Results settle on Tuesday">
          <p>
            Once the week&apos;s games are final, official statistics come in
            and every bet is graded automatically. Winning bets pay at the odds
            you took. History shows every bet you have placed, and what happened
            to it.
          </p>
        </Step>

        <Step n="8" title="Win your matchup">
          <p>
            Each week you are drawn against one other member of your league, and
            whoever makes more money that week wins the matchup. Your record is
            on the Leaderboard. At the end of the regular season the top players
            advance to a playoff bracket, and one of them finishes as champion.
          </p>
        </Step>
      </div>

      <p style={{ marginTop: 8, fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-2)" }}>
        {/* THE ONLY ROUTE TO How It Works. The rail's Play row opens this page
            rather than a section index, so without this link the second play
            document is reachable only by typing the URL. It sits here, once, at
            the end of the walkthrough: an earlier edit spliced it inside the
            step component by mistake and it rendered under all eight. */}
        For the rules underneath the game, covering how bets are graded, when a
        stake comes back, and where the odds come from, read{" "}
        <a href="/docs/how-it-works">How It Works</a>.
      </p>
    </div>
  );
}
