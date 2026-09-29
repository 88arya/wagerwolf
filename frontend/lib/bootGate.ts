import { useSyncExternalStore } from "react";

/**
 * Holds the signed-in shell behind the loading bar until its first data lands.
 *
 * WHAT IT FIXES. A reload of any shell page used to paint the frame empty and
 * then fill it in piece by piece: the sidebar's leagues, the games list, the
 * account menu, and every card in the card each arrived on their own round
 * trip, so the screen visibly assembled itself. lib/pageCache smooths a
 * NAVIGATION, but it is module scope and a reload empties it, which is exactly
 * when the pop-in happens. Sign-in has the same shape: /auth/callback shows the
 * loading bar, and then /home did the same piecemeal fill.
 *
 * HOW. Every request goes through lib/api, which hands its promise to
 * `trackBoot` until the gate opens. `ShellBoot` (rendered last inside AppFrame's
 * shell branch) arms the gate from an effect. React runs effects child first,
 * so by then every component in the shell has already fired its mount fetches
 * and registered them. When the set drains, the gate waits a beat for any
 * follow-up request a response triggers (a fetch that depends on the one
 * before), and only then opens. It opens anyway at BOOT_CAP_MS, so one slow or
 * hung endpoint delays the page, it never strands it.
 *
 * ONCE PER TAB. After the gate opens, navigations inside the shell render
 * straight through; pageCache is what keeps those smooth. A reload starts the
 * module over, which re-arms it. `resetBoot` re-arms it on a fresh sign-in.
 *
 * IT ONLY WAITS FOR WHAT IS NOT ALREADY ON SCREEN. lib/pageCache survives a
 * reload, and a component that repainted from it passes `gate: false` to lib/api
 * for its refresh. So a reload in a warm tab opens the gate as soon as the
 * shell has hydrated, with the last-known data showing, and the bar is only
 * held for the length of a real wait: the first load after sign-in, or a page
 * nothing has cached yet.
 *
 * The server snapshot is "not booted", so a server-rendered shell page's first
 * paint IS the loading bar, never the empty frame.
 */

const BOOT_CAP_MS = 4000;
// Long enough for a response to render and fire the request it leads to.
const SETTLE_MS = 100;

let booted = false;
let armed = false;
const pending = new Set<Promise<unknown>>();
const listeners = new Set<() => void>();
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let capTimer: ReturnType<typeof setTimeout> | undefined;

function open() {
  if (booted) return;
  booted = true;
  clearTimeout(settleTimer);
  clearTimeout(capTimer);
  pending.clear();
  listeners.forEach((l) => l());
}

function maybeOpen() {
  if (!armed || booted || pending.size > 0) return;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { if (pending.size === 0) open(); }, SETTLE_MS);
}

export function trackBoot<T>(request: Promise<T>): Promise<T> {
  if (booted || typeof window === "undefined") return request;
  pending.add(request);
  clearTimeout(settleTimer);
  const done = () => { pending.delete(request); maybeOpen(); };
  request.then(done, done);
  return request;
}

export function armBoot() {
  if (booted || armed) return;
  armed = true;
  // Nothing outstanding means every piece of the shell painted from
  // lib/pageCache (a reload in a warm tab): there is nothing to wait for, so no
  // settle delay either. The delay only exists to catch a request that a
  // response triggers, and no request has been made.
  if (pending.size === 0) { open(); return; }
  capTimer = setTimeout(open, BOOT_CAP_MS);
  maybeOpen();
}

/** A new session is a new first load: sign-in calls this before /home. */
export function resetBoot() {
  booted = false;
  armed = false;
  pending.clear();
  clearTimeout(settleTimer);
  clearTimeout(capTimer);
  listeners.forEach((l) => l());
}

export function isBooted(): boolean {
  return booted;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useBooted(): boolean {
  return useSyncExternalStore(subscribe, () => booted, () => false);
}
