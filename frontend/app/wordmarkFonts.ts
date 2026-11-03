import localFont from "next/font/local";

export const gilroy = localFont({
  src: [
    { path: "./fonts/gilroy/Gilroy-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/gilroy/Gilroy-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/gilroy/Gilroy-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/gilroy/Gilroy-Bold.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-gilroy",
  fallback: ["Inter Tight", "system-ui", "sans-serif"],
});

// Lemon Milk is a /logo-only candidate and lives in app/logo/lemonMilk.ts: a font
// defined in a module the root layout imports is preloaded on every route.

// ArcaMajora3-Bold.otf stays beside the woff2: app/logo/lockup.png renders
// through Satori, which cannot read woff2.
export const arcaMajora = localFont({
  src: [
    { path: "./fonts/arca-majora/ArcaMajora3-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/arca-majora/ArcaMajora3-Heavy.woff2", weight: "900", style: "normal" },
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
  weight?: number;
  /** One line on where it came from or why it is here. */
  note: string;
  warn?: string;
  transform?: "lowercase" | "uppercase";
  align?: "center" | "baseline";
  markScale?: number;
  teamAbbrevs?: boolean;
};

export const WORDMARK_FONTS: WordmarkFont[] = [
  {
    id: "gilroy",
    label: "Gilroy",
    stack: "var(--font-gilroy), system-ui, sans-serif",
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
    align: "baseline",
    markScale: 0.77,
    note:
      "Candidate 04 with the capital dropped: wagerwolf, not Wagerwolf. Mark is " +
      "baseline-aligned, so the g hangs below it rather than dragging it down. Only " +
      "worth trying on a face with real lowercase forms, which this one has — " +
      "the round a, e and o carry the geometry the caps state more loudly. The " +
      "markup is unchanged; only the paint is lowercased.",
  },
];

