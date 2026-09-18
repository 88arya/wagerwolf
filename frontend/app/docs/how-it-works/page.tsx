import type { Metadata } from "next";

// The rules reference, as distinct from How to Play's walkthrough. Every claim
// here describes behaviour already decided in code, so this document is
// transcription and never policy invention. The sources are named so the two
// cannot drift silently:
//
//   grading            backend/src/services/grading.ts
//   voids              backend/src/services/settleGame.ts   (DNP_REASON)
//   cashout            POST /picks/:id/cashout and the gamepicks/parlays twins
//   parlays            grading.ts settleParlay()
//   allowances         backend/src/services/distributeAllowances.ts
//   locking            game.gameDate <= now, enforced server side
//   joining            backend/src/services/matchmaking.ts, leagueLevel.ts
//   odds               backend/src/services/sportsGameOdds.ts, oddsPoller.ts
//   matchups           backend/src/services/resolveWeek.ts
//   season lifecycle   backend/src/services/autoPlayoffs.ts, scheduler.ts
//   limits             League.maxStakePerBet / maxBetsPerWeek / maxParlayLegs
//
// IF YOU CHANGE ONE OF THOSE, CHANGE THIS. A settlement rule the player was
// told and the app does not follow is worse than one nobody wrote down.
//
// HOUSE RULES FOR THIS COPY:
//   no em dashes
//   no "not X but Y" or "X rather than Y" antithesis as a rhetorical move
//   plain declaratives, one idea per sentence
//
// SEQUENCING. The money first, because every other rule is about what happens
// to it: stake taken, the four outcomes, then the two outcomes readers dispute
// (push, void), then parlays, then cashout, then the clock, then the weekly
// reset, then limits, then where odds come from, then matchmaking, then the
// season, then what to do about a mistake. Each section answers one question a
// player would actually ask.
//
// FOUR CORRECTIONS MADE ON 18 Sept 2026, all verified against the code:
//
//  - The odds refresh tiers were stated as "a game two weeks out moves about
//    once a day, and one inside six hours is checked hourly". The hourly tier
//    is INSIDE THREE HOURS (services/oddsPoller.ts TIERS: 3h/60min,
//    24h/180min, 72h/480min, beyond/1440min). Fixed, and the middle tiers are
//    now stated too.
//  - The board being PREGAME ONLY was never documented. Polling stops at
//    kickoff by design, so there are no live in-game odds at all.
//  - Cashout was not documented here. It refunds the full stake and is refused
//    once the game has started. It is not a priced cashout.
//  - Matchups were described as "whoever makes more money". The comparison is
//    ENDING BALANCE, ties are recorded (Matchup.isTie), and an odd numbered
//    league produces a ghost opponent scoring the league mean. All three are
//    in "How a weekly matchup is decided" now.

export const metadata: Metadata = {
  title: "Wagerwolf How It Works",
  description: "How Wagerwolf grades bets, refunds stakes, prices odds, decides matchups and matches leagues.",
};

