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
 * should be searchable and read aloud as one — and it means the lockup needs no
 * re-cutting if the product name ever changes again. The mark beside it is
 * hidden from assistive tech (aria-hidden on its wrapper) so the pair announces
 * once, not twice.
 *
 * It is NOT selectable, though — see the user-select note on the container.
 * That used to be listed here as a reason for real text, which conflated two
 * different things: being *text* is what buys search, screen readers and a
 * cheap rename, and none of those need a drag-select to work.
 *
 * Inter Tight, the UI face — --font-sans, loaded in app/layout.tsx. The lockup
 * went Poppins → Lexend Deca → Viga → Anton → Passion One → Fugaz One and now
 * lands on the face the rest of the app is already set in, which is the one
 * option that costs nothing to load and cannot drift away from the UI.
 *
 * Set in sentence case, not caps.
 *
 * TWO VARIANTS, and they differ only in ground:
 *   • default — mark and name share ONE accent panel and one white foreground.
 *     Previously the head sat in its own accent square and the name was set in
 *     --text beside it, so the two halves of a single lockup stood on different
 *     grounds in different colours and read as one object only because they
 *     were adjacent. One panel, one colour.
 *   • `bare` — no panel at all; both halves take currentColor, and the parent
 *     decides. What TopBar, SiteFooter and /signup use, because those surfaces
 *     already carry a ground of their own and a filled block on top of one
 *     reads as a sticker.
 *
 * The mark is drawn `bare` in both cases — Logo's own tile would be a filled
 * square inside a filled panel. See MARK_RATIO for how the panel reproduces the
 * padding that tile used to supply.
 *
 * Fugaz One is no longer used ANYWHERE. It stopped being the wordmark's face,
 * and on 22 Aug 2026 GamesStrip's team abbreviations moved to Lemon Milk too,
 * so --font-fugaz-one is still loaded in layout.tsx with nothing consuming it.
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

/**
 * Space between mark and name, as a fraction of THE MARK'S DRAWN SIZE — not of
 * `height`.
 *
 * That distinction matters since the panel variant arrived. It draws the head
 * at height × MARK_RATIO (0.731) so the panel's padding can supply the rest,
 * but the gap was still keyed to the full height — so the mark shrank by 27%
 * while the space beside it did not, and the name drifted away from the wolf.
 * Keying it to the mark means the gap tracks whatever is actually sitting next
 * to it, in both variants.
 *
 * 0.30, down from the 0.34 inherited from the landing header's hand-tuned
 * pairing (a 1.05rem label beside a 24px mark at a 9px gap). That value was set
 * when the mark carried its own tile, which contributed ~0.134 × height of
 * internal padding on its right edge — so the apparent gap was always well
 * wider than the number suggested. The tile is gone from the lockup, and the
 * number had to come down to match what it used to look like.
 *
 * Applies to BOTH variants, so this moves the utility bar and the footer too.
 */
const GAP_RATIO = 0.3;

/**
 * The head's share of the mark's 100-unit artboard.
 *
 * Logo's tiled variant draws a full-bleed 100×100 accent square with the head
 * sitting inside it at bbox 13.37–86.47, so the head occupies 73.1 units and
 * the tile supplies the remaining 26.9 as padding. The bare variant crops to
 * MARK_VIEWBOX, i.e. to the head itself, so a bare mark at size N is visually
 * BIGGER than a tiled one at the same N.
 *
 * The panel below rebuilds that relationship by hand: it draws the mark bare at
 * `height × MARK_RATIO` and pads back the difference, so `height` keeps meaning
 * the height of the whole block — the same thing it meant when the block was
 * just the tile.
 *
 * 0.721 is the ink's own height as a fraction of the 100-unit artboard
 * (14.00 -> 86.10). It was 0.731 while the bare crop was squared off at
 * 73.1 x 73.1, because `size` then meant the height of that padded box rather
 * than of the paint inside it. The crop is exact now, so `size` IS the ink
 * height and this is the real number. Derived from the path, not guessed.
 */
const MARK_RATIO = 0.721;
/** Half the leftover, so the head sits in the panel exactly as it sat in the tile. */
const PANEL_PAD_RATIO = (1 - MARK_RATIO) / 2;

