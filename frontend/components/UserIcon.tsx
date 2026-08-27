/**
 * Solid person-in-circle — the app's one "this is you" mark.
 *
 * It began as a local function inside LeagueNav, where it labels the per-league
 * profile control beside the league name. AccountMenu had a SECOND, different
 * person icon of its own: same idea, outlined instead of filled, on a 24-unit
 * grid instead of 512. Two marks for one concept, six pixels apart once the
 * account control moved into the sidebar — so there is one now, and this is it.
 *
 * FILLED, not stroked. `fill="currentColor"` on the path means it takes its
 * colour from whatever it sits in and ignores strokeWidth entirely, which is
 * why it needs no matching to the 1.75px lucide icons it sits beside — a solid
 * mark and an outlined one at the same size read at the same weight.
 *
 * Not a client component: it is a static path with nothing to run.
 */
export default function UserIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
      // Same guard every icon in a flex row needs: without it the mark is the
      // first thing squeezed when a long name shares the row.
      style={{ flexShrink: 0 }}
    >
      <path fillRule="evenodd" d="M256 42.667A213.333 213.333 0 0 1 469.334 256c0 117.821-95.513 213.334-213.334 213.334c-117.82 0-213.333-95.513-213.333-213.334C42.667 138.18 138.18 42.667 256 42.667m21.334 234.667h-42.667c-52.815 0-98.158 31.987-117.715 77.648c30.944 43.391 81.692 71.685 139.048 71.685s108.104-28.294 139.049-71.688c-19.557-45.658-64.9-77.645-117.715-77.645M256 106.667c-35.346 0-64 28.654-64 64s28.654 64 64 64s64-28.654 64-64s-28.653-64-64-64" />
    </svg>
  );
}
