import type { CSSProperties } from "react";
import Logo from "@/components/Logo";

/**
 * Horizontal name lockup — the wolf mark beside "Wagerwolf" set in type.
 *
 * A full redraw, not an edit. The previous version spelled "wager" in five bet
 * slips, one letter each, from before the rename; five slips cannot hold ten
 * letters, so there was nothing to salvage.
 *
 * Set in real text rather than SVG paths or <text>. The name is a word, so it
 * should be selectable, searchable and read aloud as one — and it means the
 * lockup needs no re-cutting if the product name ever changes again. The mark
 * beside it is hidden from assistive tech (aria-hidden on its wrapper) so the
 * pair announces once, not twice.
 *
 * Inter Tight, the UI face — --font-sans, loaded in app/layout.tsx. The lockup
 * went Poppins → Lexend Deca → Viga → Anton → Passion One → Fugaz One and now
 * lands on the face the rest of the app is already set in, which is the one
 * option that costs nothing to load and cannot drift away from the UI.
 *
 * Set in sentence case, not caps.
 *
 * Fugaz One has NOT left the bundle — GamesStrip still sets team abbreviations
 * in it, so --font-fugaz-one stays in layout.tsx. It is simply no longer the
 * wordmark's face, and the two no longer share one.
 *
 * Three things left with it, all of them face-specific and none of them worth
 * carrying over:
 *   • the skew. It existed to fight Fugaz One's *drawn* forward lean; Inter
 *     Tight is upright, so the same transform would be a real 10deg backslant
 *     rather than a correction. Gone, along with TopBar's LEAN_PX, which only
 *     ever padded for the shear.
 *   • the optical shift. Re-derived below — see OPTICAL_SHIFT_EM.
 *   • the weight argument. Fugaz One ships one cut, so 400 was forced, and its
 *     strokes were heavy enough for a display face that 400 still read as
 *     emphatic. Inter Tight at the same number does not — it is the body face,
 *     so 400 made the name look like running text with a logo next to it. The
 *     lockup is set at 500, the top of the design system's 400–500 range, which
 *     is a real cut on the variable axis rather than a synthesised one.
 */

// Type size and gap as fractions of the lockup height, so a single `height`
// prop scales the whole thing and the proportions hold from nav size (~22px)
// up to the landing hero. Both are taken from the landing header's hand-tuned
// pairing, which sat a 1.05rem label beside a 24px mark at a 9px gap.
//
// Deliberately NOT the cap-height match: setting the caps as tall as the mark
// means dividing by the face's cap height (1.61 for Passion One at 0.621em),
// which was tried and reverted — it made the name shout over the mark rather
// than sit beside it.
export const WORDMARK_FONT_RATIO = 0.7;
const GAP_RATIO = 0.34;

/**
 * The lockup's face. Exported because TopBar's "My Account" sits on it too —
 * it is the only other text in the utility bar, and with the wordmark beside it
 * the two reading as different typefaces was the one thing that made the bar
 * look assembled rather than set.
 *
 * Everything except size, which scales off `height` — spread this and add
 * `fontSize` alongside it. It is one object rather than a face, a weight and a
 * tracking value exported separately because those were kept in sync by hand
 * and drifted apart twice: once when the face changed and the weight did not,
 * and once when case and tracking stayed behind after the rest matched.
 *
 * - font falls back to the UI face, so a failed fetch degrades to Inter Tight
 *   rather than to a system default
 * - weight is 400 to stay inside the design system's cap; raise it here if a
 *   multi-weight face replaces it and both consumers follow
 * - tracking is -0.01em. It sat at -0.02em for six faces, inherited from Poppins,
 *   then went to +0.03em on the reasoning that condensed caps want opening up.
 *   Pulled back to none: Fugaz One is already loosely fitted for a display
 *   face, so the extra air made the name read as spaced-out rather than set.
 *   GamesStrip runs the same face at +0.04em, but three-letter team codes are
 *   a different job from a ten-letter name
 * - uppercase: a condensed display face is strongest in caps, where its
 *   flat sides and tight fit do the work. Applies to "My Account" too, since
 *   it spreads this object
 */
