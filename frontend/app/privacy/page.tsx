import type { Metadata } from "next";
import BarePageHeader from "@/components/BarePageHeader";

// NOT LEGALLY REVIEWED. This is plain-language boilerplate written to describe
// what the app actually does today — the data it stores, who it goes to, and
// what a user can ask for. It is honest about the current implementation but it
// is not advice, and it has not been checked by anyone qualified. Have it read
// before the site is public, and revisit it whenever a new third party starts
// receiving user data.

export const metadata: Metadata = {
  title: "Privacy Policy — Wagerwolf",
  description: "What Wagerwolf collects, why, and what you can ask us to do with it.",
};

const UPDATED = "August 2026";

export default function PrivacyPage() {
  return (
    <div className="bare-route">
      <BarePageHeader done />
      <div className="page legal">
      <h1>Privacy Policy</h1>
      <p style={{ marginTop: 8, color: "var(--text-3)", fontSize: "0.78rem" }}>
        Last updated {UPDATED}
      </p>

      <h2>What this covers</h2>
      <p>
        Wagerwolf is a free-to-play fantasy football game. There is no real-money
        wagering, no deposits and no withdrawals, so we never handle payment
        details, bank information or anything similar. This policy describes the
        much smaller set of data we do hold.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details</strong> — your email address, your name, and a
          display name. If you sign in with Google we receive your email address,
          name and profile image from Google; we never see your Google password.
        </li>
        <li>
          <strong>A password</strong>, if you create an account with one. It is
          stored only as a one-way hash, so it cannot be read back out.
        </li>
        <li>
          <strong>Game activity</strong> — the leagues you join, the bets you
          place, your fake-currency balance, your record, and messages you send
          in a league chat.
        </li>
        <li>
          <strong>Basic technical data</strong> your browser sends with every
          request, such as your IP address, which is used to keep the service
          running and secure.
        </li>
      </ul>

      <h2>What we do with it</h2>
      <p>
        We use it to run the game: to sign you in, to show your leagues and
        standings, to settle bets against real NFL results, and to let the other
        members of your league see the parts of your activity the league is meant
        to share. We do not sell it and we do not use it for advertising.
      </p>

      <h2>Who else sees it</h2>
      <p>
        Other members of a league you join can see your display name, your
        helmet colour, your record, your balance and your bets once they have
        locked. That visibility is the game. Outside of that, data reaches only
        the services we need to operate: our hosting and database providers,
        and Google if you chose to sign in with Google. NFL player and game data
        flows the other way — we read it from public sources and send nothing
        about you to them.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as your account exists. Delete your account and we delete the
        account record and its personal details; league history may retain an
        anonymised trace so other members&apos; past seasons still add up.
      </p>

      <h2>Your choices</h2>
      <p>
        You can change your display name in settings at any time. You can ask us
        for a copy of your data, ask us to correct it, or ask us to delete your
        account outright — write to us from the <a href="/contact">contact page</a>{" "}
        and we will action it.
      </p>

      <h2>Children</h2>
      <p>
        Wagerwolf is not intended for anyone under 18. We do not knowingly
        collect data from children; if you believe a child has created an
        account, contact us and we will remove it.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that matters, we will update the date at
        the top and, where the change is significant, tell account holders
        directly.
      </p>
      </div>
    </div>
  );
}
