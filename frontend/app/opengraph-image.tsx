/**
 * The card every shared link unfurls into — Twitter/X, Slack, iMessage,
 * Discord, LinkedIn. Without one, a link to the domain renders as bare text
 * with a favicon, which is the difference between a product and a URL.
 *
 * Drawn at build time with Next's ImageResponse rather than committed as a
 * PNG, for one reason worth keeping: a static file drifts. The accent below
 * has to stay `#2B5DE3` and the mark has to stay the mark, and a checked-in
 * binary gives nobody a way to notice when they no longer match. This file is
 * greppable.
 *
 * The hex IS hardcoded here, and that is the same exemption `Logo.tsx` and
 * `public/logo.svg` already take — this renders in a Node/edge canvas with no
 * document and no cascade, so a CSS custom property has nothing to resolve
 * against. See CLAUDE.md → Design system.
 *
 * 1200x630 is the size every unfurler crops toward; the layout keeps its
 * content well inside that box so a service applying its own aspect ratio does
 * not clip the wordmark.
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Wagerwolf — fantasy football with sportsbook scoring";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#2B5DE3";

// The wolf's outer contour, lifted verbatim from public/logo.svg. Keep in sync
// with that file and components/Logo.tsx — all three draw the same path.
const WOLF =
  "M25.4 14.04C25.64 14.17 29.21 19.1 29.69 19.74L36.59 29.1L40.75 34.76C41.49 35.77 42.39 36.92 43.09 37.96C43.79 37.21 44.52 36.28 45.19 35.49C46.78 33.64 48.33 31.72 49.97 29.92C52.29 32.46 54.55 35.48 56.87 37.96C57.39 37.14 58.28 35.98 58.88 35.16L62.69 29.93L74.26 14C74.47 16.27 74.58 18.8 74.74 21.1L75.63 34.59C75.85 38 76.04 41.57 76.32 44.96C75.35 45.89 74.16 47.22 73.21 48.23C73.79 48.93 74.86 50.6 75.4 51.4C76.67 53.27 78.01 55.19 79.23 57.09C77.61 57.09 75.91 57 74.28 56.96C75.61 59.26 77.07 61.53 78.37 63.83C76.89 63.7 75.4 63.52 73.92 63.41C73.28 64.22 72.54 65.06 71.88 65.86L67.25 71.48L65.31 73.85C65.21 72.66 64.98 71.1 64.82 69.89C62.98 73.23 60.85 76.44 59.05 79.82C58.5 80.85 57.9 81.99 57.3 83C55.41 84.02 52.96 85.15 51.01 86.08C51.05 85.23 51.24 83.9 51.36 83.03C52.37 82.33 53.81 81.46 54.73 80.65C55.09 80.07 55.06 78.81 55.06 78.17C55.06 77.57 54.44 77.38 53.98 77.39C51.67 77.47 49.38 77.55 47.06 77.42C46.47 77.39 45.31 77.26 44.94 77.76C44.65 78.17 44.85 80.41 45.16 80.67C46.11 81.47 47.49 82.34 48.53 83.04C48.63 84.06 48.76 85.08 48.9 86.1C46.81 85.05 44.65 84.06 42.55 83L35.04 69.92C34.82 71.2 34.68 72.53 34.53 73.82C34.18 73.42 33.83 73 33.5 72.59C31.01 69.5 28.4 66.49 25.92 63.4C24.44 63.53 22.96 63.71 21.46 63.83L23.92 59.72C24.46 58.83 25.05 57.88 25.53 56.96C23.9 57 22.24 57.08 20.61 57.09L26.65 48.29C25.73 47.26 24.4 46 23.4 44.96C23.46 44.44 23.48 43.73 23.52 43.19L23.74 39.76L24.43 28.91L25.12 18.51C25.22 17.06 25.36 15.48 25.4 14.04ZM67.4 53.42L67.43 53.45C67.29 53.97 64.97 56.54 64.61 57.14C64.12 58.07 63.86 59.12 63.43 60.09C63.11 60.78 62.56 60.9 61.9 61.16C60.72 61.61 59.52 62.04 58.33 62.47C57.57 63.63 56.72 65.39 56.06 66.67C55.98 66.41 56 64.62 56 64.21L55.97 59.54C57.81 59.23 58.73 58.76 60.2 57.61C62.46 55.83 64.81 54.65 67.4 53.42ZM32.37 53.4C32.83 53.56 33.4 53.88 33.85 54.08C35.88 55.02 37.83 56.24 39.62 57.58C41.2 58.76 41.95 59.17 43.88 59.54C43.85 61.9 43.84 64.26 43.85 66.61L43.76 66.6C43.03 65.17 42.35 63.87 41.56 62.48C40.27 62.05 39.01 61.54 37.73 61.07C36.87 60.75 36.69 60.7 36.32 59.83C35.96 58.96 35.71 58.01 35.28 57.18C35.07 56.77 34.47 56.22 34.2 55.82C33.52 55 32.97 54.28 32.37 53.4Z";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#FFFFFF",
          padding: "0 96px",
          // The one piece of structure, and it is a hairline — same rule the
          // design system uses everywhere instead of a shadow.
          borderBottom: `24px solid ${ACCENT}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 100 100">
            <rect width="100" height="100" fill={ACCENT} />
            {/* evenodd is load-bearing — the eyes are holes in the contour. */}
            <path fill="#FFFFFF" fillRule="evenodd" d={WOLF} />
          </svg>
          <div style={{ fontSize: 92, fontWeight: 600, color: "#000000", letterSpacing: "-0.03em" }}>
            Wagerwolf
          </div>
        </div>
        <div style={{ fontSize: 40, color: "#475569", marginTop: 36, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
          Fantasy football, scored like a sportsbook.
        </div>
        <div style={{ fontSize: 27, color: "#94A3B8", marginTop: 20 }}>
          Player props · Game lines · Parlays · Real NFL data, fake money
        </div>
      </div>
    ),
    size,
  );
}
