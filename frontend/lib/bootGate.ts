import { useSyncExternalStore } from "react";

// Holds the signed-in shell behind the loading bar until its first round of
// requests lands, then reveals everything at once. Opens unconditionally at 4s.

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
