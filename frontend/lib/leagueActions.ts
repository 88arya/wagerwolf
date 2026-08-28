/**
 * The channel between the sidebar's "More" popup and the surfaces on /home that
 * actually do the joining and creating.
 *
 * WHY THIS EXISTS. The three things the popup offers — join a public league,
 * redeem an invite code, create a league — are all already built, and all three
 * live inside components/LeaguesRail on /home, sharing one membership list that
 * every one of them reads and writes. The sidebar is mounted on every signed-in
 * route, including league routes where LeaguesRail is nowhere on screen. So the
 * popup cannot own these forms without a second copy of each, and it cannot
 * reach into LeaguesRail's state directly either.
 *
 * It therefore records WHICH action was asked for, sends you to /home, and lets
 * the rail pick it up.
 *
 * WHY NOT A QUERY STRING. `/home?open=create` is the same mistake as the
 * `?edit=profile` this codebase already removed: the App Router does not remount
 * a page for a query-string-only change, so asking for an action while already
 * on /home would silently do nothing — which is exactly the case a control in
 * the permanent sidebar hits most often. See CLAUDE.md -> League profile editor.
 *
 * WHY BOTH A VARIABLE AND AN EVENT. They cover the two halves of one problem:
 *
 *   · Already on /home — LeaguesRail is mounted, nothing will re-run on its own,
 *     so the EVENT is what reaches it.
 *   · Anywhere else — the rail does not exist yet and cannot hear an event fired
 *     before it mounts, so the VARIABLE holds the intent until its first render
 *     claims it.
 *
 * Module scope rather than localStorage, deliberately: this is an intent that
 * lives for one navigation, not a preference. Surviving a reload would mean a
 * sheet opening by itself on a page you loaded fresh hours later.
 */

export type LeagueAction =
  /** Assignment into an open public league — the QuickJoin sheet. */
  | "public"
  /** Redeem a 6-character invite code. */
  | "private"
  /** Create a league and be its commissioner. */
  | "create";

export const LEAGUE_ACTION_EVENT = "league-action";

/**
 * Claimed by whoever acts on it, so it fires once. Without the clear, every
 * later mount of the rail — every return to /home for the rest of the session —
 * would reopen the last sheet you asked for.
 */
let pending: LeagueAction | null = null;

/** Ask for an action. Fires now for a mounted listener, and waits for one that is not. */
export function requestLeagueAction(action: LeagueAction): void {
  pending = action;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LEAGUE_ACTION_EVENT, { detail: action }));
  }
}

/** Read and clear. Returns null when there is nothing waiting. */
export function takePendingLeagueAction(): LeagueAction | null {
  const a = pending;
  pending = null;
  return a;
}
