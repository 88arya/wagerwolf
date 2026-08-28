/**
 * Last-known data for a route, so returning to it paints instead of loading.
 *
 * WHAT THIS IS FOR. The league's tabs — Sportsbook, Specials, My Bets, History —
 * are separate routes under one layout. The chrome already survives a switch:
 * measured on a My Bets -> History navigation, `.nav`, `.subnav-row` and `.page`
 * are never removed from the card. What does not survive is the DATA. Each page
 * mounts with empty state and `loading: true`, so every switch shows a LOADING…
 * block for the length of a round trip, and the header above it states something
 * false in the meantime — "0 bets all season" on a page that has one.
 *
 * Going back and forth therefore re-fetched and re-flashed identical data. This
 * keeps the last result per route so the second visit renders it immediately.
 *
 * STALE-WHILE-REVALIDATE, not a cache with a TTL. A page seeded from here still
 * fetches; the difference is that it fetches with the old answer on screen
 * rather than a spinner. So the data is never staler than one paint, and the
 * only thing given up is the acknowledgement that a fetch is happening — which
 * is the thing being complained about.
 *
 * MODULE SCOPE, DELIBERATELY. It lives as long as the tab and dies with a
 * reload, which is the right lifetime: it exists to make one navigation smooth,
 * not to persist anything. localStorage would mean showing bets from an hour ago
 * as though they were current, and would need invalidating on sign-out.
 *
 * KEYS MUST INCLUDE THE LEAGUE ID. Every one of these pages is league-scoped and
 * the sidebar can switch leagues without unmounting anything, so a key of
 * "mybets" alone would show one league's bets under another's name.
 */
const store = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
}
