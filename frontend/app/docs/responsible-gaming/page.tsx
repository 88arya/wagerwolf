import type { Metadata } from "next";

// NOT LEGALLY REVIEWED, and the helpline below is US ONLY. Shipping outside the
// US needs regional numbers; the closing paragraph is a stopgap, not coverage.
//
// NO EM DASHES in the copy, by house rule.
//
// One factual correction on 30 Aug 2026: "You can delete your account at any
// time" promised a self-serve control that does not exist. There is no delete
// button in My Account, and POST /users/me/deactivate is soft, reversible, and
// keeps bets so other members' seasons still add up.

export const metadata: Metadata = {
  title: "Wagerwolf Responsible Gaming",
  description: "Wagerwolf uses fake money. If real gambling is a problem, here is where to get help.",
};

export default function ResponsibleGamingPage() {
  return (
    <div className="legal">
      <h1>Responsible Gaming</h1>
      <p className="legal-updated">
        Nothing on Wagerwolf is real money. This page is about the format, and
        about where to get help if betting is a problem elsewhere.
      </p>

      <h2>There is no real money here</h2>
      <p>
        Wagerwolf is a free to play game. Every balance, stake, and payout on
        this site is fake currency with no cash value. You cannot deposit, you
        cannot withdraw, you cannot buy fake currency, and there is nothing to
        win but a league title. No real money wagering takes place on Wagerwolf.
      </p>
      <p>
        We say that plainly because the game is built to look and read like a
        sportsbook: the odds, the slip, the parlays. That resemblance is the
        point of the format, and it is also the reason this page exists.
      </p>

      <h2>If the format itself is a problem for you</h2>
      <p>
        For some people a realistic betting interface is a trigger whether or
        not money is at stake. If that is you, the right move is to stop using
        Wagerwolf. Nothing is lost by walking away, because none of the balance
        was ever real, and no debt or obligation follows you out. If you would
        like your account closed as well, ask us using Contact Support at the
        top of this page.
      </p>

      <h2>Where to get help</h2>
      <p>
        If gambling with real money has become a problem, free and confidential
        help is available 24 hours a day in the US:
      </p>
      <ul>
        <li>
          <strong>National Problem Gambling Helpline.</strong> Call or text{" "}
          <strong>1-800-522-4700</strong>, or chat at{" "}
          <a href="https://www.ncpgambling.org/chat" target="_blank" rel="noopener noreferrer">
            ncpgambling.org/chat
          </a>
        </li>
        <li>
          <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer">
            Gamblers Anonymous
          </a>
          . Meetings and support, in person and online
        </li>
      </ul>
      <p>
        Those two are US services. Outside the US, your national health service
        or a local problem gambling charity will have an equivalent line.
      </p>

      <h2>Playing well</h2>
      <ul>
        <li>Play for the league and the people in it, not for the numbers.</li>
        <li>
          Your allowance resets every week, so losing all of it costs you
          nothing and changes nothing next week.
        </li>
        <li>
          If you find yourself checking scores compulsively, or feeling the way
          real losses feel, take the week off.
        </li>
      </ul>
      <p>You must be 18 or older to use Wagerwolf.</p>
    </div>
  );
}
