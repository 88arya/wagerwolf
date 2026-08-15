"use client";

import Link from "next/link";

/**
 * Thin utility strip above everything else.
 *
 * Exists because /home and /leagues are unreachable once you are inside a
 * league — LeagueNav's links all stay within the league — so without this there
 * is no way out except the browser back button or the logo.
 */

const BAR_BG = "#272731";

// Matches the rail GamesStrip and LeagueNav use, so all three line up.
const RAIL = "0 300px";

const LINKS = [
  { label: "Home", href: "/home" },
  { label: "Leagues", href: "/leagues" },
];

// Sits apart from the wayfinding links on the right of the bar.
const ACCOUNT = { label: "My Account", href: "/settings" };

// The hover rule itself lives in globals.css under .utility-link — it is a
// pseudo-element that scales in from the left, which inline styles cannot
// express. Everything here is just the type.
const linkStyle = {
  fontSize: "0.66rem",
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: "#FFFFFF",
  whiteSpace: "nowrap" as const,
};

export default function TopBar() {
  return (
    <div style={{
      flexShrink: 0,
      background: BAR_BG,
      padding: RAIL,
      height: 37,
      display: "flex",
      alignItems: "center",
      gap: 34,
    }}>
      {LINKS.map(({ label, href }) => (
        <Link key={href} href={href} className="utility-link" style={linkStyle}>
          {label}
        </Link>
      ))}

      {/* Pushed to the far right: an account link is not wayfinding, so it
          reads better set apart from the four above than appended to them. */}
      <Link href={ACCOUNT.href} className="utility-link" style={{ ...linkStyle, marginLeft: "auto" }}>
        {ACCOUNT.label}
      </Link>
    </div>
  );
}
