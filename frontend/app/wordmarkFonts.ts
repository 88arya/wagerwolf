import localFont from "next/font/local";

/**
 * The registry of faces in the running for the wordmark.
 *
 * /logo renders every entry here, stacked, so candidates can be judged against
 * each other rather than one at a time from memory. The list only ever grows —
 * a face that lost is still the reason the next one was tried, and the whole
 * point of the page is seeing them side by side.
 *
 * TO ADD A FACE
 *
 *   1. Drop the files in app/fonts/<name>/ (.woff or .woff2; next/font
 *      self-hosts them, so nothing is fetched from a third party at runtime).
 *   2. Declare it with localFont below, giving it its own `variable`. The call
 *      has to take a literal object — next/font is a build-time transform and
 *      cannot read a value you computed.
 *   3. Add an entry to WORDMARK_FONTS.
 *   4. Add its `.variable` to MOUNTED_CLASSES.
 *
 * A Google face needs no files: import it from next/font/google, give it a
 * `variable`, and do steps 3 and 4.
 *
 * WHAT THE COMPARISON DOES NOT TELL YOU
 *
 * Two constants in LogoWordmark are measured per face and do NOT follow a swap:
 * WORDMARK_FONT_RATIO (how large the name is against the mark) and
 * OPTICAL_SHIFT_EM (how far it is nudged to sit on the mark's centre). Every
 * specimen here is drawn with the values measured for Inter Tight, so a
 * candidate may be sitting slightly high or low through no fault of its own.
 * Judge letterforms, weight and width here; re-measure those two before
 * actually adopting anything.
 */

/**
 * COMMERCIAL FONT — see the licensing note in app/signup/layout.tsx before
 * this reaches production. Not licensed for web embedding as things stand.
 */
