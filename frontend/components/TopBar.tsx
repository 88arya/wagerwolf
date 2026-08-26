"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { signOut, useAuthed } from "@/lib/auth";
import LogoWordmark, { WORDMARK_FONT_RATIO } from "@/components/LogoWordmark";
import SeasonCountdown from "@/components/SeasonCountdown";

/**
 * Thin utility strip above everything else.
 *
 * Exists because /home is unreachable once you are inside a league —
 * LeagueNav's links all stay within the league — so without this there is no
 * way out except the browser back button or the logo.
 *
 * It is now on EVERY route, signed in or not, including the landing page, which
 * gave up its own sticky header to avoid stacking two.
 *
 * The bar is three slots: the lockup on the left, the season countdown in the
 * middle on `/` only, and one control on the right with two states — "My
 * Account" with its menu, or "Play now" for a visitor. Both outer slots carry
 * `flex: 1 1 0` so they stay equal, which is what keeps the countdown on the
 * bar's true centre instead of the centre of the space left over.
 *
 * Play now routes to /signup, which is a bare page carrying its own wordmark.
 * It has been a landing-page section, then a modal, and is now a route: a
 * dialog had no URL, so there was nothing to link to and no way to send anyone
 * straight to it.
 *
 * It also owns the *global* account: the identity that follows the user across
 * every league (real name, email, password). The per-league identity — team
 * name, abbreviation, helmet colour — belongs to the profile control in
 * LeagueNav instead, so the two are never confused for one another.
 */

// --header-bg, which is the bar's alone. It used to be --bar-bg, shared with
// SiteFooter so the two bars bookending the app could not drift apart; they are
// now deliberately different — true black up here, #272731 down there.
const BAR_BG = "var(--header-bg)";

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

// SIGNUP_EVENT is gone. It existed to open a sign-in dialog without a
// navigation, first on the landing page and then from the root layout. Sign-up
// is the /signup route now, so the thing the event was avoiding — a navigation
// — is the whole point, and a plain router.push says it more directly.

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
// There is no LEAN_PX any more. It padded the left edge by ~2px to cover the
// skew: the label leaned back, so its ink reached further left at the cap line
// than its layout box did, and the hover underline — a ::after spanning that
// box — trailed to the right of the word. Inter Tight is upright and the skew
// went with Fugaz One, so the ink and the box agree again and the rule lands
// under the word on its own.
// The UI face at the design system's 500 ceiling. Only the season countdown
// uses this now — a whole sentence, which wants the body face rather than the
// display one the lockup and the right-hand control share.
//
// It used to dress "My Account" as well, and before that it spread
// WORDMARK_TEXT so both ends of the bar were set identically. Size is still
// derived from LOCKUP_H, so it scales with the lockup even though it no longer
// matches its face.
const linkStyle: CSSProperties = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "normal",
  textTransform: "none",
  lineHeight: "normal",
  display: "inline-block",
  whiteSpace: "nowrap",
  fontSize: LOCKUP_H * WORDMARK_FONT_RATIO,
  color: "#FFFFFF",
};

