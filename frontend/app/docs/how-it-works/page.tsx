import type { Metadata } from "next";

// The rules reference, as distinct from How to Play's walkthrough. Every claim
// here describes behaviour already decided in code. This document is
// transcription, not policy invention, and the sources are named so the two
// cannot drift silently:
//
//   grading            backend/src/services/grading.ts
//   voids              backend/src/services/settleGame.ts   (DNP_REASON)
//   parlays            grading.ts settleParlay()
//   allowances         backend/src/services/distributeAllowances.ts
//   locking            game.gameDate <= now, enforced server side
//   joining            backend/src/services/matchmaking.ts, leagueLevel.ts
//   odds               backend/src/services/sportsGameOdds.ts, oddsPoller.ts
//   season lifecycle   backend/src/services/autoPlayoffs.ts, scheduler.ts
//   limits             League.maxStakePerBet / maxBetsPerWeek / maxParlayLegs
//
// IF YOU CHANGE ONE OF THOSE, CHANGE THIS. A settlement rule the player was
// told and the app does not follow is worse than one nobody wrote down.
//
// NO EM DASHES in the copy, by house rule.

export const metadata: Metadata = {
  title: "Wagerwolf How It Works",
  description: "How Wagerwolf grades bets, refunds stakes, prices odds, and matches leagues.",
};

export default function HowItWorksPage() {
  return (
    <div className="legal">
      <h1>How It Works</h1>
      <p className="legal-updated">
        The rules underneath the game. If a bet settled in a way you did not
        expect, the answer is here.
      </p>

      <h2>Your stake is taken when you place the bet</h2>
      <p>
        Placing a bet deducts the stake from your balance straight away, which
        is why the number drops when you confirm rather than when the game ends.
        A pending bet&apos;s money has already left. What comes back depends on
        how the bet finishes.
      </p>

      <h2>The four ways a bet can finish</h2>
      <ul>
        <li>
          <strong>Win.</strong> Your stake returns along with the profit at the
          odds you took.
        </li>
        <li>
          <strong>Loss.</strong> Nothing returns. The stake has already gone.
        </li>
        <li>
          <strong>Push.</strong> The result lands exactly on the line and your
          stake is returned. Not a win and not a loss.
        </li>
        <li>
          <strong>Void.</strong> The bet is cancelled and your stake returned.
        </li>
      </ul>

      <h2>A result landing on the number is a push, not a loss</h2>
      <p>
        If you take a player over 49.5 receiving yards and he finishes with 60,
        you win. If the line is a whole number, say over 50, and he finishes
        with exactly 50, the bet pushes and your stake comes back. The same
        applies to whole-number spreads and totals, and to a moneyline in a game
        that ends level.
      </p>
      <p>
        Most lines carry a half point so that this cannot happen. When one does
        not, landing on the number returns your stake.
      </p>

      <h2>When a stake is refunded, and when it is not</h2>
      <p>
        A bet is voided and refunded when the player never took the field. If
        the game finished and his market was never graded, we treat that as a
        player who did not play, and the bet card says so rather than leaving
        you with an unexplained refund.
      </p>
      <p>
        A player who takes one snap and leaves injured is not a refund. He is
        graded on what he actually did, the same as at any sportsbook. This is
        the rule most likely to feel harsh, and it is deliberate: once someone
        has played, the bet has had its chance.
      </p>

      <h2>Parlays settle more generously than a sportsbook</h2>
      <p>
        A conventional book drops a voided leg and lets the rest of your ticket
        ride at shortened odds. Wagerwolf does not. A voided leg refunds the
        whole ticket, because your stake was struck against combined odds that
        included the dead leg, so the surviving legs were never priced to stand
        on their own.
      </p>
      <p>
        The one limit is that a leg which has already lost is not rescued by a
        later void. The parlay was dead on its own merits before the scratch,
        and without this rule a doubtful player would be free insurance on every
        other leg. Legs still in progress do not block a refund, since undecided
        counts as alive.
      </p>
      <p>
        A pushed leg behaves the conventional way. It is removed and the parlay
        is re-priced on the legs that remain. If every leg pushes, the whole
        ticket is refunded.
      </p>

      <h2>Bets lock at kickoff</h2>
      <p>
        Every market on a game locks the moment that game starts, and this is
        enforced on our side rather than in your browser. Games in the same week
        kick off at different times, so a Sunday game stays open long after
        Thursday night has locked. Locking also ends cashouts on that game.
      </p>

      <h2>Your balance resets every week</h2>
      <p>
        At the start of each NFL week your balance is set back to your
        league&apos;s weekly allowance. Unused money does not carry over, and
        neither do winnings. The reset is to the allowance itself, not to the
        allowance plus whatever you made.
      </p>
      <p>
        Your balance on its own therefore says little about how you are doing.
        It measures one week, while your record accumulates across the season.
      </p>

      <h2>Your commissioner sets the limits</h2>
      <p>
        Three limits are set per league rather than by us: the largest stake
        allowed on a single bet, how many bets you may place in a week, and how
        many legs a parlay may carry. A league that sets neither of the first
        two has no cap beyond your balance. Parlays hold up to ten legs unless
        your commissioner changes it.
      </p>

      <h2>The odds are real, and sometimes there are none</h2>
      <p>
        Lines and prices come from a live sportsbook odds feed rather than from
        anything we invent. They refresh more often as kickoff approaches: a
        game two weeks out moves about once a day, and one inside six hours is
        checked hourly.
      </p>
      <p>
        An empty board is therefore a valid state. A week whose schedule has not
        been published yet has no games, and a game no sportsbook has priced yet
        has no odds. A blank page is usually early rather than broken, because
        we never invent a line to fill the space.
      </p>

      <h2>You are matched into a league rather than shown a list</h2>
      <p>
        Joining asks three things: which NFL week you want to start, how many
        teams you want, and whether you want a beginner or a pro league. You are
        then placed in the open league closest to filling up, which is what
        makes leagues actually start rather than leaving dozens half empty.
      </p>
      <p>
        Your start week and your level are never compromised. League size is the
        only one of the three that can be relaxed, and only after an exact match
        fails. If nothing open matches your week and level, a new league is
        created with you as its commissioner rather than seating you somewhere
        you did not ask for.
      </p>
      <p>
        Beginner and pro are a choice rather than a test. Nothing checks how
        long you have played before letting you into a pro league.
      </p>

      <h2>How a week resolves</h2>
      <p>
        Once every game in a week is final, bets settle, head to head matchups
        are decided, and the next week&apos;s allowances go out. After the last
        regular season week the playoff bracket is seeded automatically from the
        standings, and it advances itself each week until one player is champion.
        Nobody has to press anything.
      </p>

      <h2>If something settled wrongly</h2>
      <p>
        Results come from published NFL statistics, and those can be late,
        revised, or simply wrong. If a bet of yours settled against the actual
        result, tell us using Contact Support at the top of this page and we
        will check the source.
      </p>
    </div>
  );
}