export const gilroy = localFont({
  // 600 and 700 are here for the wordmark specimen on /logo, which sets the
  // name heavier than the UI ever does. Declaring a face only emits an
  // @font-face rule — browsers fetch a weight when something actually renders
  // in it — so /signup, which uses 400 and 500, downloads nothing extra.
  src: [
    { path: "./fonts/gilroy/Gilroy-Regular.woff", weight: "400", style: "normal" },
    { path: "./fonts/gilroy/Gilroy-Medium.woff", weight: "500", style: "normal" },
    { path: "./fonts/gilroy/Gilroy-SemiBold.woff", weight: "600", style: "normal" },
    { path: "./fonts/gilroy/Gilroy-Bold.woff", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-gilroy",
  // Real family names: next/font uses these to synthesise a metric-adjusted
  // fallback, so a CSS var here would mean nothing to it.
  fallback: ["Inter Tight", "system-ui", "sans-serif"],
});

/**
 * FREE FOR PERSONAL USE ONLY, as Lemon Milk is normally distributed — the
 * files carry "© 2020 MARSNEV. All rights reserved." and no embedded licence or
 * licence URL. Commercial use, which this is, needs a licence from the designer.
 * Same conclusion as Gilroy, different route to it: Gilroy is a retail font
 * obtained without buying it, this one is a free-for-personal font used
 * commercially. Settle it before either ships.
 *
 * Note it is drawn as an ALL-CAPS display face. The lockup is sentence case, so
 * this specimen is showing the face doing something it was not cut for.
 */
export const lemonMilk = localFont({
  src: [
    { path: "./fonts/lemon-milk/LemonMilk-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/lemon-milk/LemonMilk-Medium.otf", weight: "500", style: "normal" },
    { path: "./fonts/lemon-milk/LemonMilk-Bold.otf", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-lemon-milk",
  fallback: ["Inter Tight", "system-ui", "sans-serif"],
});

/**
 * Arca Majora 3 — Alfredo Marco Pradil / Hanken. Ships only Bold (700) and
 * Heavy (900); there is no regular cut, so 700 is the lightest it goes.
 *
 * The one candidate so far that names its terms: the files carry a licence URL
 * (hanken.co/eula) rather than nothing at all. Read it before shipping — a URL
 * is not the same as a grant.
 *
 * Has a full lowercase alphabet, all 26 glyphs distinct, so it renders the
 * lockup as "Wagerwolf" rather than shouting it.
 */
export const arcaMajora = localFont({
  src: [
    { path: "./fonts/arca-majora/ArcaMajora3-Bold.otf", weight: "700", style: "normal" },
    { path: "./fonts/arca-majora/ArcaMajora3-Heavy.otf", weight: "900", style: "normal" },
  ],
  display: "swap",
  variable: "--font-arca-majora",
  fallback: ["Inter Tight", "system-ui", "sans-serif"],
});

export type WordmarkFont = {
  /** Stable key. Also the anchor id on /logo. */
  id: string;
  label: string;
  /** A complete CSS font-family value, passed straight to LogoWordmark. */
  stack: string;
  /**
   * Weight to draw the name at. Omit to take WORDMARK_TEXT's 500.
   *
   * Per-face because weight is not comparable across families — the number is
   * nominal, and two faces at the same value can sit visibly apart in colour.
   * Matching them by eye is the point of the page, so each candidate carries
   * whatever number makes it look right rather than a shared one.
   *
   * Anything above 500 must be loaded above as well; a weight with no face
   * behind it gets synthesised by the browser into a fake bold.
   */
  weight?: number;
  /** One line on where it came from or why it is here. */
  note: string;
  /**
   * A hard limitation of the face, rendered as a warning on the specimen rather
   * than buried in `note`. For things that make a candidate unusable as drawn,
   * not for opinions about it.
   */
  warn?: string;
  /**
   * Re-case the drawn name. The markup still says "Wagerwolf" — text-transform
   * is paint-only — so this changes how the lockup LOOKS without changing what
   * is copied, searched or read aloud.
   */
  transform?: "lowercase" | "uppercase";
  /**
   * Mark-to-name alignment in the side-by-side arrangements. See the `align`
   * prop on LogoWordmark — `baseline` sits the mark's bottom on the text
   * baseline so descenders hang past it.
   */
  align?: "center" | "baseline";
  /**
   * Size the mark from the type rather than from `height` — mark height becomes
   * fontSize × markScale, width follows the ink's aspect. Use the face's own
   * sCapHeight ÷ unitsPerEm; see the prop of the same name on LogoWordmark.
   */
  markScale?: number;
  /**
   * Also print all 32 NFL team abbreviations in this face on /logo.
   *
   * A different job from the wordmark: the games strip sets three-letter team
   * codes, always caps, at 12px — see [GamesStrip TEAM_ABBR]. A face can be
   * wrong for a ten-letter name and right for that, which is exactly the case
   * with an all-caps display cut.
   */
  teamAbbrevs?: boolean;
};

export const WORDMARK_FONTS: WordmarkFont[] = [
  {
    id: "gilroy",
    label: "Gilroy",
    stack: "var(--font-gilroy), system-ui, sans-serif",
    // 600 rather than the 500 everything else uses. Gilroy's Medium reads
    // lighter than Inter Tight's at the same nominal number, so matching the
    // numbers left the name looking thin against the mark. 700 is loaded too,
    // if this still is not enough.
    weight: 600,
    note:
      "Geometric sans, currently used on /signup. Drawn at 600 — its 500 reads " +
      "lighter than Inter Tight's. Commercial licence not held; see the note in " +
      "app/signup/layout.tsx.",
  },
  {
    id: "lemon-milk",
    label: "Lemon Milk",
    stack: "var(--font-lemon-milk), system-ui, sans-serif",
    weight: 500,
    note:
      "Geometric display face. 700 is loaded if 500 reads light. Free for " +
      "personal use only; commercial use needs a licence. Caps-only makes it " +
      "useless for the wordmark but worth a look for the games strip's team " +
      "codes, which are caps by nature — hence the abbreviation sheet below.",
    teamAbbrevs: true,
    // Verified by reading the cmap, not by looking at it: in all three weights,
    // 25 of the 26 lowercase codepoints resolve to the SAME glyph id as their
    // capital (a→gid 2 = A→gid 2, w→104 = W→104, and so on). Only `i` has a
    // glyph of its own. "Wagerwolf" contains no `i`, so every letter of it is a
    // capital. No CSS reaches this — textTransform: none is already set; the
    // lowercase letterforms are simply not in the file.
    warn:
      "Cannot render sentence case. This face has no lowercase letterforms — " +
      "every lowercase codepoint maps to the capital glyph, so the name can only " +
      "ever be WAGERWOLF here.",
  },
  {
    id: "arca-majora-lower",
    label: "Arca Majora 3 — all lowercase",
    stack: "var(--font-arca-majora), system-ui, sans-serif",
    weight: 700,
    transform: "lowercase",
    // Mark bottom on the baseline, not the line box. "wagerwolf" has a
    // descender on the g, and centring on the full line box floats the mark
    // about half a descender high against the letters that matter — a, e, o,
    // r, w — which all stand on the baseline.
    align: "baseline",
    // Arca Majora 3: sCapHeight 770 / unitsPerEm 1000. Baseline-to-cap is what
    // reads as the height of the word, so matching the mark to it makes the two
    // the same height rather than two things that happen to sit side by side.
    // Not its hhea ascender (900) — that reserves space for diacritics, and
    // "wagerwolf" has none.
    markScale: 0.77,
    note:
      "Candidate 04 with the capital dropped: wagerwolf, not Wagerwolf. Mark is " +
      "baseline-aligned, so the g hangs below it rather than dragging it down. Only " +
      "worth trying on a face with real lowercase forms, which this one has — " +
      "the round a, e and o carry the geometry the caps state more loudly. The " +
      "markup is unchanged; only the paint is lowercased.",
  },
];

/**
 * Every locally-hosted face's variable class, mounted together by /logo's
 * layout so all the specimens resolve on one page. Faces loaded from
 * next/font/google go here too — they expose `.variable` the same way.
 */
export const MOUNTED_CLASSES = [gilroy.variable, lemonMilk.variable, arcaMajora.variable].join(" ");
