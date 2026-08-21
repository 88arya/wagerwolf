"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { signOut, useAuthed } from "@/lib/auth";
import LogoWordmark, { WORDMARK_FONT_RATIO, WORDMARK_TEXT } from "@/components/LogoWordmark";
import SeasonCountdown from "@/components/SeasonCountdown";

/**
 * Thin utility strip above everything else.
 *
 * Exists because /home is unreachable once you are inside a league —
 * LeagueNav's links all stay within the league — so without this there is no
 * way out except the browser back button or the logo.
 *
 * It is now on EVERY route, signed in or not, including the landing page, which
 * gave up its own sticky header to avoid stacking two. So the right-hand
 * control has two states: "My Account" with its menu, or "Play now" for a
 * visitor. Play now opens the landing page's auth modal — by dispatching
 * SIGNUP_EVENT if we are already on `/`, and by navigating there otherwise. An
 * event rather than a query parameter for the reason in LeagueProfileModal:
 * App Router does not remount a page for a query-string-only change, so a
 * parameter read in an effect silently does nothing on the page you are on.
 *
 * It also owns the *global* account: the identity that follows the user across
 * every league (real name, email, password). The per-league identity — team
 * name, abbreviation, helmet colour — belongs to the profile control in
 * LeagueNav instead, so the two are never confused for one another.
 */

// --bar-bg in globals.css. Shared with SiteFooter, which is the whole point of
// it being a token: the two bars bookend the app and must stay the same black.
const BAR_BG = "var(--bar-bg)";

// The bar's dark fill is full-bleed, but its *contents* inset by --rail — the
// same token `.nav` uses — so the logo starts on the same left edge as
// LeagueNav's first control and the page content below it, and "My Account"
// ends on the same right edge as the nav's profile control. One rail down the
// whole page.
//
// GamesStrip is the deliberate exception: it runs full-bleed contents and all,
// so it is not meant to line up with either of these. See --rail in globals.css.

// KEEP THIS EVEN. Chrome snaps text baselines to whole *device* pixels, and an
// odd bar height puts the centre on a half pixel, which the baseline can never
// sit on. At 37 that cost ~0.5px: the type sat visibly high against the wolf
// mark next to it, which is vector and renders at its true subpixel position.
//
// Even is the half of that reasoning which still holds. The other half does
// not: 36 was picked because Fugaz One's ideal baseline landed at 23.06, a
// whisker off a whole CSS pixel and so clean at 1x, 1.3x and 2x alike. The
// lockup is Inter Tight now, with different metrics and a different ideal
// baseline, so that argument does not transfer and 40 is not a regression from
// it — neither height has been measured against this face.
//
// Measuring it is the open item, together with OPTICAL_SHIFT_EM in
// LogoWordmark, which is currently 0 as a placeholder for the same reason.
const BAR_H = 40;

/**
 * Fired by "Play now" when the landing page is already mounted, so it can
 * open its auth modal. Exported for that page to listen on — the same
 * event-instead-of-URL-state pattern LeagueProfileModal uses.
 */
export const SIGNUP_EVENT = "wagerwolf:signup";

// The lockup sits inside the bar with air above and below rather than filling
// its height — at 36px it read as a block capping the bar instead of a mark
// within it.
//
// There is no LINKS array and no gap token any more. Both existed to space a
// left cluster of three (mark, Home, Leagues); the cluster is one element now.
const LOCKUP_H = 20;

