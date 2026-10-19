"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/browser";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="page-wide">
      <div className="mx-head">
        <div className="eyebrow">Something went wrong</div>
        <h1 className="mx-title">This page could not load</h1>
      </div>
      <p style={{ color: "var(--text-2)", maxWidth: "44ch", marginBottom: 24 }}>
        The problem has been logged. Trying again often works — if it does not,
        the reference below will help us find it.
      </p>
      {error.digest && (
        <p style={{ color: "var(--text-3)", fontSize: "0.75rem", marginBottom: 24 }}>
          Reference {error.digest}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="mx-btn is-primary" onClick={reset}>
          Try again
        </button>
        <Link className="mx-btn is-quiet" href="/home">
          Go home
        </Link>
      </div>
    </div>
  );
}
