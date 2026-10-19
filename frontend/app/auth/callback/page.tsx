"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { resetBoot } from "@/lib/bootGate";
import { clearPageCache } from "@/lib/pageCache";
import { callbackUrl, takeStoredState } from "@/lib/googleAuth";
import BarePageHeader from "@/components/BarePageHeader";
import LoadingBar from "@/components/LoadingBar";

// Google redirects here with ?code. Verify state, exchange the code, store the token.
export default function GoogleCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  // Strict mode runs effects twice and the code is single-use.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    router.prefetch("/home");

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");

    // Scrub before anything can fail, so no path leaves the code on screen.
    window.history.replaceState({}, "", window.location.pathname);

    if (denied) {
      setError(denied === "access_denied"
        ? "Sign-in was cancelled."
        : "Google could not complete sign-in.");
      return;
    }

    const expected = takeStoredState();
    if (!code || !state || !expected || state !== expected) {
      // Same message for every failure; don't tell a forged link apart from a stale tab.
      setError("That sign-in link is no longer valid. Please start again.");
      return;
    }

    api("/users/auth/google", {
      method: "POST",
      body: JSON.stringify({ code, redirectUri: callbackUrl(), ageConfirmed: true }),
    })
      .then((res: { token: string; userId: string; displayName?: string }) => {
        setToken(res.token);
        localStorage.setItem("userId", res.userId);
        localStorage.setItem("displayName", res.displayName ?? "");
        // replace, not push: going back here would retry a spent code.
        resetBoot();
        clearPageCache();
        router.replace("/home");
      })
      .catch((err: unknown) => {
        const raw = err instanceof Error ? err.message : String(err);
        try { setError(JSON.parse(raw).error ?? raw); } catch { setError(raw); }
      });
  }, [router]);

  if (!error) return <LoadingBar label="Signing you in" />;

  return (
    <div className="bare-route">
      <BarePageHeader />
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ fontSize: "0.9rem", color: "var(--text)", marginBottom: 14 }}>{error}</div>
          <Link href="/signup" className="mx-btn is-primary" style={{ textDecoration: "none" }}>
            Back to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
