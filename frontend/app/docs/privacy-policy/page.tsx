import type { Metadata } from "next";

// NOT LEGALLY REVIEWED. Plain-language policy written to describe what the app
// actually stores. Have it read by a lawyer before the site is promoted.
//
// HOUSE RULES FOR THIS COPY:
//   no em dashes
//   no "not X but Y" or "X rather than Y" antithesis as a rhetorical move
//   plain declaratives, one idea per sentence
//
// SEQUENCING. Scope, then what is held, then what is never held, then why,
// then who sees it, then how long, then the rights over it, then security,
// children, transfers, amendments, contact. The reader's first question is
// "what do you have about me", so the inventory comes before the purposes.
//
// THE COLLECTION LIST IS THE User TABLE. Checked against
// backend/src/db/schema.ts on 18 Sept 2026. The columns are: email, password,
// googleId, name, displayName, firstName, lastName, timeZone,
// defaultAbbreviation, defaultHelmetColor, deactivatedAt, ageConfirmedAt,
// createdAt. `password` is written only for the synthetic ghost user that fills
// an odd numbered league, never for a person, which is why it is described here
// as a column no human account uses.
//
// IF A COLUMN IS ADDED TO User, ADD IT HERE.
//
// TWO THINGS CORRECTED ON 18 Sept 2026, both verified in the backend:
//
//  - Bet visibility was described as "once those bets have locked". That is the
//    AFTER_KICKOFF default only. League.feedVisibility also takes
//    AFTER_RESOLVE, under which a commissioner keeps bets hidden until the week
//    settles, so the policy now states that the timing is a league setting.
//  - Export and deletion were described as things we would "action" on request.
//    Both are now real endpoints: GET /users/me/export and DELETE /users/me.
//    NEITHER HAS A UI, so they are still described as support requests. Wire a
//    control to them and this section should say so instead.

export const metadata: Metadata = {
  title: "Wagerwolf Privacy Policy",
  description: "What Wagerwolf stores about you, why it stores it, who can see it, and how to have it exported or deleted.",
};

const UPDATED = "September 2026";

export default function PrivacyPage() {
  return (
    <div className="legal">
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>

      <h2>1. Scope</h2>
      <p>
        This policy covers the personal data Wagerwolf holds about the people
        who play it. Wagerwolf is free to play and there is no real money
        wagering on it, so we never handle card numbers, bank details or any
        other payment information. The set of data we do hold is small, and this
        policy lists all of it.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Your email address and your name.</strong> Both arrive from
          Google when you sign in. Google is the only way to sign in, so no
          Wagerwolf password of yours exists for us to store.
        </li>
        <li>
          <strong>A display name, a three letter tag and a helmet colour.</strong>{" "}
          These identify you to the other members of a league. We generate them
          when you join and you can change them at any time.
        </li>
        <li>
          <strong>Your time zone.</strong> Your browser reports it, and we update
          our copy automatically whenever it changes, so it follows you if you
          travel. We keep it so that anything we send you can arrive at a
          reasonable local hour. We do not store your country, your region or
          your location.
        </li>
        <li>
          <strong>The date you confirmed you are 18 or older.</strong> Recorded
          once, when your account is created. We store the date of the answer,
          and we never ask for your date of birth.
        </li>
        <li>
          <strong>The date your account was created.</strong> Your experience is
          calculated from it, and the calculation is the only use it has.
        </li>
        <li>
          <strong>Your game activity.</strong> The leagues you join, the bets you
          place, your fake currency balance, your win and loss record, and the
          messages you send in a league chat.
        </li>
        <li>
          <strong>Ordinary technical data</strong> that your browser sends with
          every request, including your IP address. We use it to keep the
          service running, to apply rate limits and to investigate abuse.
        </li>
      </ul>

      <h2>3. What we never collect</h2>
      <p>
        We hold no payment details, no date of birth, no location data and no
        password. Payment details are impossible here because nothing on
        Wagerwolf costs money. The other three are fields this application
        deliberately does not have, so there is nothing to disclose about how
        they are used or secured.
      </p>

      <h2>4. Why we hold it</h2>
      <p>
        We use your data to run the game: to sign you in, to place you in a
        league, to display your leagues and standings, to settle your bets
        against published NFL results, and to show the other members of your
        league the part of your activity that the league is built to share. We
        also use it to keep the service secure and to answer your support
        requests.
      </p>
      <p>
        We do not sell your data. We do not use it for advertising, we run no
        advertising on Wagerwolf, and we do not build profiles of you for anyone
        else&apos;s purposes.
      </p>

      <h2>5. Who else can see it</h2>
      <p>
        The other members of a league you join can see your display name, your
        helmet colour, your tag, your record, your balance and your bets. When
        your bets become visible is a league setting: by default they appear once
        the game they are on has kicked off, and a commissioner can instead keep
        them hidden until the week has settled. That visibility is how the game
        works, and joining a league is how you consent to it.
      </p>
      <p>
        Outside your league, your data reaches only the service providers we need
        in order to operate: our hosting provider, our database provider, and
        Google, because Google signs you in. Each holds it on our instructions.
      </p>
      <p>
        We may disclose data where the law requires it, or to protect the
        service and the people using it. NFL player and game data flows the other
        way: we read it from public sources and send nothing about you to them.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        We keep your data for as long as your account exists. If you deactivate,
        your personal details remain so that signing in again restores your
        account. If you ask for deletion, we remove the data described in the
        next section and keep nothing beyond what that section states.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Ask us through Contact Support at the top of this page and we will action
        any of the following.
      </p>
      <ul>
        <li>
          <strong>A copy of your data.</strong> We will send you a machine
          readable export of your account, your memberships, your bets and your
          messages.
        </li>
        <li>
          <strong>A correction.</strong> Your display name, tag and colour are
          editable in My Account. Anything else, tell us and we will fix it.
        </li>
        <li>
          <strong>Deactivation.</strong> We remove you from your leagues and
          free the seats you held, and signing in again reverses it. Your past
          bets stay in those leagues, because deleting them would change results
          other members already played out.
        </li>
        <li>
          <strong>Deletion.</strong> We delete your account, your memberships,
          your bets and your chat messages. The completed matchups of the
          members you played against survive, with your side of them shown as a
          departed player. Deletion cannot be undone.
        </li>
      </ul>
      <p>
        Depending on where you live you may have further rights over your data,
        including the right to object to a use of it or to complain to your
        national data protection authority. Contact Support is the route to all
        of them, and we do not charge for any of it.
      </p>

      <h2>8. Security</h2>
      <p>
        Access to the production database is restricted to the people who
        operate the service, traffic to the site is encrypted in transit, and we
        take a nightly backup of the database. Sign-in is delegated to Google, so
        the account most worth protecting is your Google account. No service can
        promise perfect security, and we will tell affected account holders if a
        breach ever puts their data at risk.
      </p>

      <h2>9. Children</h2>
      <p>
        Wagerwolf is for adults and requires you to be 18 or older. We do not
        knowingly collect data from children. If you believe a child has created
        an account, contact us and we will remove it.
      </p>

      <h2>10. Where your data is held</h2>
      <p>
        Our servers and our database are hosted in the United States, so your
        data is stored and processed there whatever country you play from. Google
        processes your sign-in under its own privacy policy.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        When this policy changes, the date at the top of this page changes with
        it. Where a change materially affects how we use your data, we will tell
        account holders directly.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about your data, or any request under section 7, go to Contact
        Support at the top of this page.
      </p>
    </div>
  );
}
