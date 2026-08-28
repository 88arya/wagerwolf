"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { callbackUrl, takeStoredState } from "@/lib/googleAuth";
import BarePageHeader from "@/components/BarePageHeader";

/**
 * Where Google sends the browser back to after a full-tab sign-in.
 *
 * It is the second half of what used to happen inside a popup callback: read
 * the code, hand it to the backend, store the token, go to /home. The first
 * half is lib/googleAuth.
 *
 * NOTHING HERE IS A DESTINATION. Nobody navigates to this page; they arrive on
 * it mid-flight and leave within a round trip. So it renders a line of status
 * rather than a screen, and every failure ends in a way back to /signup — being
 * stranded on a blank callback with a code in the URL is the worst outcome this
 * page can produce.
 *
 * READS window.location, NOT useSearchParams. The hook opts a page into dynamic
 * rendering and wants a Suspense boundary around it; this only ever runs in the
 * browser, one time, inside an effect that already exists.
 *
 * THE URL IS SCRUBBED as soon as it is read. An authorization code is
 * single-use and short-lived, but leaving one in the address bar means it is in
 * history, in any screenshot, and in whatever the next page sends as a
 * referrer. replaceState also means a refresh lands on a bare /auth/callback
 * that says so, rather than silently retrying a spent code.
 */
export default function GoogleCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  // Effects run twice in development's strict mode, and an authorization code
  // is single-use: the second exchange would fail and replace a successful
  // sign-in with an error. This is the guard for that, not an optimisation.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");

    // Scrub before anything can fail, so no path leaves the code on screen.
    window.history.replaceState({}, "", window.location.pathname);

    // The person pressed Cancel, or Google refused. `access_denied` is a
    // choice, not a fault, so it does not get an error voice.
    if (denied) {
      setError(denied === "access_denied"
        ? "Sign-in was cancelled."
        : "Google could not complete sign-in.");
      return;
    }

    const expected = takeStoredState();
    if (!code || !state || !expected || state !== expected) {
      // Deliberately one message for four different causes. A mismatched state
      // is either a stale tab or a forged link, and telling the two apart out
      // loud only helps whoever sent the link.
      setError("That sign-in link is no longer valid. Please start again.");
      return;
    }

    api("/users/auth/google", {
      method: "POST",
      // `redirectUri` is new to this flow: Google checks the exchange against
      // the URI the code was issued to, so the backend cannot assume the
      // popup's "postmessage" any more. It validates this against FRONTEND_URL.
      //
      // `ageConfirmed` is hardcoded true exactly as it was on the sign-up
      // screen — the 18+ requirement lives in /terms, which Continue binds the
      // user to. See the note in components/AuthScreen.
      body: JSON.stringify({ code, redirectUri: callbackUrl(), ageConfirmed: true }),
    })
      .then((res: any) => {
        setToken(res.token);
        localStorage.setItem("userId", res.userId);
        localStorage.setItem("displayName", res.displayName ?? "");
        // replace, not push: this page must not be a back-button destination —
        // returning to it would re-run an exchange whose code is spent.
        router.replace("/home");
      })
      .catch((err: unknown) => {
        const raw = err instanceof Error ? err.message : String(err);
        try { setError(JSON.parse(raw).error ?? raw); } catch { setError(raw); }
      });
  }, [router]);

  return (
    <div className="bare-route">
      <BarePageHeader />
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          {error ? (
            <>
              <div style={{ fontSize: "0.9rem", color: "var(--text)", marginBottom: 14 }}>{error}</div>
              <Link href="/signup" className="mx-btn is-primary" style={{ textDecoration: "none" }}>
                Back to sign in
              </Link>
            </>
          ) : (
            <div style={{ fontSize: "0.9rem", color: "var(--text-2)" }}>Signing you in…</div>
          )}
        </div>
      </main>
    </div>
  );
}
