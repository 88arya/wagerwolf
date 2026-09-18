import type { Metadata } from "next";

// NOT LEGALLY REVIEWED. Plain-language terms written to match how the app
// actually behaves. Have them read by a lawyer before the site is promoted.
//
// HOUSE RULES FOR THIS COPY:
//   no em dashes
//   no "not X but Y" or "X rather than Y" antithesis as a rhetorical move
//   plain declaratives, one idea per sentence
//
// SEQUENCING. The order follows the structure free-to-play operators converge
// on, which runs the reader forward through their own use of the service and
// only then reaches enforcement: acceptance, eligibility, account, currency,
// conduct, the data the game depends on, ownership, availability, disclaimers,
// liability, ending the agreement, governing law, amendments, contact.
// Restrictions come before remedies, and remedies before jurisdiction.
//
// FACTS VERIFIED against the backend on 18 Sept 2026:
//   age              MIN_AGE = 18 (services/age.ts); recorded as
//                    User.ageConfirmedAt, a timestamp of the answer
//   sign-in          Google only; users.password is written for the synthetic
//                    ghost user alone, never for a person
//   odds             services/sportsGameOdds.ts, a third-party feed
//   settlement       services/grading.ts is the only grading authority
//   deactivate       POST /users/me/deactivate: soft, reversible, releases
//                    seats, KEEPS bets
//   deletion         DELETE /users/me: deletes memberships, picks, gamepicks,
//                    parlays, parlay legs, chat messages, then the User row.
//                    Other players' matchup rows survive. Neither route has a
//                    UI, so both are described as support requests.
//
// GOVERNING LAW IS ONTARIO, set 18 Sept 2026. See the note on GOVERNING_LAW for
// why the clause carries the federal half as well, and section 15 for why the
// jurisdiction is NON-exclusive and is followed by a consumer-law carve-out:
// an exclusive-forum clause is widely unenforceable against a consumer who has
// a statutory right to sue where they live, and claiming otherwise in a
// document this one also uses to carry the age gate is not worth the sentence.
//
// SECTIONS 11, 12 AND 15 ARE THE ONES TO HAVE READ. They are where plain
// language and enforceability diverge most.

export const metadata: Metadata = {
  title: "Wagerwolf Terms of Service",
  description: "The agreement between you and Wagerwolf: eligibility, fake currency, fair play, and how the service is run.",
};

const UPDATED = "September 2026";

/**
 * ONTARIO PLUS THE FEDERAL LAYER, and both halves are load bearing.
 *
 * Canada is federal, so contract law and the courts are provincial and a clause
 * naming "Canada" alone identifies no forum. The trailing "and the federal laws
 * of Canada applicable therein" is the standard second half, and it is what
 * picks up the federal statutes that do apply, PIPEDA among them, which is the
 * privacy law the Privacy Policy sits under.
 *
 * Set on 18 Sept 2026. This rendered as "[jurisdiction not yet set]" until
 * then, deliberately visible: a clause naming the wrong forum is worse than a
 * gap that flags itself.
 */
const GOVERNING_LAW =
  "the Province of Ontario and the federal laws of Canada applicable therein";

