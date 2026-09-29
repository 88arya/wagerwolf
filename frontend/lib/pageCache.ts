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
 * IT SURVIVES A RELOAD, as of 28 Sept 2026, through sessionStorage. It used to
 * be module scope only, which smoothed a navigation but emptied on a reload, and
 * a reload is when the whole signed-in shell visibly assembled itself request
 * by request. sessionStorage and NOT localStorage, and that distinction is the
 * whole defence of doing this at all: it lives exactly as long as the tab, so a
 * reload shows what was on screen seconds ago, while a tab closed yesterday
 * starts empty instead of presenting yesterday's bets as current.
 *
 * TWO READS, BECAUSE OF HYDRATION. The server cannot see sessionStorage, so a
 * component that seeded its first render from it would render something the
 * server did not, and React would throw the server HTML away.
 *
 *  - `getCached` reads MEMORY ONLY and is safe during render. On a client-side
 *    navigation memory is warm and the first render is already right; on a
 *    reload memory is empty, which matches the server.
 *  - `readCached` also reads sessionStorage, and belongs in an effect: that is
 *    where a reloaded page picks its last answer back up, while
 *    lib/bootGate still has the shell hidden, so the reveal shows it already
 *    applied.
 *
 * PER USER. Every key is prefixed with the signed-in user's id, and
 * `clearPageCache` (called by signOut and on every fresh sign-in) empties the
 * lot, so nobody can be shown the previous person's bets on a shared machine.
 *
 * KEYS MUST INCLUDE THE LEAGUE ID where the data is league-scoped. The sidebar
 * can switch leagues without unmounting anything, so a key of "mybets" alone
 * would show one league's bets under another's name.
 */
const PREFIX = "pc:";
const memory = new Map<string, unknown>();

function fullKey(key: string): string {
  const owner = typeof window !== "undefined" ? localStorage.getItem("userId") ?? "" : "";
  return `${PREFIX}${owner}:${key}`;
}

/** Memory only. Safe in render and in `useState` initialisers. */
export function getCached<T>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  return memory.get(fullKey(key)) as T | undefined;
}

/** Memory, then sessionStorage. Effects and handlers only — never in render. */
export function readCached<T>(key: string): T | undefined {
  const k = fullKey(key);
  if (memory.has(k)) return memory.get(k) as T;
  try {
    const raw = sessionStorage.getItem(k);
    if (raw == null) return undefined;
    const value = JSON.parse(raw) as T;
    memory.set(k, value);
    return value;
  } catch {
    return undefined;
  }
}

export function setCached<T>(key: string, value: T): void {
  const k = fullKey(key);
  memory.set(k, value);
  // Best effort: a full or disabled store only costs the next reload its head
  // start, never the value already in memory.
  try { sessionStorage.setItem(k, JSON.stringify(value)); } catch {}
}

export function clearPageCache(): void {
  memory.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {}
}
