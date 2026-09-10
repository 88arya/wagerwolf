// Wagerwolf mark — accent tile with the white wolf head.
//
// Merged into a single path: the eyes are holes punched out of the outer
// contour via fill-rule="evenodd", not accent-coloured shapes painted on top.
// That is what lets the mark sit on any surface — the holes show whatever is
// behind them, so the same path works on the accent tile here and on white or
// near-black elsewhere. Splitting it back into stacked shapes would re-break
// that, so keep it one path.
//
// The mark never reaches the tile edge (bbox 20.6–79.2 x, 14.0–86.1 y), so
// nothing needs clipping — which is why this no longer carries the
// per-instance clipPath id the previous slips mark required.

// 100-unit viewBox. Three subpaths: outer contour, then the two eyes.
const MARK =
  "M25.4 14.04C25.64 14.17 29.21 19.1 29.69 19.74L36.59 29.1L40.75 34.76C41.49 35.77 42.39 36.92 43.09 37.96C43.79 37.21 44.52 36.28 45.19 35.49C46.78 33.64 48.33 31.72 49.97 29.92C52.29 32.46 54.55 35.48 56.87 37.96C57.39 37.14 58.28 35.98 58.88 35.16L62.69 29.93L74.26 14C74.47 16.27 74.58 18.8 74.74 21.1L75.63 34.59C75.85 38 76.04 41.57 76.32 44.96C75.35 45.89 74.16 47.22 73.21 48.23C73.79 48.93 74.86 50.6 75.4 51.4C76.67 53.27 78.01 55.19 79.23 57.09C77.61 57.09 75.91 57 74.28 56.96C75.61 59.26 77.07 61.53 78.37 63.83C76.89 63.7 75.4 63.52 73.92 63.41C73.28 64.22 72.54 65.06 71.88 65.86L67.25 71.48L65.31 73.85C65.21 72.66 64.98 71.1 64.82 69.89C62.98 73.23 60.85 76.44 59.05 79.82C58.5 80.85 57.9 81.99 57.3 83C55.41 84.02 52.96 85.15 51.01 86.08C51.05 85.23 51.24 83.9 51.36 83.03C52.37 82.33 53.81 81.46 54.73 80.65C55.09 80.07 55.06 78.81 55.06 78.17C55.06 77.57 54.44 77.38 53.98 77.39C51.67 77.47 49.38 77.55 47.06 77.42C46.47 77.39 45.31 77.26 44.94 77.76C44.65 78.17 44.85 80.41 45.16 80.67C46.11 81.47 47.49 82.34 48.53 83.04C48.63 84.06 48.76 85.08 48.9 86.1C46.81 85.05 44.65 84.06 42.55 83L35.04 69.92C34.82 71.2 34.68 72.53 34.53 73.82C34.18 73.42 33.83 73 33.5 72.59C31.01 69.5 28.4 66.49 25.92 63.4C24.44 63.53 22.96 63.71 21.46 63.83L23.92 59.72C24.46 58.83 25.05 57.88 25.53 56.96C23.9 57 22.24 57.08 20.61 57.09L26.65 48.29C25.73 47.26 24.4 46 23.4 44.96C23.46 44.44 23.48 43.73 23.52 43.19L23.74 39.76L24.43 28.91L25.12 18.51C25.22 17.06 25.36 15.48 25.4 14.04ZM67.4 53.42L67.43 53.45C67.29 53.97 64.97 56.54 64.61 57.14C64.12 58.07 63.86 59.12 63.43 60.09C63.11 60.78 62.56 60.9 61.9 61.16C60.72 61.61 59.52 62.04 58.33 62.47C57.57 63.63 56.72 65.39 56.06 66.67C55.98 66.41 56 64.62 56 64.21L55.97 59.54C57.81 59.23 58.73 58.76 60.2 57.61C62.46 55.83 64.81 54.65 67.4 53.42ZM32.37 53.4C32.83 53.56 33.4 53.88 33.85 54.08C35.88 55.02 37.83 56.24 39.62 57.58C41.2 58.76 41.95 59.17 43.88 59.54C43.85 61.9 43.84 64.26 43.85 66.61L43.76 66.6C43.03 65.17 42.35 63.87 41.56 62.48C40.27 62.05 39.01 61.54 37.73 61.07C36.87 60.75 36.69 60.7 36.32 59.83C35.96 58.96 35.71 58.01 35.28 57.18C35.07 56.77 34.47 56.22 34.2 55.82C33.52 55 32.97 54.28 32.37 53.4Z";