/**
 * How much of the horizontal gap the stacked arrangement keeps.
 *
 * Vertical space reads wider than the identical number set horizontally: side
 * by side, the mark and the name brace the gap and give the eye its scale,
 * whereas stacked there is nothing flanking it. 0.7 is a starting point, not a
 * measurement — tune it against the specimen on /logo.
 */
const STACKED_GAP_SCALE = 0.7;

/**
 * Arca Majora 3's cap height: sCapHeight 770 / unitsPerEm 1000, read from the
 * face's own OS/2 table. The mark is drawn at fontSize x this, so its height
 * equals the height of the word and the two read as one object.
 *
 * NOT the hhea ascender (900), which reserves room for diacritics that
 * "wagerwolf" never uses and would leave the mark ~17% too tall.
 *
 * Face-specific. Re-read it from the new font if the wordmark's face changes.
 */
const WORDMARK_CAP_RATIO = 0.77;

/**
 * Drops the whole lockup so its INK centres, not its box.
 *
 * `align-items: center` on the bar centres the lockup's box. That box is not
 * symmetric about what you actually see: it reserves the face's full ascent
 * above the baseline (0.900em) and full descent below it (0.260em), while the
 * ink — the mark, and the letters from ascender down to baseline — occupies
 * only capHeight (0.770em) and stops AT the baseline, because the mark's bottom
 * sits on it. So the box holds 1.82px of dead air above the ink and 3.64px
 * below, at the bar's 14px, and centring it leaves the lockup reading ~0.9px
 * high.
 *
 *     shift = capHeight / 2 - (ascent - descent) / 2
 *           = 0.385 - 0.320 = 0.065em
 *
 * Arca Majora 3, from its own OS/2 and hhea tables: cap 770, ascent 900,
 * descent 260, upem 1000.
 *
 * APPLIED TO THE CONTAINER, not to the text. It used to live in WORDMARK_TEXT
 * as OPTICAL_SHIFT_EM, which was right when the mark was centred on the text's
 * line box — moving the text moved it relative to a mark that was not tracking
 * it. It is wrong now: the mark is baseline-aligned to the text, `position:
 * relative` is paint-only so it does not move the baseline flexbox aligns on,
 * and a text-only shift would slide the letters off the mark. Shifting the
 * whole lockup keeps the pair rigid.
 *
 * FROM NOMINAL METRICS, NOT MEASURED. The note on OPTICAL_SHIFT_EM below is the
 * warning that matters here: Fugaz One's nominal tables were out by 25% against
 * what Chrome actually laid out. Verify this in a browser before trusting it.
 */