// The hover rule itself lives in globals.css under .utility-link — it is a
// pseudo-element that scales in from the left, which inline styles cannot
// express. Everything here is just the type.
// "My Account" is set exactly as the wordmark at the other end of the bar:
// same face, weight, tracking and size, and no uppercase. The two are the only
// text in the utility bar, so anything that differed between them read as a
// mismatch rather than a hierarchy.
//
// Size is the one thing WORDMARK_TEXT cannot carry, because the lockup derives
// it from its own height. Computed from the same two values rather than the
// 14px they currently produce, so changing LOCKUP_H moves both ends together.
//
// Only colour is the bar's own — the lockup takes white from currentColor on
// its Link, this states it.
//
// There is no LEAN_PX any more. It padded the left edge by ~2px to cover the
// skew: the label leaned back, so its ink reached further left at the cap line
// than its layout box did, and the hover underline — a ::after spanning that
// box — trailed to the right of the word. Inter Tight is upright and the skew
// went with Fugaz One, so the ink and the box agree again and the rule lands
// under the word on its own.
const linkStyle: CSSProperties = {
  ...WORDMARK_TEXT,
  fontSize: LOCKUP_H * WORDMARK_FONT_RATIO,
  color: "#FFFFFF",
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
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  // Reactive, so signing in or out flips this control without a reload — the
  // bar is mounted once in the root layout and never remounts on navigation.
  const authed = useAuthed();
  const menuRef = useRef<HTMLDivElement>(null);
  // `/` swaps the lockup for the season countdown and drops the right-hand
  // Play now, since the countdown ends in the same call to action.
  const isLanding = pathname === "/";

  useEffect(() => {
    if (!authed) { setFullName(""); return; }
    api("/users/me").then((u: any) => {
      // Falls back to the display name for accounts that predate onboarding and
      // so have no first/last on record.
      const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
      setFullName(full || u.displayName || u.name || "");
    }).catch(() => {});
  }, [authed]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function logout() {
    signOut();
    router.push("/");
  }

  // The landing page's modal is opened by event when it is already mounted and
  // by navigation when it is not — see SIGNUP_EVENT above. Shared so the
  // countdown's link and the right-hand control cannot drift apart.
  function startSignup() {
    if (isLanding) window.dispatchEvent(new CustomEvent(SIGNUP_EVENT));
    else router.push("/");
  }

  return (
    <div style={{
      flexShrink: 0,
      background: BAR_BG,
      height: BAR_H,
      display: "flex",
      alignItems: "center",
      // Fill stays full-bleed; only the contents inset. Same token as `.nav`.
      padding: "0 var(--rail)",
      boxSizing: "border-box",
      // The account menu hangs below the bar and must clear the games strip and
      // nav underneath it.
      position: "relative",
      zIndex: 300,
    }}>
      {/* Leftmost element in the bar, and now the only thing on this side of
          it. No inset of its own — the bar's --rail padding puts it on the
          page's left edge, level with LeagueNav's first control (which likewise
          has no padding of its own). It lives in this bar rather than LeagueNav
          so the mark is present on every page, league or not.

          The full lockup, and no "Home" link beside it: the wordmark *is* the
          home link. A word next to it pointed at the same route, which is two
          controls doing one thing — invisible while "Leagues" sat alongside,
          glaring once that moved to the rail on /home.

          `bare` draws head and name in currentColor. It is the same call
          SiteFooter makes, on the same --bar-bg fill, so the two bars that
          bookend the app share a lockup as well as a colour. Without it the
          mark carries its accent tile, and a filled block on an already-dark
          bar reads as a sticker stuck on top of it. */}
      {isLanding ? (
        // The mark is the hero's job on this page; a second one in the bar above
        // it was the same asset twice on one screen.
        //
        // Centred by a spacer here and a matching `flex: 1 1 0` on the account
        // slot below, rather than by auto margins or an absolute left: 50%.
        // Auto margins would centre the sentence in the space *left over* after
        // the account menu, which is half a menu-width off the real centre
        // whenever someone signed in visits `/`. Absolute would take the
        // sentence out of flow and cost it the truncation below — and would
        // collide with the `top` the shared type object sets.
        <>
          <div style={{ flex: "1 1 0" }} />
          <SeasonCountdown
            style={{ ...linkStyle, minWidth: 0 }}
            onGetStarted={authed === false ? startSignup : undefined}
          />
        </>
      ) : authed === false ? (
        // Signed out only. `=== false` and not `!authed`, so nothing renders
        // while the token check is still outstanding — the same rule the
        // account control follows: an empty slot for one frame says nothing
        // false, a lockup that vanishes a frame later is a flicker.
        //
        // NOTE: this lockup was the only route back to /home from inside a
        // league — LeagueNav's Home goes to the *league* home, not the app's —
        // so signed-in users now have no way out of a league but the browser
        // back button. See the header comment above.
        <Link
          href="/home"
          aria-label="Wagerwolf home"
          style={{ display: "flex", alignItems: "center", flexShrink: 0, color: "#FFFFFF" }}
        >
          <LogoWordmark height={LOCKUP_H} bare />
        </Link>
      ) : null}

      {/* Pushed to the far right: an account link is not wayfinding, so it
          reads better set apart from the others than appended to them. Its
          right edge is the bar's --rail padding, so it lands on the same edge
          as the nav's profile control below. */}
      <div
        ref={menuRef}
        style={{
          // Off the landing page this is the only thing on the right, so an
          // auto margin is enough. On it, the slot has to be the same width as
          // the spacer opposite for the sentence between them to be centred —
          // hence the equal flex basis. No minWidth: 0, so the menu is never
          // squashed narrower than its own label.
          ...(isLanding ? { flex: "1 1 0", justifyContent: "flex-end" } : { marginLeft: "auto" }),
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Nothing until the token check lands. Rendering either label as the
            default flashes the wrong one at half the audience — "My Account" at
            a visitor on the landing page, or "Play now" at a signed-in user
            on every page. An empty slot for one frame says nothing false. */}
        {/* On `/` the Play now state is dropped — the countdown beside it
            already ends in that call to action, and two identical CTAs in one
            36px bar is one too many. The signed-in state is untouched: a
            signed-in visitor to the landing page keeps their account menu. */}
        {authed === null ? null : authed === false ? (
          isLanding ? null : (
            <button
              type="button"
              className="utility-link"
              style={linkStyle}
              onClick={startSignup}
            >
              Play now
            </button>
          )
        ) : (
        <button
          type="button"
          className="utility-link"
          style={linkStyle}
          onClick={() => setOpen(o => !o)}
        >
          My Account
        </button>
        )}

        {open && authed !== false && (
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
