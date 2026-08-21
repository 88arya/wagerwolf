"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "@/lib/api";
import { seasonLabel } from "@/lib/geo";

/**
 * The landing page's utility bar line: how long until the season's first game,
 * ticking, with the sign-up link on the end of the sentence.
 *
 * It replaces the lockup rather than sitting beside it — on `/` the mark is
 * already the hero's job, so a second one in the bar above it was the same
 * asset twice on one screen. Everywhere else TopBar still renders the lockup.
 *
 * The kickoff is READ, not hardcoded. `/weeks/public/current` is the one
 * unauthenticated endpoint in the app and returns the current-or-next unresolved
 * week with its games already ordered by date, so games[0] is the next fixture
 * there is. Before the season opens that is the season opener, which is the
 * whole window this line is for.
 *
 * Which is also why it self-retires: once that first game has kicked off, the
 * endpoint's games[0] is some ordinary week-3 fixture and "the first game of the
 * season" is a lie. `counting` goes false, the sentence disappears and the link
 * is all that is left — no date needs maintaining for that to happen.
 *
 * The second-by-second re-render is contained here, deliberately. TopBar owns
 * the account menu and its open/closed state; running the interval up there
 * would re-render that menu 60 times a minute for a clock beside it.
 */

/**
 * Mirrors seasonYear() in backend/src/services/experience.ts — 1 September UTC,
 * not the real kickoff (first Thursday after Labor Day), which moves by up to a
 * week each year. UTC on both sides so the client and the server never disagree
 * about which season a date belongs to.
 */
function seasonYearOf(d: Date): number {
  const y = d.getUTCFullYear();
  // getUTCMonth is 0-indexed, so 8 is September.
  return d.getUTCMonth() >= 8 ? y : y - 1;
}

/**
 * Set here rather than inherited from the bar, because the two halves of the
 * line are deliberately NOT the same size: the sentence is 14px and the link
 * on the end of it is 13px, a step down that marks the clickable half without
 * reaching for a second colour or weight.
 *
 * The row is `align-items: baseline`, and that is load-bearing twice over. It
 * puts the two sizes on one line, which is what stops the step from reading as
 * a typo mid-sentence. And it is what aims the rule: .utility-cta collapses its
 * line box so the box bottom IS its baseline, so the rule anchored there lands
 * on the shared baseline — level with where the sentence bottoms out.
 *
 * `flex-end` was tried first, on the reading that "the bottom of the sentence"
 * meant the bottom of its line box. It does not: the sentence is mostly digits
 * and caps sitting on the baseline, and its box runs a further 3.4px below that
 * for descenders, so a rule down there read as detached from the words.
 */
const SENTENCE_PX = 14;
const CTA_PX = 13;

/** Gap between the end of the sentence and the link, in px. */
const CTA_GAP_PX = 12;

/**
 * Hand-tuned vertical nudge for the link, in px. Negative is up.
 *
 * Everything the rule's placement was derived from — the collapsed line box in
 * .utility-cta, the shared baseline, the measured ascent and descent — put it
 * where the arithmetic said the sentence bottoms out, and it still read wrong
 * on screen. So this is the eye overruling the metrics, which is what an
 * optical correction is.
 *
 * Applied as `position: relative; top`, so it moves the label and the rule
 * under it together and changes no layout: the row stays baseline-aligned, the
 * mirror opposite still matches the link's width, and the sentence stays
 * centred.
 */
const CTA_NUDGE_PX = -1;

/**
 * One string, rendered twice — see the mirror in the markup below. A literal in
 * both places would be two labels to keep in step, and the whole point of the
 * mirror is that the two are exactly the same width.
 */
const CTA_LABEL = "Play now";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Largest unit first, and units that are still zero are dropped from the front
 * rather than printed — "0d 00h 04m 12s" reads as broken. Everything after the
 * leading unit stays zero-padded so the line does not change width as each
 * digit rolls over, which in a ticking clock reads as a twitch.
 */
function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

export default function SeasonCountdown({
  style,
  onGetStarted,
}: {
  /** The bar's type treatment — face, weight, colour — plus its placement in
   *  the bar's flex row. Size is NOT taken from it: both halves of the line set
   *  their own, see SENTENCE_PX / CTA_PX above. */
  style?: CSSProperties;
  /** Omitted when the viewer is already signed in — then this is just a line of
   *  information and there is nothing to sign up for. */
  onGetStarted?: () => void;
}) {
  const [kickoff, setKickoff] = useState<Date | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api("/weeks/public/current")
      .then((res: any) => {
        // The endpoint answers `[week]` or `[]`, not a bare week — it mirrors
        // the shape of /weeks, which is a list. Unwrapped defensively so a
        // single object would still work if that ever changes.
        const week = Array.isArray(res) ? res[0] : res;
        const first = week?.games?.[0]?.gameDate;
        if (!alive || !first) return;
        const at = new Date(first);
        if (Number.isNaN(at.getTime())) return;
        setKickoff(at);
      })
      // Silent: this is decoration on a marketing page. A failed fetch leaves
      // the link standing on its own, which is the part that matters.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!kickoff) return;
    // `now` stays null until there is something to count down to, so the first
    // client render matches the server's (no clock) and hydration is quiet.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [kickoff]);

  const remaining = kickoff && now !== null ? kickoff.getTime() - now : null;
  const counting = remaining !== null && remaining > 0;

  return (
    // The spread goes FIRST and the layout wins after it: the bar's type object
    // carries `display: inline-block`, which would otherwise land on top of the
    // flex row here and collapse the truncation behaviour below.
    <span
      style={{
        ...style,
        display: "flex",
        alignItems: "baseline",
        minWidth: 0,
        fontSize: SENTENCE_PX,
      }}
    >
      {/* Invisible twin of the link, on the opposite side and the same width,
          so the row is symmetric about the sentence and TopBar's equal spacers
          centre the SENTENCE rather than the sentence-plus-link.

          The alternative was absolutely positioning the link off the sentence's
          right edge, which centres the sentence just as well but takes the link
          out of the flex flow — and with it the bottom alignment the rule under
          it depends on.

          Only rendered while there is a sentence to centre. With the countdown
          retired the link is the whole row, and a row of one is already centred
          by those spacers. */}
      {counting && onGetStarted && (
        <span
          aria-hidden="true"
          style={{
            visibility: "hidden",
            flexShrink: 0,
            fontSize: CTA_PX,
            marginRight: CTA_GAP_PX,
          }}
        >
          {CTA_LABEL}
        </span>
      )}
      {counting && (
        // Truncates under pressure while the link next to it does not — at a
        // narrow window the sentence is the expendable half.
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {/* Ends on the full stop, with no trailing space: the gap to the link
              is CTA_GAP_PX exactly, and this line used to carry a non-breaking
              space that quietly widened it. */}
          The countdown begins — {format(remaining!)} until the first game of
          the{" "}
          {seasonLabel(seasonYearOf(kickoff!))} NFL season.
        </span>
      )}
      {onGetStarted && (
        <button
          type="button"
          className="utility-cta"
          // Beats the `font: inherit` in .utility-cta, which would otherwise
          // hand it the sentence's 14px. Inline wins over the stylesheet.
          style={{
            flexShrink: 0,
            fontSize: CTA_PX,
            marginLeft: CTA_GAP_PX,
            // .utility-cta already sets position: relative, for the rule.
            top: CTA_NUDGE_PX,
          }}
          onClick={onGetStarted}
        >
          {CTA_LABEL}
        </button>
      )}
    </span>
  );
}