// "Play now" and "My account", the bar's two interactive labels.
//
// THE UI FACE, not the lockup's. This used to spread WORDMARK_TEXT, which set
// both in Arca Majora at weight 700 — the argument being that the bar should
// read in one voice with the mark. It reads as a logo with two more logos
// bolted either side of it instead: Arca Majora is a display cut with two
// weights, and a label is not a logo. Gilroy also carries a lowercase "a" and
// "y" drawn for running text, which is what these are.
//
// Size still comes from LOCKUP_H x WORDMARK_FONT_RATIO, so the labels stay
// locked to the lockup's own text size even though they no longer share its
// face — that ratio is what keeps the three things on this bar optically level.
//
// 600 rather than linkStyle's 500. Gilroy's Medium reads light (see the
// --font-sans note in globals.css), and white type on the dark bar thins
// further still; 500 left these looking like captions beside the mark. The
// design system's 400-500 ceiling was set against Inter Tight and is already
// broken in the same direction on the .mx-* labels.
const ctaStyle: CSSProperties = {
  ...linkStyle,
  fontWeight: 600,
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
  // `/` is the only route that carries the season countdown, between the
  // lockup and the control. Neither of those is conditional any more — the
  // countdown is now the only thing this flag decides.
  const isLanding = pathname === "/";

  useEffect(() => {
    if (!authed) { setFullName(""); return; }
    api("/users/me").then((u: any) => {
      // Falls back to the display name for accounts where Google supplied no
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

  // Sign-up is a page now, not a dialog. It went landing-page section -> modal
  // -> route: a dialog had no URL, so there was nothing to link to, nothing to
  // come back to, and no way to send someone straight to it.
  function startSignup() {
    router.push("/signup");
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
      {/* The lockup is now unconditional — every route, signed in or out, `/`
          included. It used to be hidden in two cases, and both are gone:

          - On `/` it gave way to the season countdown, on the grounds that the
            landing hero already carried a mark and a second one was the same
            asset twice on one screen. The countdown still runs there, centred
            between this slot and the control opposite; it just no longer has
            the left edge to itself.
          - When signed in it was hidden everywhere, which left a signed-in user
            inside a league with no route back to /home at all — LeagueNav's
            Home goes to the *league* home. That was a documented gap, and
            showing the lockup always is what closes it: the wordmark IS the
            home link.

          The slot takes `flex: 1 1 0` so it balances the control opposite,
          which is what keeps the countdown between them on the true centre of
          the bar rather than the centre of whatever space is left over. Off `/`
          there is nothing in the middle and the two slots simply split the bar,
          putting the lockup on the left edge and the control on the right.

          `bare` draws head and name in currentColor. It is the same call
          SiteFooter makes, on the same --bar-bg fill, so the two bars that
          bookend the app share a lockup as well as a colour. Without it the
          mark carries its accent tile, and a filled block on an already-dark
          bar reads as a sticker stuck on top of it. */}
      {/* A link ONLY when signed in. /home sits behind the guard in
          app/(user)/layout.tsx, which bounces anyone without a token back to
          `/` — so signed out this link went /` -> /home -> `/`, a round trip
          that lands you where you started and can flash the guarded page on the
          way. There is nowhere else useful to send a visitor either: `/` is
          where they already are on the one route this matters most.

          `=== true`, not truthy, so the mark is inert while the token check is
          still outstanding. A link that works for one frame and then stops is
          worse than one that was never offered.

          The static branch needs no aria-label: the lockup draws "Wagerwolf" as
          real text, so the name is already in the accessibility tree. On the
          link it stays, because there it has to say where the link GOES. */}
      <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", minWidth: 0 }}>
        {authed === true ? (
          <Link
            href="/home"
            aria-label="Wagerwolf home"
            className="tap-target"
            style={{ display: "flex", alignItems: "center", flexShrink: 0, color: "#FFFFFF" }}
          >
            <LogoWordmark height={LOCKUP_H} bare />
          </Link>
        ) : (
          <span style={{ display: "flex", alignItems: "center", flexShrink: 0, color: "#FFFFFF" }}>
            <LogoWordmark height={LOCKUP_H} bare />
          </span>
        )}
      </div>

      {/* Signed-out visitors only. The sentence is a pitch — it counts down to
          kickoff and exists to get someone to start playing — so showing it to
          someone who already has an account is selling them what they bought.
          They see the wordmark and their account link, nothing between.

          `authed === false`, not `!authed`, so it does not flash on during the
          token check and vanish a frame later. Same rule the lockup and the
          right-hand control follow.

          No onGetStarted any more, so the countdown renders its sentence and
          nothing else. Its trailing "Play now" link — and the invisible mirror
          that balanced it — existed when the bar had no right-hand CTA on this
          route. There is one on every route now, so the link was the second of
          two identical calls to action in a 40px bar. */}
      {isLanding && authed === false && <SeasonCountdown style={{ ...linkStyle, minWidth: 0 }} />}

      {/* Pushed to the far right: an account link is not wayfinding, so it
          reads better set apart from the others than appended to them. Its
          right edge is the bar's --rail padding, so it lands on the same edge
          as the nav's profile control below. */}
      <div
        ref={menuRef}
        style={{
          // Always the same width as the lockup slot opposite. On `/` that is
          // what puts the countdown between them on the bar's true centre
          // rather than the centre of the space left over; off it the two
          // slots just split the bar and this one ends on the right edge. No
          // minWidth: 0, so the control is never squashed narrower than its
          // own label.
          flex: "1 1 0",
          justifyContent: "flex-end",
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Nothing until the token check lands. Rendering either label as the
            default flashes the wrong one at half the audience — "My Account" at
            a visitor on the landing page, or "Play now" at a signed-in user
            on every page. An empty slot for one frame says nothing false. */}
        {/* One control, two states, on EVERY route including `/`. The landing
            page used to be an exception that rendered nothing here when signed
            out, because the countdown carried the call to action instead. The
            countdown's link is gone, so this is now the only way in — and an
            exception that leaves a visitor with no visible way to start is not
            one worth keeping. */}
        {authed === null ? null : authed === false ? (
          <button
            type="button"
            className="utility-link"
            style={ctaStyle}
            onClick={startSignup}
          >
            Play now{" "}
            {/* The same ↗ as /signup's "Log in". A real character, not an svg,
                so it inherits size, weight and colour — and the space before it
                is a real space rather than a margin, so the hover underline runs
                through it unbroken. */}
            <span aria-hidden="true">↗</span>
          </button>
        ) : (
        <button
          type="button"
          className="utility-link"
          style={ctaStyle}
          onClick={() => setOpen(o => !o)}
        >
          My account{" "}
          <span aria-hidden="true">↗</span>
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
