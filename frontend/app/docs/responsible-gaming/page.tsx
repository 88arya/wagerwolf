import type { Metadata } from "next";
import BarePageHeader from "@/components/BarePageHeader";

// Worth carrying even though the money is fake — the product deliberately looks
// and reads like a sportsbook, and someone who is working through a gambling
// problem can be pulled by the format alone, with no stake at risk. The point
// of this page is to say plainly that nothing here is real, and to point at
// help that is.
//
// The helpline below is the US National Problem Gambling Helpline, run by the
// National Council on Problem Gambling. If Wagerwolf ever ships outside the US,
// this needs regional numbers rather than just this one.

export const metadata: Metadata = {
  title: "Responsible Gaming — Wagerwolf",
  description: "Wagerwolf uses fake money. If real gambling is a problem, here is where to get help.",
};

export default function ResponsibleGamingPage() {
  return (
    <div className="bare-route">
      <BarePageHeader done />
      <div className="page legal">
      <h1>Responsible Gaming</h1>

      <h2>There is no real money here</h2>
      <p>
        Wagerwolf is a free-to-play game. Every balance, stake and payout on this
        site is fake currency with no cash value. You cannot deposit, you cannot
        withdraw, you cannot buy fake currency, and there is nothing to win but
        a league title. No real-money wagering takes place on Wagerwolf.
      </p>
      <p>
        We say that plainly because the game is built to look and read like a
        sportsbook — the odds, the slip, the parlays. The resemblance is the
        point of the format, and it is also the reason this page exists.
      </p>

      <h2>If the format is a problem for you</h2>
      <p>
        For some people, a realistic betting interface is a trigger whether or
        not money is at stake. If that is you, the right move is to stop using
        Wagerwolf — no balance is lost by walking away, because none of it was
        ever real. You can delete your account at any time.
      </p>

      <h2>Where to get help</h2>
      <p>
        If gambling with real money has become a problem, free and confidential
        help is available 24/7 in the US:
      </p>
      <ul>
        <li>
          <strong>National Problem Gambling Helpline</strong> — call or text{" "}
          <strong>1-800-522-4700</strong>, or chat at{" "}
          <a href="https://www.ncpgambling.org/chat" target="_blank" rel="noopener noreferrer">
            ncpgambling.org/chat
          </a>
        </li>
        <li>
          <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer">
            Gamblers Anonymous
          </a>{" "}
          — meetings and support, in person and online
        </li>
      </ul>
      <p>
        Outside the US, your national health service or a local problem-gambling
        charity will have an equivalent line.
      </p>

      <h2>Playing well</h2>
      <ul>
        <li>Play for the league and the people in it, not the numbers.</li>
        <li>Your allowance resets every week. Losing all of it costs nothing.</li>
        <li>
          If you find yourself checking scores compulsively, or feeling the way
          real losses feel, take the week off.
        </li>
      </ul>

      <p style={{ marginTop: 26 }}>
        You must be 18 or older to use Wagerwolf.
      </p>
      </div>
    </div>
  );
}
