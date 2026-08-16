// STALE — this spells "wager", the pre-rename name. The product is Wagerwolf,
// so this lockup is wrong wherever it renders (currently the landing-page
// footer, app/page.tsx). Either redraw it for the new name or drop it in favour
// of <Logo> plus a text label, as the landing-page header already does.
//
// Wordmark (test version) — five bet slips, one letter each, spelling "wager".
// An alternative to components/Logo.tsx, which carries the current mark.
//
// Unlike Logo, this is a wide lockup rather than a square tile: five slips with
// legible letters can't fit a 24px square, where each letter would land around
// 2px. Sized by height, with the width derived from the artwork's ratio.
//
// The slips are blue with white letters rather than white paper on a blue field.
// White slips need either a containing blue band — which boxes the set in and
// kills the scattered feel — or a hairline border, which disappears by 20px.
// Blue slips carry themselves on any background.

// [centreX, centreY, rotation] — vertical scatter and alternating tilt so the
// set reads as slips that have fallen into place rather than a tidy row.
const SLIPS: Array<[number, number, number]> = [
  [13, 15, -7],
  [35, 13.5, 5],
  [57, 16, -4],
  [79, 13.5, 7],
  [101, 15, -6],
];

const LETTERS = ["w", "a", "g", "e", "r"];

// Slip size and the artwork box. Spacing is 22 against a 17-wide slip: the gap
// has to survive the rotation, and at 20 the corners collided.
const SLIP_W = 17;
const SLIP_H = 23;
const VIEW_W = 114;
const VIEW_H = 30;

const BLUE = "#2B5DE3";

// Poppins rather than the UI's Inter Tight — a deliberate exception for the
// logo only, loaded in app/layout.tsx as --font-poppins. Its geometric bowls
// fill the slips more evenly, and its larger x-height means 15 does the job
// where Inter Tight needed 16 (at 16 the Poppins "g" descender crowds the slip's
// bottom edge). Weight 500 keeps to the 400–500 range the design system uses.
const FONT_SIZE = 15;
const FONT_WEIGHT = 500;
const FONT_STACK = "var(--font-poppins), var(--font-sans), system-ui, sans-serif";

export default function LogoWordmark({ height = 28 }: { height?: number }) {
  return (
    <svg
      width={height * (VIEW_W / VIEW_H)}
      height={height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      fill="none"
      role="img"
      aria-label="Wager"
      style={{ flexShrink: 0, display: "block" }}
    >
      {SLIPS.map(([cx, cy, rot], i) => (
        <g key={LETTERS[i]} transform={`rotate(${rot} ${cx} ${cy})`}>
          <rect
            x={cx - SLIP_W / 2}
            y={cy - SLIP_H / 2}
            width={SLIP_W}
            height={SLIP_H}
            rx="1"
            fill={BLUE}
          />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#FFFFFF"
            fontSize={FONT_SIZE}
            fontWeight={FONT_WEIGHT}
            style={{ fontFamily: FONT_STACK }}
          >
            {LETTERS[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
