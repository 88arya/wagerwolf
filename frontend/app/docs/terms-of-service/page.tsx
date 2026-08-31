import type { Metadata } from "next";

// NOT LEGALLY REVIEWED. Plain-language terms written to match how the app
// actually behaves today. Honest, but not advice and not checked by anyone
// qualified. Have it read before the site is public. The gambling-adjacent
// framing of the product is exactly why the "no real money" clause below needs
// to survive any future edit.
//
// NO EM DASHES in the copy, by house rule.
//
// TWO FACTUAL CORRECTIONS were made on 30 Aug 2026, both worth not undoing:
//
//  - "Odds and lines in Wagerwolf are generated for the game" was FALSE. They
//    come from a third-party sportsbook odds feed (services/sportsGameOdds.ts).
//    The fake-data generators were deleted; see CLAUDE.md.
//  - "You can delete your account whenever you like" promised a self-serve
//    control that does not exist. POST /users/me/deactivate is soft and
//    reversible, it is not wired to a button in My Account, and it keeps bets
//    and results because deleting them would rewrite other players' seasons.

export const metadata: Metadata = {
  title: "Wagerwolf Terms of Service",
  description: "The rules for using Wagerwolf.",
};

const UPDATED = "August 2026";

export default function TermsPage() {
  return (
    <div className="legal">
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>

      <h2>Using Wagerwolf</h2>
      <p>
        Wagerwolf is a free to play fantasy football game scored like a
        sportsbook. By creating an account you agree to these terms. You must be
        18 or older to use it.
      </p>

      <h2>No real money</h2>
      <p>
        Every balance, stake, payout, and allowance in Wagerwolf is fake currency with no cash value. Nothing can be deposited,
        nothing can be withdrawn, and nothing can be exchanged for money, goods,
        prizes, or anything else of value. No real money wagering takes place on
        this service. If you are looking to bet real money, this is not that,
        and we do not facilitate it.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with Google, so the account you are really protecting is
        that one. We never see or store a Wagerwolf password. Keep your Google
        credentials to yourself, since you are responsible for what happens
        under your account. One account per person. Tell us if you think someone
        else has got into it.
      </p>

      <h2>Fair play</h2>
      <p>
        Do not use bots, scripts, or automated tools against the service, do not
        try to break or overload it, and do not create extra accounts to gain an
        advantage in a league. Leagues are social, so treat the people in yours
        accordingly. Chat that is harassing, hateful, or illegal is not allowed,
        and both commissioners and we can remove members who post it.
      </p>

      <h2>Odds, results, and corrections</h2>
      <p>
        The odds and lines you bet into come from a third party sportsbook odds
        feed rather than from us. We do not set them, and we do not adjust them
        in anyone&apos;s favour. Bets then settle against publicly available NFL
        statistics.
      </p>
      <p>
        Both of those sources can be late, wrong, or revised after the fact. We
        aim to settle correctly and to fix genuine errors, but we do not
        guarantee that any line, result, or standing is accurate, and we may
        correct a settlement when a source corrects itself. Since no money is
        involved, a correction costs nothing but a changed record.
      </p>

      <h2>Availability</h2>
      <p>
        We may change, suspend, or discontinue any part of the service, including
        a season already in progress, without notice. The service is provided as
        it is, with no warranty of any kind.
      </p>

      <h2>Our content</h2>
      <p>
        The Wagerwolf name, logo, and the site itself belong to us. NFL team
        names, logos, and marks belong to their respective owners and are used
        here to identify real teams and players. Wagerwolf is not affiliated
        with, endorsed by, or sponsored by the NFL or any of its clubs.
      </p>

      <h2>Ending it</h2>
      <p>
        You can stop using Wagerwolf at any time, and nothing is lost by walking
        away because none of the balance was ever real. To have your account
        closed, ask us using Contact Support at the top of this page. Your past
        bets stay in your leagues&apos; records, because removing them would
        change results other members already played out. We can also suspend or
        close an account that breaks these terms.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The date at the top will change, and
        continuing to use Wagerwolf after that means you accept the new version.
      </p>

      <p style={{ marginTop: 26 }}>
        Questions about any of this go to Contact Support, at the top of this
        page.
      </p>
    </div>
  );
}