// The mark's EXACT ink bounding box — every edge touches paint.
//
// Computed by flattening the path's cubics at 1000 steps per segment, not read
// off a design tool: x 20.61 -> 79.23, y 14.00 -> 86.10. The old value squared
// that off to 73.1 x 73.1 and centred the ink inside it, which baked in 14.48
// units of horizontal padding (19.8% of the box) and 1 unit vertically.
//
// The vertical unit was the one that mattered: with the ink floating a unit
// above the box's bottom edge, baseline-aligning the lockup put the BOX on the
// text baseline and left the wolf hovering above it. Now the two coincide.
//
// Because the box is no longer square, the bare variant sizes width from
// MARK_ASPECT rather than forcing `size` on both axes — otherwise the browser
// would letterbox the ink and put the padding straight back.
const MARK_VIEWBOX = "20.61 14 58.62 72.1";
const MARK_ASPECT = 58.62 / 72.1;

/**
 * The mark's geometry, for anything drawing it inside an SVG of its own rather
 * than through <Logo />. PlayoffReveal is that case: its bracket is one SVG and
 * the mark goes on the champion's trophy in that coordinate space, so it needs
 * the path and the box rather than a component that brings its own <svg>.
 *
 * Exported as the numbers behind MARK_VIEWBOX, not the string, because a caller
 * placing this by hand has to cancel the box's origin — the path's own
 * coordinates start at (20.61, 14), not (0, 0).
 */
export const WOLF_MARK = MARK;
export const WOLF_MARK_X = 20.61;
export const WOLF_MARK_Y = 14;
export const WOLF_MARK_W = 58.62;
export const WOLF_MARK_H = 72.1;

export default function Logo({
  size = 28,
  bare = false,
}: {
  size?: number;
  /**
   * Drop the accent tile and draw the head alone in `currentColor`, so the
   * parent's colour decides. For placing the mark on a surface that already
   * carries its own background — the dark utility bar, say — where a second
   * filled block would read as a sticker on top of it.
   *
   * Only viable because the eyes are holes rather than painted shapes: with no
   * tile behind them they punch through to whatever is actually there.
   */
  bare?: boolean;
}) {
  const common = {
    fill: "none",
    role: "img",
    "aria-label": "Wagerwolf",
    style: { flexShrink: 0, display: "block" } as const,
  };

  if (bare) {
    // `size` is the HEIGHT, and width follows the ink's own proportions. Both
    // axes used to be `size`, which letterboxed a taller-than-wide mark inside
    // a square and left ~19% dead space either side of it.
    return (
      <svg
        {...common}
        width={size * MARK_ASPECT}
        height={size}
        viewBox={MARK_VIEWBOX}
      >
        <path fill="currentColor" fillRule="evenodd" d={MARK} />
      </svg>
    );
  }

  // The tile stays square. It is a tile — the padding around the head is the
  // point of it, not an accident of cropping.
  return (
    <svg {...common} width={size} height={size} viewBox="0 0 100 100">
      {/* Square tile, no corner radius — deliberate, not an oversight. The
          previous slips mark rounded to rx=2 on a 24-unit box.
          var(--accent) rather than a literal, so the tile follows the token. */}
      <rect width="100" height="100" fill="var(--accent)" />
      <path fill="#FFFFFF" fillRule="evenodd" d={MARK} />
    </svg>
  );
}
