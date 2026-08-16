"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";

/**
 * Thin utility strip above everything else.
 *
 * Exists because /home and /leagues are unreachable once you are inside a
 * league — LeagueNav's links all stay within the league — so without this there
 * is no way out except the browser back button or the logo.
 *
 * It also owns the *global* account: the identity that follows the user across
 * every league (real name, email, password). The per-league identity — team
 * name, abbreviation, helmet colour — belongs to the profile control in
 * LeagueNav instead, so the two are never confused for one another.
 */

const BAR_BG = "#272731";

// Full-bleed, matching GamesStrip: this bar deliberately opts out of the
// --rail content inset so it spans the whole window, with the logo tile flush
// to the left edge the way the strip's NFL cell is. The nav below and the page
// content still inset by --rail, so these edges are not meant to align.
//
// The links keep their own left offset from the logo rather than from the
// window, so nothing but the logo touches the edge.
const LINKS_GAP = 34;

const BAR_H = 37;

// The logo tile sits inside the bar with air above and below rather than
// filling its height — at 37px square it read as a block capping the bar
// instead of a mark within it.
const LOGO_SIZE = 22;

// Space between the logo tile and the first link. Smaller than LINKS_GAP: the
// logo is a filled block rather than a word, so it needs less air to read as
// separate than two labels do.
const LOGO_GAP = 20;

// Right-hand inset for the account control. The rail's own floor value, so the
// bar's right edge still feels related to the railed content below it.
const EDGE_PAD = 20;

const LINKS = [
  { label: "Home", href: "/home" },
  { label: "Leagues", href: "/leagues" },
];

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

// Outlined person-in-circle, used beside the name at the head of the account
// menu. Filled paths cut with evenodd, so it takes its colour from currentColor
// and ignores strokeWidth.
function AccountIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <g fillRule="evenodd" clipRule="evenodd">
        <path d="M16 9a4 4 0 1 1-8 0a4 4 0 0 1 8 0m-2 0a2 2 0 1 1-4 0a2 2 0 0 1 4 0" />
        <path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11s11-4.925 11-11S18.075 1 12 1M3 12c0 2.09.713 4.014 1.908 5.542A8.99 8.99 0 0 1 12.065 14a8.98 8.98 0 0 1 7.092 3.458A9 9 0 1 0 3 12m9 9a8.96 8.96 0 0 1-5.672-2.012A6.99 6.99 0 0 1 12.065 16a6.99 6.99 0 0 1 5.689 2.92A8.96 8.96 0 0 1 12 21" />
      </g>
    </svg>
  );
}

export default function TopBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api("/users/me").then((u: any) => {
      // Falls back to the display name for accounts that predate onboarding and
      // so have no first/last on record.
      const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
      setFullName(full || u.displayName || u.name || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    router.push("/");
  }

  return (
    <div style={{
      flexShrink: 0,
      background: BAR_BG,
      height: BAR_H,
      display: "flex",
      alignItems: "center",
      // The account menu hangs below the bar and must clear the games strip and
      // nav underneath it.
      position: "relative",
      zIndex: 300,
    }}>
      {/* Leftmost element in the bar. Inset by EDGE_PAD rather than sitting on
          the window edge, mirroring the account control on the right.
          Moved here from LeagueNav so the mark sits in the one bar that is
          present on every page, league or not.

          `bare` — the head alone, no accent tile. The bar already has its own
          dark fill, so a second filled block would read as a sticker stuck on
          top of it. Colour comes from `color` below via currentColor. */}
      <Link
        href="/home"
        aria-label="Wagerwolf home"
        style={{ display: "flex", alignItems: "center", flexShrink: 0, marginLeft: EDGE_PAD, color: "#FFFFFF" }}
      >
        <Logo size={LOGO_SIZE} bare />
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: LINKS_GAP, marginLeft: LOGO_GAP }}>
        {LINKS.map(({ label, href }) => (
          <Link key={href} href={href} className="utility-link" style={linkStyle}>
            {label}
          </Link>
        ))}
      </div>

      {/* Pushed to the far right: an account link is not wayfinding, so it
          reads better set apart from the others than appended to them.
          EDGE_PAD keeps the label off the window edge — the bar is full-bleed,
          but its text should not actually touch the glass. */}
      <div ref={menuRef} style={{ marginLeft: "auto", marginRight: EDGE_PAD, position: "relative", display: "flex", alignItems: "center" }}>
        <button
          type="button"
          className="utility-link"
          style={linkStyle}
          onClick={() => setOpen(o => !o)}
        >
          My Account
        </button>

        {open && (
          // Same panel treatment as LeagueNav's menus: square, no border, shadow
          // only, 6px of vertical padding. Name and email are label rows, then a
          // rule, then the actions.
          <div className="utility-menu" style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, background: "var(--surface)", border: "none", borderRadius: 0, boxShadow: "var(--shadow-md)", zIndex: 500, padding: "6px 0" }}>
            <div className="navmenu-profile is-label">
              <span style={{ gap: 8 }}>
                <AccountIcon />
                {fullName || "—"}
              </span>
            </div>
            {/* Inset to line up with the rows' inner rectangle rather than
                running the full width of the panel: 8px of row padding plus
                9px inside the rectangle. */}
            <div style={{ borderTop: "1px solid var(--border)", margin: "3px 17px" }} />
            <button type="button" className="navmenu-profile" onClick={() => { router.push("/settings"); setOpen(false); }}>
              <span>Account Settings</span>
            </button>
            <button type="button" className="navmenu-profile" onClick={logout}>
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
