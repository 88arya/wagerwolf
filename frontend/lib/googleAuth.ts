"use client";

// Google sign-in as a full-tab redirect. `state` is a CSRF token kept in
// sessionStorage and checked once by /auth/callback.

export const CALLBACK_PATH = "/auth/callback";

const STATE_KEY = "google_oauth_state";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

const CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "1045849865095-o31t34rfsiidk50ep1shaf0nctni7sno.apps.googleusercontent.com";

/** Absolute, because Google requires it and the backend matches on the origin. */
export function callbackUrl(): string {
  return `${window.location.origin}${CALLBACK_PATH}`;
}

function newState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function startGoogleRedirect(hint?: string): void {
  const state = newState();
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    throw new Error("Sign-in needs browser storage enabled. Check your privacy settings and try again.");
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: "openid profile email",
    state,
    // Always show the account chooser.
    prompt: "select_account",
    ...(hint ? { login_hint: hint } : {}),
  });

  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`);
}

export function takeStoredState(): string | null {
  try {
    const v = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    return v;
  } catch {
    return null;
  }
}