export default function HowItWorksPage() {
  return (
    <div className="legal">
      <h1>How It Works</h1>
      <p className="legal-updated">
        The rules underneath the game. If a bet settled in a way you did not
        expect, the answer is on this page.
      </p>

      <h2>Your stake is taken when you place the bet</h2>
      <p>
        Placing a bet deducts the stake from your balance immediately, which is
        why the number drops when you confirm and not when the game ends. The
        money behind a pending bet has already left your balance. What comes
        back depends on how the bet finishes.
      </p>

      <h2>The four ways a bet can finish</h2>
      <ul>
        <li>
          <strong>Win.</strong> Your stake returns together with the profit at
          the price you took.
        </li>
        <li>
          <strong>Loss.</strong> Nothing returns, because the stake has already
          gone.
        </li>
        <li>
          <strong>Push.</strong> The result lands exactly on the line and your
          stake is returned. A push counts as neither a win nor a loss.
        </li>
        <li>
          <strong>Void.</strong> The bet is cancelled and your stake is
          returned.
        </li>
      </ul>
      <p>
        Every bet card shows which of the four it finished as, and a voided bet
        carries the reason it was voided.
      </p>

      <h2>A result landing on the number is a push</h2>
      <p>
        Take a player over 49.5 receiving yards and 60 yards wins. Take a whole
        number, say over 50, and 50 yards exactly returns your stake as a push.
        The same applies to whole number spreads and totals, and to a moneyline
        in a game that finishes level.
      </p>
      <p>
        Most lines carry a half point so this cannot arise. Whole numbers do
        appear on spreads and totals, and landing on one returns your stake.
      </p>

      <h2>When a stake is refunded, and when it is not</h2>
      <p>
        A bet is voided and refunded when the player never took the field. Once
        a game has finished and a market on it was never graded, we treat that
        market as belonging to a player who did not play, and the bet card says
        so.
      </p>
      <p>
        A player who takes one snap and leaves injured does not produce a
        refund. He is graded on what he did, the same as at any sportsbook. This
        is the rule most likely to feel harsh, and it is deliberate. Once
        somebody has played, the bet has had its chance.
      </p>

      <h2>Parlays settle more generously than a sportsbook</h2>
      <p>
        A conventional book drops a voided leg and lets the remaining legs ride
        at shortened odds. Wagerwolf refunds the whole ticket instead. Your
        stake was struck against combined odds that included the dead leg, so
        the surviving legs were never priced to stand on their own.
      </p>
      <p>
        One limit applies. A leg that has already lost is not rescued by a later
        void, because the ticket was dead on its own merits before the scratch.
        Without that limit a doubtful player would work as free insurance on
        every other leg. Legs still in progress do not block a refund, since
        undecided counts as alive.
      </p>
      <p>
        A pushed leg behaves the conventional way. It comes out of the ticket
        and the parlay is re-priced on the legs that remain. A ticket whose every
        leg pushes is refunded in full.
      </p>

      <h2>Cashing out returns the stake</h2>
      <p>
        You can cash out any pending bet before its game starts. Cashing out
        cancels the bet and returns the whole stake, so it carries no price and
        no profit or loss. Once the game has kicked off, cashing out is refused
        along with everything else on that game.
      </p>

      <h2>Bets lock at kickoff</h2>
      <p>
        Every market on a game locks the moment that game starts, and the lock
        is enforced on our side instead of in your browser. Games in one week
        kick off at different times, so Sunday stays open long after Thursday
        night has locked.
      </p>

      <h2>Your balance resets every week</h2>
      <p>
        At the start of each NFL week your balance is set back to your
        league&apos;s weekly allowance. Unused money expires and so do winnings.
        The reset is to the allowance itself, not to the allowance plus whatever
        you made.
      </p>
      <p>
        Your balance therefore says little on its own about how your season is
        going. It measures one week. Your record is what accumulates.
      </p>

      <h2>How a weekly matchup is decided</h2>
      <p>
        Each week pairs you with one member of your league, and the higher
        balance at the close of the week wins the matchup. Because everybody
        started the week on the same allowance, that comparison is the same as
        asking who did better with it. Two equal balances are recorded as a tie
        for both members.
      </p>
      <p>
        A league with an odd number of members has one person unpaired each
        week. That person plays a stand-in opponent whose score is the average
        balance across the league, so the week is winnable and losable in the
        normal way.
      </p>

      <h2>Your commissioner sets the limits</h2>
      <p>
        Three limits belong to the league instead of to us: the largest stake
        allowed on one bet, how many bets you may place in a week, and how many
        legs a parlay may carry. The first two are optional, and a league that
        sets neither has no cap beyond your balance. Parlays hold up to ten legs
        unless your commissioner changes the figure.
      </p>

      <h2>Where the odds come from</h2>
      <p>
        Lines and prices come from a live sportsbook odds feed. We do not set
        them and we do not adjust them. Each game is re-priced on a schedule
        that tightens as kickoff approaches: about once a day while it is more
        than three days out, every eight hours inside three days, every three
        hours inside a day, and hourly in the last three hours.
      </p>
      <p>
        Pricing stops at kickoff, which makes the board pregame only. There are
        no live in-game odds, and a game in progress shows the score without
        offering anything new to bet.
      </p>
      <p>
        An empty board is a valid state. A week whose schedule has not been
        published yet has no games, and a game no sportsbook has priced yet has
        no odds. A blank section is usually early. We never invent a line to
        fill the space.
      </p>

      <h2>How you are matched into a league</h2>
      <p>
        Joining asks three things: which NFL week you want to start, how many
        teams you want, and whether you want a beginner or a pro league. You are
        placed in the open league closest to filling up, which is what makes
        leagues start instead of leaving dozens of them half empty.
      </p>
      <p>
        Your start week and your level are never compromised. League size is the
        one preference that can be relaxed, and only once an exact match has
        failed. When nothing open matches your week and level, we create a
        league and make you its commissioner.
      </p>
      <p>
        Beginner and pro are a choice and not a test. Nothing checks how long
        you have played before letting you into a pro league.
      </p>

      <h2>How a week closes out</h2>
      <p>
        Once a week&apos;s games are final, every bet on them is graded, the
        head to head matchups are decided, and the following week&apos;s
        allowances are distributed. A week becomes eligible to close roughly
        eighteen hours after its last kickoff, so a Monday night finish closes
        out on Tuesday evening. After the final regular season week the playoff
        bracket is seeded from the standings and advances itself each week until
        one member is champion. Nobody has to press anything.
      </p>

      <h2>If something settled wrongly</h2>
      <p>
        Results come from published NFL statistics, and those can be late,
        revised or wrong. If one of your bets settled against the actual result,
        tell us through Contact Support at the top of this page and we will
        check the source. Where a source has corrected itself we will settle the
        bet again and adjust the balances involved.
      </p>
    </div>
  );
}
