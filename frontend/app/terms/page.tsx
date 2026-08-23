import type { Metadata } from "next";
import BarePageHeader from "@/components/BarePageHeader";

// NOT LEGALLY REVIEWED. Plain-language terms written to match how the app
// actually behaves today. Honest, but not advice and not checked by anyone
// qualified — have it read before the site is public. The gambling-adjacent
// framing of the product is exactly why the "no real money" clause below needs
// to survive any future edit.

export const metadata: Metadata = {
  title: "Terms of Service — Wagerwolf",
  description: "The rules for using Wagerwolf.",
};

const UPDATED = "August 2026";

export default function TermsPage() {
  return (
    <div className="bare-route">
      <BarePageHeader done />
      <div className="page legal">
      <h1>Terms of Service</h1>
      <p style={{ marginTop: 8, color: "var(--text-3)", fontSize: "0.78rem" }}>
        Last updated {UPDATED}
      </p>

      <h2>Using Wagerwolf</h2>
      <p>
        Wagerwolf is a free-to-play fantasy football game scored like a
        sportsbook. By creating an account you agree to these terms. You must be
        18 or older to use it.
      </p>

      <h2>No real money</h2>
      <p>
        This is the important one. Every balance, stake, payout and allowance in
        Wagerwolf is fake currency with no cash value. Nothing can be deposited,
        nothing can be withdrawn, nothing can be exchanged for money, goods,
        prizes or anything else of value, and no real-money wagering takes place
        on this service. If you are looking to bet real money, this is not that,
        and we do not facilitate it.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your login details to yourself — you are responsible for what
        happens under your account. One account per person. Tell us if you think
        someone else has got into it.
      </p>

      <h2>Fair play</h2>
      <p>
        Do not use bots, scripts or automated tools against the service, do not
        try to break or overload it, and do not create extra accounts to gain an
        advantage in a league. Leagues are social; treat the people in yours
        accordingly. Chat that is harassing, hateful or illegal is not allowed,
        and commissioners and we can remove members who post it.
      </p>

      <h2>Leagues and results</h2>
      <p>
        Odds and lines in Wagerwolf are generated for the game, and bets settle
        against publicly available NFL statistics. Those sources can be wrong,
        late or revised. We aim to settle correctly and to fix genuine errors,
        but we do not guarantee that any line, result or standing is accurate,
        and we may correct settlements after the fact when a source corrects
        itself. Since no money is involved, a correction costs nothing but a
        changed record.
      </p>

      <h2>Availability</h2>
      <p>
        We may change, suspend or discontinue any part of the service, including
        an in-progress season, without notice. The service is provided as-is,
        with no warranty of any kind.
      </p>

      <h2>Our content</h2>
      <p>
        The Wagerwolf name, logo and the site itself belong to us. NFL team
        names, logos and marks belong to their respective owners and are used
        here to identify real teams and players; Wagerwolf is not affiliated
        with, endorsed by or sponsored by the NFL or any of its clubs.
      </p>

      <h2>Ending it</h2>
      <p>
        You can delete your account whenever you like. We can suspend or close an
        account that breaks these terms.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The date at the top will change, and
        continuing to use Wagerwolf after that means you accept the new version.
      </p>

      <p style={{ marginTop: 26 }}>
        Questions about any of this go to the <a href="/contact">contact page</a>.
      </p>
      </div>
    </div>
  );
}