/**
 * Optical centring correction, in em. Nudges the type down so the *caps* sit on
 * the vertical centre rather than the line box.
 *
 * `align-items: center` centres the inline box, which is built from the face's
 * ascent and descent, so the baseline lands at (ascent - descent) / 2 below the
 * centre. The lockup is set in caps, whose ink centre is capHeight / 2 above the
 * baseline. The gap between those two is the correction:
 *
 *     capHeight / 2 - (ascent - descent) / 2
 *
 * Cap height and not x-height, even though the word is now sentence case: the
 * eye centres a word on its capital, and the descender on the g is ignored the
 * same way the one on "My Account"'s y is.
 *
 * MEASURE the three values, do not read them off the font's tables. Under Fugaz
 * One this was 0.048, taken from that face's nominal 1046 / 422 / 720 against a
 * 1000 upm, and it was wrong — Chrome did not lay the face out on those numbers.
 * Measuring in the browser gave a `normal` line-height box of 1.4835em against
 * the 1.468em they imply, (ascent - descent) of 0.6027em against 0.624em, and a
 * cap height of 0.723em from an 8x raster scan, putting the real correction at
 * 0.3615 - 0.3014 = 0.060em.
 *
 * The measurement is easy to repeat, and it is the reason this reads 0 today.
 * `align-items: center` makes the shift cancel out of the box algebra, so an
 * unshifted baseline measured against the bar centre yields (ascent - descent)
 * / 2 on its own; a raster scan of the caps yields capHeight; subtract.
 *
 * ZERO IS A PLACEHOLDER, NOT A MEASUREMENT. Inter Tight's metrics have not been
 * measured in the browser, and Fugaz One's 0.060 is meaningless for a different
 * face, so carrying it over would have been worse than no correction at all.
 * Inter's vertical metrics are drawn to centre well unaided, so 0 should be
 * close — but "should be close" is exactly the guess the 0.048 above was, and
 * that one was out by 25%.
 *
 * Applied as `position: relative; top`, not a margin: a margin would change the
 * box the parent is centring and so only move the type half as far.
 *
 * This gets the *layout* right. Landing it on a device pixel is the other half,
 * and that is BAR_H in TopBar — which was picked for Fugaz One's ideal baseline
 * and wants re-checking against this face too. See the note there.
 *
 * FACE-SPECIFIC, like WORDMARK_FONT_RATIO. Re-measure if the font changes.
 */
const OPTICAL_SHIFT_EM = 0;

export const WORDMARK_TEXT: CSSProperties = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  // 500, not 400 — see the note above. The design system's ceiling; do not
  // reach past it for 600+ if the name still reads light, raise
  // WORDMARK_FONT_RATIO instead. Hierarchy here is size, not weight.
  fontWeight: 500,
  // Normal, and stated rather than omitted: letter-spacing inherits, so leaving
  // it out would let whatever a parent happens to set leak into an object that
  // is spread into several different places.
  //
  // The -0.01em it replaces came in with Fugaz One, whose caps needed pulling
  // together. It does not transfer: Inter Tight is spaced for running text at
  // this size already, and the design system reserves tight tracking for large
  // display type — the bar is 13–14px, the opposite end of that range.
  letterSpacing: "normal",
  textTransform: "none",
  // Explicit, and not inherited, because this object is spread onto elements
  // sitting in two very different boxes: the lockup row below, which sets
  // line-height 1 so its height equals the `height` prop, and TopBar's bare
  // <button>, which is left at `normal`. Line-height was the one property the
  // shared style did not carry, so "the same type treatment" rendered two
  // different boxes — and `align-items: center` centres the *box*, so the two
  // baselines landed 0.469px apart in the utility bar. Measured, not
  // guessed: the lockup's box was 14.002px tall against the button's 20.769px.
  //
  // It moved the skew as well. transformOrigin is `left bottom`, which is the
  // box bottom and not the baseline, so a shorter box put the pivot nearer the
  // caps and sheared them less far left. Equal boxes fix both at once.
  //
  // `normal` specifically, rather than a number: OPTICAL_SHIFT_EM below is
  // derived assuming half-leading is zero, which is only true when the box is
  // exactly the font's ascent + descent. A numeric line-height would silently
  // invalidate that constant.
  lineHeight: "normal",
  // Kept inline-block now that there is no transform to enable: it gives the
  // same box in the lockup's flex row and in TopBar's <button>, which is the
  // whole point of this object being shared.
  display: "inline-block",
  position: "relative",
  top: `${OPTICAL_SHIFT_EM}em`,
  whiteSpace: "nowrap",
};

export default function LogoWordmark({
  height = 28,
  bare = false,
}: {
  /** Height of the mark. The type is sized from it, so this sizes the lockup. */
  height?: number;
  /**
   * Drop the mark's accent tile and draw the whole lockup — head and name — in
   * `currentColor`, so the parent decides. The same escape hatch <Logo> has,
   * extended to the type beside it: without it the lockup could not sit on the
   * dark footer, where near-black text on near-black would vanish and a filled
   * accent tile would read as a sticker stuck on the bar.
   */
  bare?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: height * GAP_RATIO,
        lineHeight: 1,
        // Untiled, everything inherits. Tiled, the name takes --text: the mark
        // is carrying the accent already, and a second accent element would
        // leave the lockup with no anchor.
        ...(bare ? null : { color: "var(--text)" }),
      }}
    >
      <span aria-hidden="true" style={{ display: "flex" }}>
        <Logo size={height} bare={bare} />
      </span>
      <span
        style={{ ...WORDMARK_TEXT, fontSize: height * WORDMARK_FONT_RATIO }}
      >
        Wagerwolf
      </span>
    </span>
  );
}
