"use client";

/**
 * The last-resort boundary: it catches errors thrown by the ROOT LAYOUT itself,
 * which `error.tsx` cannot — that one renders inside the layout that failed.
 *
 * Because the layout is what broke, this component has to supply its own
 * `<html>` and `<body>`. That is a Next requirement and the reason this file
 * looks unlike every other page here: none of the fonts, tokens or chrome are
 * available, so the styling is inline and minimal on purpose. It should be
 * plain — a page that tries to look designed while the design system is the
 * thing that failed will look broken instead.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
