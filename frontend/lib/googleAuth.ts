"use client";

/**
 * Google sign-in as a full-tab redirect.
 *
 * WHAT THIS REPLACED. Google Identity Services' `initCodeClient` with
 * `ux_mode: "popup"` — the tab stayed put and Google opened a window that
 * posted a code back to its opener. The popup is gone: the tab itself goes to
 * Google, the person signs in there, and Google sends them back to
 * CALLBACK_PATH with a code in the query string.
 *
 * WHY THE URL IS BUILT BY HAND rather than asking GIS for `ux_mode: "redirect"`.
 * That mode delivers the code by POSTing to the redirect URI, which a static
 * frontend route cannot receive — it would need a server endpoint whose only
 * job is to catch a form post and bounce it into the client. A plain OAuth 2.0
 * authorization URL comes back as a GET with `?code=`, which an ordinary page
 * can read. It also means the GIS script no longer has to load at all.
 *
 * THE ONE THING THIS NEEDS THAT THE POPUP DID NOT: the exact callback URL must
 * be registered under "Authorized redirect URIs" on the OAuth client in Google
 * Cloud Console. The popup flow used the literal "postmessage" and so never
 * required one. Without it Google refuses with `redirect_uri_mismatch` before
 * the person sees a chooser.
 *
 * STATE IS A CSRF TOKEN, and checking it is not optional. GIS did this
 * invisibly; doing the redirect by hand means doing it by hand. Without it,
 * anyone can send someone a link to our callback carrying a code from THEIR
 * OAuth session and sign the victim into the attacker's account. The value is
 * random, stored where only this origin can read it, and single-use.
 *
 * sessionStorage rather than localStorage: the value is meaningless once the
 * round trip finishes, and a tab that never comes back should not leave one
 * behind.
 */

export const CALLBACK_PATH = "/auth/callback";

const STATE_KEY = "google_oauth_state";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

// Shared with the backend's audience check. It is a public value — it is in
// every authorization URL — which is why it can sit in client code.
const CLIENT_ID = "1045849865095-o31t34rfsiidk50ep1shaf0nctni7sno.apps.googleusercontent.com";

/** Absolute, because Google requires it and the backend matches on the origin. */
export function callbackUrl(): string {
  return `${window.location.origin}${CALLBACK_PATH}`;
}

function newState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Leave for Google. This never returns — the tab is navigating.
 *
 * `hint` is Google's `login_hint`: it pre-selects an address in the chooser. A
 * hint only, as before — Google still lets them pick another account.
 */
export function startGoogleRedirect(hint?: string): void {
  const state = newState();
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    // Private mode with storage blocked. Better to continue without CSRF
    // protection than to make sign-in impossible? No — the callback refuses a
    // response it cannot verify, so failing here with a clear message is the
    // honest outcome.
    throw new Error("Sign-in needs browser storage enabled. Check your privacy settings and try again.");
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: "openid profile email",
    state,
    // Always show the chooser. Without it a returning user with one Google
    // session is signed straight back in with no way to pick a different
    // account, which is the complaint every "wrong account" support ticket is.
    prompt: "select_account",
    ...(hint ? { login_hint: hint } : {}),
  });

  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`);
}

/**
 * Read and clear the stored state. Returns null when there is nothing to
 * compare against, which the caller must treat as a failure rather than a pass.
 */
export function takeStoredState(): string | null {
  try {
    const v = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    return v;
  } catch {
    return null;
  }
}