const LOCKUP_INK_SHIFT_EM = 0.065;

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
  // Arca Majora 3, mounted globally in app/layout.tsx because the lockup shows
  // up on every route. Falls back to the UI face rather than a system default,
  // so a failed fetch degrades to the rest of the app.
  fontFamily: "var(--font-arca-majora), var(--font-sans), system-ui, sans-serif",
  // 700 — Bold, and the LIGHTEST cut Arca Majora ships (the only other is Heavy
  // 900). The design system's 400-500 ceiling governs UI text and does not
  // reach here: this is a logo, set in a display face that has no 500.
  fontWeight: 700,
  // Normal, and stated rather than omitted: letter-spacing inherits, so leaving
  // it out would let whatever a parent happens to set leak into an object that
  // is spread into several different places.
  //
  // The -0.01em it replaces came in with Fugaz One, whose caps needed pulling
  // together. It does not transfer: Inter Tight is spaced for running text at
  // this size already, and the design system reserves tight tracking for large
  // display type — the bar is 13–14px, the opposite end of that range.
  letterSpacing: "normal",
  // Lowercase, and paint-only: the markup still reads "Wagerwolf", so the name
  // stays copyable, searchable and correctly announced while drawing as
  // "wagerwolf".
  textTransform: "lowercase",
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
  fontFamily,
  fontWeight,
  layout = "mark-right",
  textTransform,
  align = "baseline",
  markScale = WORDMARK_CAP_RATIO,
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
  /**
   * Draw the name in a different face. FOR THE /logo SPECIMEN PAGE ONLY —
   * everywhere in the app proper leaves this alone, so there is one lockup and
   * it cannot drift.
   *
   * It has to be a prop rather than inherited CSS because WORDMARK_TEXT sets
   * fontFamily inline, and an inline style beats any rule a parent could write.
   *
   * Two things this does NOT adjust, both measured against Inter Tight:
   * WORDMARK_FONT_RATIO and OPTICAL_SHIFT_EM. A swapped face is therefore
   * sized and centred on another font's metrics and may sit high, low, or a
   * shade too large. That is fine for comparing letterforms and inevitable for
   * a preview — but re-measure both before adopting anything.
   */
  fontFamily?: string;
  /**
   * Draw the name at a different weight. FOR THE /logo SPECIMEN PAGE ONLY,
   * same as `fontFamily`.
   *
   * Needed because weight is not comparable between families: the number is
   * nominal, so two faces set at 500 can sit visibly apart in colour, and a
   * candidate can only be judged against the mark at whatever weight actually
   * matches it. The app's own lockup stays at WORDMARK_TEXT's 500 — the design
   * system's ceiling — and this does not move it.
   *
   * The weight must be one the face actually ships and next/font actually
   * loaded, or the browser synthesises a fake bold and the specimen is a
   * drawing of something that does not exist.
   */
  fontWeight?: number;
  /**
   * Where the mark sits relative to the name.
   *
   *   mark-left   the original, and what every surface in the app uses
   *   mark-right  mirrored — the name reads first, the mark closes it
   *   mark-top    stacked and centred, for square-ish spaces
   *
   * `height` means the same thing in all three: it sizes the mark and, through
   * WORDMARK_FONT_RATIO, the name. What changes is the block those two make —
   * mark-top is roughly twice as tall and much narrower, so it is NOT a drop-in
   * for a 40px utility bar. Size it by the space it is going into.
   */
  layout?: "mark-left" | "mark-right" | "mark-top";
  /**
   * Re-case the name. FOR THE /logo SPECIMEN PAGE ONLY, like `fontFamily` and
   * `fontWeight` — WORDMARK_TEXT pins `none`, and the app's lockup stays
   * sentence case.
   *
   * The markup still reads "Wagerwolf" whatever this says: text-transform is a
   * paint-time rule, so the name is copied, searched and announced with its
   * capital intact no matter how it is drawn. That is the reason to do it here
   * rather than by writing a different string.
   *
   * `uppercase` cannot rescue a face with no lowercase — see the Lemon Milk
   * note in wordmarkFonts.ts. It is the other direction that is interesting:
   * `lowercase` on a face with real lowercase forms.
   */
  textTransform?: "none" | "lowercase" | "uppercase";
  /**
   * How the mark lines up with the name, in the side-by-side arrangements.
   *
   *   center    (default) the mark is centred on the name's LINE BOX — the full
   *             ascender-to-descender span. Correct for sentence case, where
   *             the capital anchors the left edge.
   *   baseline  the mark's bottom edge sits on the text BASELINE, the line a, c,
   *             e and o stand on. Descenders — g, j, p, y — then hang below the
   *             mark instead of pulling it down with them.
   *
   * The difference only shows on a word with descenders, which is why it turns
   * up on the lowercase candidates: "wagerwolf" has a g, so centring on the line
   * box floats the mark roughly half a descender high.
   *
   * Implemented as `align-items: baseline`. A flex item with no text of its own
   * — the mark's wrapper — synthesises its baseline from its bottom margin
   * edge, so aligning baselines puts the mark's bottom on the text's. No
   * per-face descender measurement needed, which matters because that would be
   * a different number for every candidate.
   *
   * Ignored by `mark-top`, where align-items governs horizontal centring
   * instead and baseline would knock the stack off centre.
   */
  align?: "center" | "baseline";
  /**
   * Size the mark from the TEXT instead of from `height`: the mark's height
   * becomes fontSize × markScale, and its width follows MARK_ASPECT, so it
   * scales proportionally and never distorts.
   *
   * The number is a font metric, in em. For a baseline-aligned lockup the
   * useful one is baseline-to-cap/ascender, which is what the eye reads as the
   * height of the word. Read it out of the face's own OS/2 table (sCapHeight ÷
   * unitsPerEm) rather than eyeballing it — Arca Majora 3 is 770/1000 = 0.77,
   * where its hhea ascender of 900 would be wrong because that includes room
   * for diacritics no letter in "wagerwolf" uses.
   *
   * FOR THE /logo SPECIMEN PAGE ONLY, and per-face by necessity: 0.77 is Arca
   * Majora's number and means nothing for any other family.
   */
  markScale?: number | null;
}) {
  // The mark is drawn bare in BOTH variants now. Tiled, the tile has grown to
  // span the whole lockup, so a second filled square around just the head would
  // be a block inside a block.
  const fontSize = height * WORDMARK_FONT_RATIO;
  // markScale ties the mark to the type; without it the mark is sized from
  // `height` and the type from it separately, so the two only ever agree by
  // coincidence.
  const markSize =
    markScale != null ? fontSize * markScale : bare ? height : height * MARK_RATIO;
  const stacked = layout === "mark-top";

  return (
    <span
      style={{
        display: "inline-flex",
        // row-reverse rather than reordering the markup: the mark stays first
        // in the DOM, which is where its aria-hidden wrapper belongs, and only
        // the paint order changes.
        flexDirection: stacked ? "column" : layout === "mark-right" ? "row-reverse" : "row",
        // Stacked, this axis is the horizontal one and must stay centred.
        alignItems: !stacked && align === "baseline" ? "baseline" : "center",
        // Stacked wants less air than side-by-side — vertical space between a
        // mark and the word under it reads wider than the same number does
        // horizontally, because nothing sits beside it to measure against.
        gap: markSize * GAP_RATIO * (stacked ? STACKED_GAP_SCALE : 1),
        lineHeight: 1,
        // Paint-only, so the lockup's box and everything laid out around it are
        // untouched — only what you see moves. See LOCKUP_INK_SHIFT_EM.
        position: "relative",
        top: fontSize * LOCKUP_INK_SHIFT_EM,
        // The lockup is a mark, not a passage of text, and dragging across the
        // nav used to highlight it letter by letter — a blue-flooded "Wagerwolf"
        // mid-drag, which reads as the page coming apart. Browsers exclude
        // user-select: none content from the selection AND from what a copy
        // yields, including Ctrl+A, so a drag over the bar now selects the page
        // without picking up the logo on its way past.
        //
        // NOT the same as outlining the name to SVG paths, which was the other
        // way to stop this. The letters stay real text, so the name is still
        // found by in-page search, still announced by a screen reader, and
        // still one string to change if the product is ever renamed. Outlining
        // would have traded all three away to fix a highlight.
        //
        // ON THE CONTAINER, so it covers the mark's wrapper too — the <svg>
        // does not take a text selection itself, but a drag that starts on it
        // would otherwise still anchor a selection that runs into the name.
        //
        // The -webkit- copy is for Safari before 16.4, which shipped the
        // unprefixed property in March 2023. Inline styles never reach PostCSS,
        // so autoprefixer cannot add it the way it does for globals.css — the
        // other inline userSelect call sites in this app (GamesStrip,
        // LeagueNav) are missing it for exactly that reason.
        WebkitUserSelect: "none",
        userSelect: "none",
        // Bare: everything inherits, and the parent decides.
        //
        // Tiled: ONE background behind mark and name together, and one colour
        // for both. It used to be a square accent tile around the head with the
        // name set in --text beside it, which meant the two halves of a single
        // lockup sat on different grounds in different colours and only read as
        // one object because they were adjacent. The panel is the same accent
        // the tile was, so the mark is unchanged in spirit — the name simply
        // moved inside it.
        ...(bare
          ? null
          : {
              background: "var(--accent)",
              color: "#FFFFFF",
              padding: `${height * PANEL_PAD_RATIO}px ${height * PANEL_PAD_RATIO * 1.6}px`,
            }),
      }}
    >
      <span aria-hidden="true" style={{ display: "flex" }}>
        <Logo size={markSize} bare />
      </span>
      <span
        style={{
          ...WORDMARK_TEXT,
          fontSize,
          ...(fontFamily ? { fontFamily } : null),
          ...(fontWeight ? { fontWeight } : null),
          ...(textTransform ? { textTransform } : null),
        }}
      >
        Wagerwolf
      </span>
    </span>
  );
}
