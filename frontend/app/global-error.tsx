"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/browser";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#FFFFFF", color: "#000000" }}>
        <div style={{ maxWidth: 480, margin: "96px auto", padding: "0 20px" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 500, letterSpacing: "-0.028em" }}>
            Wagerwolf could not start
          </h1>
          <p style={{ color: "#475569", lineHeight: 1.5 }}>
            Something failed before the page could render. Reloading usually
            clears it.
          </p>
          {error.digest && (
            <p style={{ color: "#94A3B8", fontSize: "0.75rem" }}>Reference {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16, padding: "8px 16px", border: "1px solid #2B5DE3",
              background: "#2B5DE3", color: "#FFFFFF", font: "inherit", cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
