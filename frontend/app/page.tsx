/**
 * Landing page - a claim and the way in, and nothing else.
 *
 * ONE SCREEN. The three stacked sections that were here (what it is, the bet
 * types with card graphics, the weekly reset) are gone; so is the watermark
 * hero before them. Recoverable with `git show HEAD:frontend/app/page.tsx`.
 *
 * THE HEADLINE IS THE WHOLE PITCH, and it is the claim the utility bar used to
 * carry as a subtitle. Saying it once, at 64px, beats saying it twice - so the
 * bar was cut back to "NFL season is here - Play now for completely free." when
 * this took the line over.
 *
 * Sentence case, not Title Case. Every heading in this app is sentence case
 * (.mx-pane-title, /settings' tabs), and at this size Title Case reads as a
 * logo lockup rather than as a sentence someone wrote.
 *
 * THE CALL TO ACTION IS THE REAL CONTROL, not a link to one. Email and Continue
 * are the same pair /sign-in carries, laid out side by side - so the first
 * thing on the page is the first step of signing up rather than a button that
 * goes to a page with a button on it. See components/LandingCta.
 *
 * The chrome around this is NOT part of this file: AppChrome (the utility bar
 * and the games strip) and SiteFooter are mounted by the root layout on every
 * route, and on `/` the bar swaps its lockup for SeasonCountdown.
 */
import SignedOutOnly from "@/components/SignedOutOnly";
import LandingCta from "@/components/LandingCta";
import PropMarquee from "@/components/PropMarquee";

export default function LandingPage() {
  return (
    <>
      {/* Signed in, this page sells an account to someone who has one - and its
          only control would start a sign-in they do not need. */}
      <SignedOutOnly />

      <div className="lp">
        {/* `is-dots` and not `.lp-section` itself: the dot field belongs to
            the first screen only. A second section added below this one gets a
            plain white ground unless it asks for the same class, so the texture
            cannot creep down the page as the landing grows.

            `is-centered` IS UP FOR COMPARISON, not settled. Left-aligned, the
            headline shares --rail with the lockup and the nav above it, which
            is the only vertical edge the page has; centred, it reads as a
            single-message launch screen and the empty right-hand third stops
            looking like a missing second column. Delete the one word to go
            back - everything the alternative needs is already in the base
            rules. */}
        <section className="lp-section is-dots is-centered">
          <div className="lp-inner">
            <h1 className="lp-h1">
              {/* NO <br>. The line still breaks after "first", but as a SOFT
                  wrap rather than a hard one - because Chrome treats a <br> as
                  a paragraph boundary, so triple-clicking selected one line
                  instead of the whole heading. A soft wrap is not a boundary,
                  so the sentence selects, copies and reads as the one sentence
                  it is.

                  HOW THE BREAK IS FORCED: non-breaking spaces bind "fantasy
                  football sportsbook." into a single unbreakable run, leaving
                  the space after "first" as the only place the line can break.
                  The width cap on .lp-section.is-centered .lp-inner then makes
                  sure it has to. Both halves are required - drop either and the
                  break moves.

                  It falls after "first" because that is the sentence's own
                  joint: the claim, then the thing being claimed. Breaking after
                  "football" was tried and reverted - it stranded "sportsbook."
                  alone, 34 characters over 11. */}
              The world&rsquo;s first fantasy&nbsp;football&nbsp;sportsbook.
            </h1>
            <LandingCta />
          </div>
        </section>

        {/* SECTION TWO - the sportsbook half of the headline, shown rather than
            claimed.

            NO HEADING. It carried "The lines are real, and they move." over a
            paragraph naming the 22 stat types and the feed - and the cards say
            all of it better: real players, real prices, moving. A sentence
            asserting that the thing below it is real is weaker than the thing
            being real.

            `is-centered` came off with the text; there is nothing left to
            centre, and the rows set their own offsets. */}
        <section className="lp-section is-marquee">
          <PropMarquee />
        </section>

        {/* THE CLOSING BAND. The same control again, under the line that argues
            for the format rather than naming it - so someone who scrolled past
            the hero unconvinced meets the offer once more, having by then read
            the case for it. The hero says what this IS; this says why it beats
            the thing you already play.

            `is-band` rather than a second full screen: a closing call to action
            is a stop, not another chapter, and a viewport of it would make the
            page feel like it had restarted.

            No `is-dots`. The texture belongs to the first screen only. */}
        <section className="lp-section is-centered is-band">
          <div className="lp-inner">
            <h2 className="lp-h2">Your season shouldn&rsquo;t end in week 3.</h2>
            {/* No footnote here. It is the same control as the hero's and the
                same agreement, stated once on the page rather than twice -
                see LandingCta's `consent` prop for why the default is ON and
                this is the exception. */}
            <LandingCta consent={false} />
          </div>
        </section>
      </div>
    </>
  );
}
