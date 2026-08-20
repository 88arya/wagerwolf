"use client";

import { useEffect, useState } from "react";

/**
 * Whether anyone is signed in, as reactive state.
 *
 * The token lives in localStorage, which is not reactive. That was fine while
 * every consumer read it once on mount — but the chrome (TopBar, AppChrome) is
 * mounted once in the root layout and survives every navigation, so signing in
 * or out changed localStorage and left the bar showing the previous state until
 * a hard reload. "My Account" after signing out, "Get Started" after signing in.
 *
 * Fixed by making the writes go through here and announcing them:
 *
 *  - `setToken` / `signOut` are the only supported ways to change it
 *  - both fire AUTH_EVENT, which every `useAuthed()` picks up in the same tab
 *  - `storage` covers other tabs, which fire it natively and never for the tab
 *    that made the change — hence needing both
 */

export const TOKEN_KEY = "token";

/** Same-tab announcement. `storage` does not fire in the tab that wrote. */
export const AUTH_EVENT = "wagerwolf:auth";

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

export function setToken(token: string, userId?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (userId) localStorage.setItem("userId", userId);
  announce();
}

/**
 * Clears everything, not just the token.
 *
 * The rest of what the app keeps in localStorage is per-account too — the
 * remembered strip league, the cached display name — and leaving it behind
 * meant the next person to sign in on this device briefly saw the last one's
 * league in the games strip.
 */
export function signOut() {
  localStorage.clear();
  announce();
}

export function hasToken(): boolean {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(TOKEN_KEY));
}

/**
 * `null` until checked on the client, then boolean.
 *
 * Never resolved during the initial render on purpose: reading localStorage in
 * a `useState` initialiser runs during SSR, where there is no localStorage, and
 * mismatches on hydration. Consumers render nothing for that one frame rather
 * than guessing — see the comment on TopBar's right-hand control.
 */
export function useAuthed(): boolean | null {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const read = () => setAuthed(hasToken());
    read();
    window.addEventListener(AUTH_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(AUTH_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return authed;
}
