/**
 * Three marks that used to be sidebar rows and are not any more.
 *
 * Friends moved onto /home as a card. Inbox and Leaderboard are PARKED —
 * deliberately drawn, deliberately unmounted, waiting for somewhere to live.
 * All three were defined inside SideNav, where they would now be dead code the
 * linter is right to flag and the next person is right to delete. Exported from
 * here instead, so the artwork survives the row that used to carry it.
 *
 * They keep SideNav's drawing conventions — 24-unit viewBox, `currentColor`,
 * and `strokeWidth={2}` on the stroke marks — so any of them can go straight
 * back into a `.sidenav-item` beside HomeIcon and match it, or take a larger
 * `size` and sit in a card header. Default 15 is the sidebar's own ICON.
 */

const DEFAULT = 15;

/**
 * Friends: three small circles at the points of a triangle, a larger one in the
 * middle, and the strokes joining them.
 *
 * Not separable into "people" — it is a network mark rather than a group of
 * figures, which is why it reads at 15px where a crowd of heads would not.
 */
export function FriendsIcon({ size = DEFAULT }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M3 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0m14 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0m-8-5a3 3 0 1 0 6 0a3 3 0 1 0-6 0m3-7v4m-5.3 6.8l2.8-2m7.8 2l-2.8-2" />
    </svg>
  );
}

/**
 * Inbox: a tray. NOT MOUNTED ANYWHERE — kept for the surface that will carry it.
 *
 * The lip across the middle is what makes it a tray rather than a box at 15px:
 * drop it and the shape is a rounded rectangle that reads as a card. The two
 * shoulders are drawn as one path with the body so a colour change can never
 * catch one and not the other.
 */
export function InboxIcon({ size = DEFAULT }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11" />
    </svg>
  );
}

/**
 * Leaderboard: a podium. NOT MOUNTED ANYWHERE — the global cross-league board
 * was removed whole, route and all, and this is what is left of it.
 *
 * A FILL mark, unlike the two stroke marks above it. The shape is three solid
 * bars — first, second, third — and an outline version would be three hollow
 * rectangles, which at 15px reads as a bar chart rather than a podium. The
 * 24-unit viewBox is the artwork's own; `size` scales it.
 */
export function LeaderboardIcon({ size = DEFAULT }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M16 11V3H8v6H2v12h20V11zm-6-6h4v14h-4zm-6 6h4v8H4zm16 8h-4v-6h4z"
      />
    </svg>
  );
}
