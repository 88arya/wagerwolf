import type { Metadata } from "next";

// PLACEHOLDER ADDRESS. There is no real support mailbox yet, and inventing one
// that bounces is worse than none at all — so this is the single constant to
// change once a real one exists. It is referenced from /privacy and /terms via
// links to this page, so changing it here is enough.
const SUPPORT_EMAIL = "support@wagerwolf.app";

export const metadata: Metadata = {
  title: "Contact — Wagerwolf",
  description: "How to reach the people who run Wagerwolf.",
};

export default function ContactPage() {
  return (
    <div className="page legal">
      <h1>Contact</h1>

      <p style={{ marginTop: 14 }}>
        Wagerwolf is a small project. There is no support queue and no phone
        line — email reaches a person directly, and that is the fastest way to
        get anything sorted.
      </p>

      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ fontSize: "1rem", fontWeight: 500 }}>
          {SUPPORT_EMAIL}
        </a>
      </p>

      <h2>What to include</h2>
      <ul>
        <li>
          <strong>A settlement looks wrong</strong> — the league, the week, and
          the bet. We settle against public NFL statistics, and those are
          occasionally revised, so we can check the source and correct it.
        </li>
        <li>
          <strong>Can&apos;t sign in / password reset</strong> — Wagerwolf has no
          password of its own. Signing in goes through Google, so if you cannot
          get in, the account to recover is your Google one, and Google handles
          that at{" "}
          <a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noopener noreferrer">
            accounts.google.com
          </a>
          . We cannot reset it for you and will never ask you for a password.
          Write to us if you get back into Google and still cannot get in here.
        </li>
        <li>
          <strong>Changing your email address</strong> — write to us from the
          address currently on the account and tell us the new one. There is no
          self-serve way to do this yet: the address is what identifies you, so
          moving it has to be checked by a person rather than accepted from
          whoever happens to be signed in.
        </li>
        <li>
          <strong>A data request</strong> — tell us whether you want a copy of
          your data, a correction, or your account deleted. See the{" "}
          <a href="/privacy">privacy policy</a> for what we hold.
        </li>
        <li>
          <strong>Someone in a league is a problem</strong> — the league and
          what happened. Commissioners can remove members, and so can we.
        </li>
      </ul>

      <h2>Before you write</h2>
      <p>
        If it is a question about how the game works — allowances, parlays,
        playoffs, how a matchup is scored — <a href="/how-to-play">How to Play</a>{" "}
        probably answers it faster than we can.
      </p>

      <p style={{ marginTop: 26 }}>
        Wagerwolf is a free-to-play game with no real-money wagering, so there is
        nothing to bill and no payment support to provide. If you are looking for
        help with real gambling, see{" "}
        <a href="/responsible-gaming">Responsible Gaming</a>.
      </p>
    </div>
  );
}