export default function TermsPage() {
  return (
    <div className="legal">
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>

      <h2>1. Agreeing to these terms</h2>
      <p>
        Wagerwolf is a free fantasy football game scored like a sportsbook. These
        terms are the agreement between you and Wagerwolf, and you accept them
        when you create an account or use the service. If any part of them is
        unacceptable to you, please do not use Wagerwolf.
      </p>

      <h2>2. Who may use Wagerwolf</h2>
      <p>
        You must be 18 or older. You confirm your age when your account is
        created, and we keep a record of the date you confirmed it. You may hold
        one account. You are responsible for checking that fantasy sports games
        are lawful where you live, and you may not use Wagerwolf where they are
        not.
      </p>

      <h2>3. Your account</h2>
      <p>
        Signing in happens through Google, so the credentials that protect your
        Wagerwolf account are your Google credentials. We never see or store a
        Wagerwolf password. Everything done under your account is treated as
        done by you, so keep your Google account secure and tell us promptly if
        you believe someone else has reached it.
      </p>

      <h2>4. Fake currency and the absence of real money</h2>
      <p>
        Every balance, stake, payout and weekly allowance in Wagerwolf is fake
        currency. It has no cash value and it is not money, credit or property
        of any kind. You cannot deposit, you cannot withdraw, you cannot buy
        fake currency, and you cannot sell, trade, transfer or redeem it for
        money, goods, prizes or anything else of value.
      </p>
      <p>
        What you hold is a limited permission to use a feature of the game. We
        may adjust, reset or remove fake currency balances in the course of
        running the service, including when a bet has to be settled again after
        a corrected result.
      </p>
      <p>
        No real money wagering takes place on Wagerwolf. We do not accept wagers,
        we do not hold customer funds, and we do not arrange real money betting
        anywhere else. The only thing at stake in a league is the league title.
      </p>

      <h2>5. Fair play</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          use bots, scripts, scrapers or any other automated means to interact
          with the service;
        </li>
        <li>
          create additional accounts, including to gain an advantage in a league
          or to return after an account was closed;
        </li>
        <li>
          interfere with the service or the infrastructure behind it, including
          attempts to overload it, probe it or bypass its security;
        </li>
        <li>
          exploit a defect in settlement, pricing or balances instead of
          reporting it; or
        </li>
        <li>
          copy, reverse engineer or redistribute any part of the service.
        </li>
      </ul>

      <h2>6. Leagues, chat and other members</h2>
      <p>
        A league is a shared space. The other members can see your display name,
        your helmet colour, your record, your balance and your bets once those
        bets are visible under your league&apos;s settings. Your commissioner
        configures the league and may remove members from it.
      </p>
      <p>
        You are responsible for what you post in a league chat. Harassing,
        hateful, threatening or unlawful messages are not permitted, and both
        commissioners and Wagerwolf may remove messages or members who post
        them. You keep ownership of what you write and you grant us permission
        to store and display it to your league for as long as the league exists.
      </p>

      <h2>7. Odds, statistics and settlement</h2>
      <p>
        The odds and lines available in the game come from a third-party
        sportsbook odds feed. We do not set them, we do not price them and we do
        not alter them in any member&apos;s favour. Bets settle against
        published NFL statistics, using the settlement rules described in{" "}
        <a href="/docs/how-it-works">How It Works</a>.
      </p>
      <p>
        Both sources can be late, incomplete or wrong. Some games and some
        markets will have no odds at all, and a week whose schedule has not been
        published will have no games. We give no warranty that any line, result,
        balance or standing is accurate.
      </p>

      <h2>8. Corrections</h2>
      <p>
        When a source corrects itself, or when a bet settles against something
        other than the actual result, we may settle it again and adjust the
        balances involved. Because no real money is at stake, the cost of a
        correction is a changed record. We will apply corrections consistently
        across everyone affected.
      </p>

      <h2>9. Our content, and NFL marks</h2>
      <p>
        The Wagerwolf name, the wolf mark, the site and the software behind it
        belong to us. NFL team names, logos and marks belong to their respective
        owners and appear here to identify real teams, players and games.
        Wagerwolf is not affiliated with, endorsed by or sponsored by the
        National Football League or any of its clubs.
      </p>

      <h2>10. Availability and changes to the service</h2>
      <p>
        We may add, change, suspend or discontinue any part of Wagerwolf at any
        time, including a season already in progress, and including the service
        as a whole. We will give notice where it is practical to do so. The
        service depends on third parties for schedules, statistics and odds, and
        an outage at any of them can interrupt play.
      </p>

      <h2>11. No warranty</h2>
      <p>
        Wagerwolf is provided as it is and as it is available, without warranty
        of any kind, whether express or implied. To the fullest extent the law
        allows, we disclaim the implied warranties of merchantability, fitness
        for a particular purpose and non-infringement. We do not warrant that
        the service will be uninterrupted, secure or free of defects, or that
        any result or settlement is correct.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, Wagerwolf and the people who work
        on it are not liable for indirect, incidental, special, consequential or
        punitive damages, or for any loss of data, goodwill or fake currency,
        arising from your use of the service. Where liability cannot be excluded,
        it is limited to one hundred United States dollars. Nothing in these
        terms excludes liability that cannot lawfully be excluded.
      </p>
      <p>
        Fake currency is outside this limit in both directions. It has no cash
        value, so no loss of it is a financial loss, and we will not compensate
        for it in money.
      </p>

      <h2>13. Suspension and closure by us</h2>
      <p>
        We may suspend or close an account that breaches these terms, that harms
        other members, or that we reasonably believe is being used to attack or
        exploit the service. Where a breach is minor we will normally warn you
        first.
      </p>

      <h2>14. Ending your own account</h2>
      <p>
        You may stop using Wagerwolf at any time, and nothing follows you out
        because none of the balance was ever real. Two things are available on
        request through Contact Support at the top of this page.
      </p>
      <ul>
        <li>
          <strong>Deactivation</strong> leaves your leagues, frees the seats you
          held so those leagues can fill and start, and can be undone by signing
          in again. Your past bets stay in your leagues&apos; records, because
          removing them would change results other members already played out.
        </li>
        <li>
          <strong>Deletion</strong> removes your account, your memberships, your
          bets and your chat messages, and cannot be undone. The completed
          matchups of the members you played against remain, with your side of
          them shown as a departed player.
        </li>
      </ul>

      <h2>15. Governing law</h2>
      <p>
        These terms are governed by {GOVERNING_LAW}, without regard to conflict
        of laws rules, and the courts of Ontario have non-exclusive jurisdiction
        over any dispute arising from them. Nothing here removes a right you
        have under the consumer law of the place you live, including any right
        to bring a claim there. We would prefer to settle a complaint directly,
        so please raise it with us through Contact Support first.
      </p>

      <h2>16. Changes to these terms</h2>
      <p>
        We may update these terms. When we do, the date at the top of this page
        changes, and continuing to use Wagerwolf after that date means you accept
        the updated version. Where a change materially reduces your rights, we
        will tell account holders directly.
      </p>

      <h2>17. Contact</h2>
      <p>
        Questions about any of this go to Contact Support at the top of this
        page.
      </p>
    </div>
  );
}
