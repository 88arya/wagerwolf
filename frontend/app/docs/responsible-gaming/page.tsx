import type { Metadata } from "next";

// NOT LEGALLY REVIEWED, and the helplines below are US and UK only. Shipping
// anywhere else needs a local number; the closing note is a signpost and not
// coverage.
//
// HOUSE RULES FOR THIS COPY:
//   no em dashes
//   no "not X but Y" or "X rather than Y" antithesis as a rhetorical move
//   plain declaratives, one idea per sentence
//
// SEQUENCING follows the responsible social gameplay policies free-to-play
// operators publish: the no-real-money statement first, then why the page
// exists at all, then the tools the reader has, then self-assessment, then help,
// then the age line. Help comes after self-assessment on purpose, because
// somebody who has just recognised themselves in a list is the reader most
// likely to act on a number.
//
// WHAT THIS PAGE MAY NOT CLAIM. Wagerwolf has no deposit limits, no session
// timers, no self-exclusion period and no activity reminders, because it has no
// money and no purchases. Real operators list those tools here. Do not copy
// that section in; the honest equivalents are the three habits under "Staying
// in control", plus deactivation, which is real (POST /users/me/deactivate).
//
// HELPLINES VERIFIED against the operators on 18 Sept 2026:
//   US  National Problem Gambling Helpline (NCPG), 24/7. Voice 1-800-522-4700,
//       TEXT IS A DIFFERENT SHORTCODE, 800GAM, and this copy said "call or
//       text 1-800-522-4700" before the check. Chat ncpgambling.org/chat.
//   UK  National Gambling Helpline (GamCare), 24/7, 0808 8020 133. GamCare's
//       onward treatment referrals cover England, Scotland and Wales.
// Re-verify before launch. A helpline number that has moved is the one error on
// this page that could matter to somebody.
//
// FACTS VERIFIED against the backend on 18 Sept 2026: the weekly reset is
// services/distributeAllowances.ts, which overwrites balance with the league's
// weeklyAllowance, so a wiped-out week genuinely costs the next week nothing.
// MIN_AGE = 18 (services/age.ts).

export const metadata: Metadata = {
  title: "Wagerwolf Responsible Gaming",
  description: "Wagerwolf uses fake money and pays out nothing. If gambling is a problem for you, here is where to get help.",
};

export default function ResponsibleGamingPage() {
  return (
    <div className="legal">
      <h1>Responsible Gaming</h1>
      <p className="legal-updated">
        Nothing on Wagerwolf is real money. This page explains what that means,
        and where to get help if gambling has become a problem for you.
      </p>

      <h2>There is no real money on Wagerwolf</h2>
      <p>
        Wagerwolf is free to play. Every balance, stake, payout and weekly
        allowance is fake currency with no cash value. You cannot deposit, you
        cannot withdraw, and you cannot buy fake currency at any price. There is
        nothing to win except a league title, and nothing to lose except a
        league title.
      </p>

      <h2>Why this page exists</h2>
      <p>
        The game is built to read like a sportsbook. It shows real odds from a
        real feed, it has a bet slip, and it settles parlays the way a book
        would. That resemblance is the format, and it is also the reason a page
        like this belongs here. A realistic betting interface can be difficult
        for someone in recovery, or for someone who has had trouble with
        gambling in the past, whether or not any money is involved.
      </p>

      <h2>Staying in control</h2>
      <p>
        Wagerwolf has no deposit limits or spending controls, because there is
        nothing to deposit or spend. What it has instead is a structure that
        limits itself, and three habits worth keeping.
      </p>
      <ul>
        <li>
          <strong>Let the weekly reset do its work.</strong> Your balance is set
          back to your league&apos;s allowance at the start of every NFL week.
          Losing all of it costs you nothing and changes nothing about the week
          that follows.
        </li>
        <li>
          <strong>Play for the league.</strong> The season is a schedule against
          people you know, with a matchup each week and a bracket at the end.
          That is the part worth showing up for.
        </li>
        <li>
          <strong>Take a week off when you want one.</strong> Missing a week
          costs you that week&apos;s matchup and nothing else. No streak breaks
          and no balance is forfeited.
        </li>
      </ul>

      <h2>Signs worth taking seriously</h2>
      <p>
        Ask yourself whether any of these describe you, here or anywhere else
        you bet.
      </p>
      <ul>
        <li>You check scores compulsively once you have a bet running.</li>
        <li>
          A losing week feels the way a real financial loss feels, even though
          the money is fake.
        </li>
        <li>You place bets to chase a bad week instead of to enjoy a good one.</li>
        <li>
          Playing here has renewed an interest in betting real money elsewhere.
        </li>
        <li>
          You have hidden how much time you spend on this from people close to
          you.
        </li>
      </ul>
      <p>
        If several of these fit, the useful response is to stop using Wagerwolf
        and speak to one of the services below. If the format itself is the
        problem, walking away costs you nothing here. No debt and no obligation
        follows you out, and we will close your account on request through
        Contact Support at the top of this page.
      </p>

      <h2>Where to get help</h2>
      <p>
        Help with gambling is free and confidential, and it does not require you
        to have lost money.
      </p>
      <ul>
        <li>
          <strong>United States. National Problem Gambling Helpline,</strong>{" "}
          24 hours a day. Call <strong>1-800-522-4700</strong>, text{" "}
          <strong>800GAM</strong>, or chat at{" "}
          <a href="https://www.ncpgambling.org/chat" target="_blank" rel="noopener noreferrer">
            ncpgambling.org/chat
          </a>
          .
        </li>
        <li>
          <strong>United Kingdom. National Gambling Helpline,</strong> 24 hours
          a day. Call <strong>0808 8020 133</strong>, or visit{" "}
          <a href="https://www.gamcare.org.uk" target="_blank" rel="noopener noreferrer">
            gamcare.org.uk
          </a>
          .
        </li>
        <li>
          <strong>
            <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer">
              Gamblers Anonymous
            </a>
          </strong>{" "}
          runs meetings in person and online in many countries.
        </li>
      </ul>
      <p>
        Elsewhere, your national health service or a local gambling support
        charity will have an equivalent line. None of these organisations is
        affiliated with Wagerwolf, and nothing you tell them reaches us.
      </p>

      <h2>Age requirement</h2>
      <p>
        You must be 18 or older to use Wagerwolf. If you believe someone under
        18 has created an account, tell us through Contact Support and we will
        remove it.
      </p>
    </div>
  );
}
