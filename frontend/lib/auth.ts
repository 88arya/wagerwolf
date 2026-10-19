"use client";

import { useEffect, useState } from "react";
import { clearPageCache } from "./pageCache";

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

// Clears all per-account storage, not just the token.
export function signOut() {
  clearPageCache();
  localStorage.clear();
  announce();
}

export function hasToken(): boolean {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(TOKEN_KEY));
}

// null until checked on the client, so SSR and hydration agree.
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
