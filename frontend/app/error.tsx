"use client";

/**
 * The route-level error boundary.
 *
 * Next requires this to be a client component with a `reset` prop — that is the
 * contract, not a choice. `reset()` re-renders the segment that threw, which is
 * the right first thing to offer: most render errors here come from a fetch
 * that failed once.
 *
 * The message is deliberately generic. `error.digest` is the id Next assigns a
 * server-side error and it is what appears in the server log, so it is shown —
 * that is the same trade `backend/src/middleware/errorHandler.ts` makes with
 * its correlation id, for the same reason: a user can report an id, and an id
 * is greppable.
 */
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Until there is error tracking, the browser console is the only place this
    // is recorded at all. See go_live.md — wiring Sentry replaces this line.
    console.error(error);
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
