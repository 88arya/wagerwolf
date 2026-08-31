import type { Metadata } from "next";

// NOT LEGALLY REVIEWED. Plain-language boilerplate written to describe what the
// app actually stores. Have it read before the site is public.
//
// NO EM DASHES in the copy, by house rule.
//
// THE COLLECTION LIST IS THE User TABLE, and it was checked against
// backend/src/db/schema.ts on 30 Aug 2026. The columns are: email, googleId,
// name, displayName, firstName, lastName, timeZone, defaultAbbreviation,
// defaultHelmetColor, deactivatedAt, ageConfirmedAt, createdAt. (`password`
// exists but is written only for the synthetic ghost user that fills an odd
// numbered league, never for a person.)
//
// Three corrections were made against the previous version:
//
//  - It said we receive "your profile image from Google". THERE IS NO IMAGE
//    COLUMN. Nothing stores one.
//  - Time zone and the 18+ timestamp were collected and NOT disclosed. Both
//    are now listed. timeZone is written automatically by lib/useTimeZoneSync
//    on every mount, which is exactly the sort of silent collection a privacy
//    policy exists to declare.
//  - "Delete your account and we delete the account record" overstated it.
//    Deactivation is soft and reversible, and bets are deliberately kept.
//
// If a column is added to User, add it here.

export const metadata: Metadata = {
  title: "Wagerwolf Privacy Policy",
  description: "What Wagerwolf stores about you, why, and what it never collects.",
};

const UPDATED = "August 2026";

export default function PrivacyPage() {
  return (
    <div className="legal">
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>

      <h2>What this covers</h2>
      <p>
        Wagerwolf is a free to play fantasy football game. There is no real
        money wagering, no deposits, and no withdrawals, so we never handle
        payment details, bank information, or anything similar. This policy
        describes the much smaller set of data we do hold.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your email address and name</strong>, both of which come from
          Google when you sign in. Google is the only way to sign in, so we
          never see or store a password of yours.
        </li>
        <li>
          <strong>A display name, a three letter tag, and a helmet colour.</strong>{" "}
          These identify you to the other players in a league. We generate them
          for you and you can change them.
        </li>
        <li>
          <strong>Your time zone</strong>, detected from your browser and
          updated automatically if it changes. It is stored so that anything we
          send you can arrive at a sensible local hour. We do not store your
          country, your region, or your location.
        </li>
        <li>
          <strong>The date you confirmed you are 18 or older</strong>, recorded
          once when your account is created. We store the date of the answer
          rather than your date of birth, which we never ask for.
        </li>
        <li>
          <strong>Your game activity:</strong> the leagues you join, the bets
          you place, your fake currency balance, your record, and messages you
          send in a league chat.
        </li>
        <li>
          <strong>Basic technical data</strong> your browser sends with every
          request, such as your IP address, used to keep the service running and
          secure.
        </li>
      </ul>

      <h2>What we never collect</h2>
      <p>
        No payment details, no date of birth, no location, and no password. The
        first is impossible because nothing here costs money, and the other
        three are fields this app deliberately does not have.
      </p>

      <h2>What we do with it</h2>
      <p>
        We use it to run the game: to sign you in, to show your leagues and
        standings, to settle bets against real NFL results, and to let the other
        members of your league see the parts of your activity the league is
        meant to share. We do not sell it and we do not use it for advertising.
      </p>

      <h2>Who else sees it</h2>
      <p>
        Other members of a league you join can see your display name, your
        helmet colour, your record, your balance, and your bets once those bets
        have locked. That visibility is the game. Beyond your league, data
        reaches only the services we need to operate: our hosting and database
        providers, and Google, because Google signs you in.
      </p>
      <p>
        NFL player and game data flows the other way. We read it from public
        sources and send nothing about you to them.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as your account exists. If you ask us to close it, we remove
        your personal details and release the seats you hold in your leagues.
        Your past bets and results stay in those leagues, because deleting them
        would change seasons that other members already played out.
      </p>

      <h2>Your choices</h2>
      <p>
        You can change your display name, your tag, and your colour in settings
        at any time. You can ask us for a copy of your data, ask us to correct
        it, or ask us to close your account. Write to us using Contact Support,
        at the top of this page, and we will action it.
      </p>

      <h2>Children</h2>
      <p>
        Wagerwolf is not intended for anyone under 18. We do not knowingly
        collect data from children. If you believe a child has created an
        account, contact us and we will remove it.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that matters, we will update the date at
        the top and, where the change is significant, tell account holders
        directly.
      </p>
    </div>
  );
}
