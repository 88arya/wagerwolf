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
 * Fugaz One, not the UI's Inter Tight — loaded in app/layout.tsx as
 * --font-fugaz-one. Settled on after Poppins, Lexend Deca, Viga, Anton and
 * Passion One, and the only candidate already in the bundle: GamesStrip sets
 * team abbreviations in it, so the lockup costs no font fetch of its own.
 *
 * Set in caps, which is what changed the verdict — its lowercase has
 * brush-derived terminals that read as informal across ten letters, but the
 * uppercase is square and holds up.
 *
 * Weight 400 and no choice about it: a single-face display font, so there is no
 * 500 to reach for. That satisfies the design system's 400–500 cap numerically
 * but not visually; its strokes are heavy for a 400, which is what a display
 * face is for.
 *
 * Note the wordmark and the games-strip abbreviations now share a face — the
 * strip runs it obliqued forward at +0.04em, the lockup backslanted via
 * skewX at +0.03em.
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
 * How far the name leans, in degrees. Positive is a backslant — the letters
 * lean left, against the reading direction. Negative leans forward.
 *
 * NOTE THE MECHANISM: this is `transform: skewX`, not `font-style: oblique`.
 * Oblique was tried first and cannot do this. Chrome clamps a *negative*
 * synthesised oblique to zero, so `oblique -25deg` rendered pixel-identical to
 * `normal` — verified by diffing screenshots of the two. Positive oblique works
 * fine; there is simply no backslant on that property for a font with no italic
 * cut, and Fugaz One has none.
 *
 * skewX honours both signs. The sign convention is inverted relative to
 * oblique — `oblique N` is equivalent to `skewX(-N)` — so positive here leans
 * back. GamesStrip slants team abbreviations forward with `oblique 12deg`;
 * this is its mirror.
 *
 * Note also that Fugaz One is *drawn* with a forward lean, so 0 here is not
 * upright — it is the face's own slant, and a backslant has to overcome that
 * before it reads as leaning back at all.
 */
export const SLANT_DEG = 10;

/**
 * Optical centring correction, in em. Nudges the type down so the *caps* sit on
 * the vertical centre rather than the line box.
 *
 * `align-items: center` centres the inline box, and that box is built from the
 * face's ascent and descent — 1046 and 422 against a 1000 upm for Fugaz One, so
 * its centre lands 312 units above the baseline. The lockup is set in caps, and
 * caps run baseline to cap height (720), so the *ink* centre is at 360. The
 * text therefore renders 48 units — 0.048em — above where it looks like it
 * should, which reads as too much space beneath it in the 37px utility bar.
 *
 * Applied as `position: relative; top`, not a margin or a transform: a margin
 * would change the box the parent is centring and only move it half as far, and
 * the transform slot is already taken by the skew.
 *
 * FACE-SPECIFIC, like WORDMARK_FONT_RATIO. Re-derive as
 * (ascent - descent) / 2 - capHeight / 2, over upm, if the font changes.
 */
const OPTICAL_SHIFT_EM = 0.048;

export const WORDMARK_TEXT: CSSProperties = {
  fontFamily: "var(--font-fugaz-one), var(--font-sans), system-ui, sans-serif",
  fontWeight: 400,
  letterSpacing: "-0.01em",
  textTransform: "uppercase",
  // inline-block so the transform applies; the lockup's flex container would
  // blockify this anyway, but "My Account" spreads the same object.
  display: "inline-block",
  transform: `skewX(${SLANT_DEG}deg)`,
  // Pivot at the baseline rather than the centre (the default). A drawn italic
  // leans from its baseline; shearing about the middle swings the bottom of the
  // word one way and the top the other, sliding it sideways in its own box.
  transformOrigin: "left bottom",
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
