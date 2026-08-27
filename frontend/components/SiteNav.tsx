"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountMenu from "@/components/AccountMenu";
import LogoWordmark from "@/components/LogoWordmark";
import { useAuthed } from "@/lib/auth";
import { useDevicePixelRatio, snapToDevicePx } from "@/lib/hairline";

/**
 * The site's nav bar — wordmark left, one control cluster right.
 *
 * ON EVERY ROUTE, not just `/`. It began as LandingNav, mounted on the landing
 * page alone in the slot the games strip occupies elsewhere, and it is now the
 * bar carrying the mark and the account link across the whole app. The rename
 * is the point: a component called LandingNav sitting above a league's bet page
 * is a name that lies.
 *
 * Still not a second copy of LeagueNav, and still shares nothing with it: that
 * nav is wayfinding *within* a league — Home, Bet, My Bets — and sits below the
 * games strip, inside the page. This one is the app's own header.
 *
 * THE RIGHT-HAND SLOT HAS TWO STATES:
 *
 *  - signed out: "Sign in" and "Get started", the two front doors, drawn as
 *    .mx-btn cards
 *  - signed in: "My account" and its menu, drawn as plain type with the
 *    sweeping hover underline — see ACCOUNT_TYPE for why it is not a third card
 *
 * AND IT REPLACES THE UTILITY BAR IN THE SECOND STATE. TopBar is not rendered
 * at all once there is a token (see AppChrome). The account menu it used to
 * carry is the AccountMenu here — literally the same component — and the lockup
 * it used to carry, the one thing offering a route back to /home from inside a
 * league, is the lockup here, which points at /home for exactly that reason.
 * What is left of TopBar is the landing tagline, and a pitch shown to someone
 * who has already signed up is selling them what they bought.
 *
 * GLASS, like the games strip. The bar is translucent white over a blurred
 * backdrop, so content scrolling under it smears through and it reads as a pane
 * laid over the page rather than a bar cut out of it. NOTE that `/` is
 * currently a blank page, so there is nothing passing behind it and the bar
 * looks like plain white there — the effect turns up on its own once the
 * landing page has content.
 *
 * WHY THE STRIP IS NOT ON `/`. That is the one route with nothing to bet on —
 * no league, no balance, no slip — so a ticker of live odds there was showing
 * the product rather than selling it, and it pushed the actual entry points a
 * screen further down. AppChrome renders this bar alone there, and this bar
 * plus the strip everywhere else.
 */

// Taller than LeagueNav's 44. That nav is a dense strip of tabs inside the app;
// this one holds a lockup and a filled button and is the first thing a visitor
// sees, so it gets room. Not a token — LeagueNav's height is its own and the
// two should be free to move independently.
// 62, down from 68 — a shade under the 10% asked for, because the number is
// rounded to stay EVEN. Contents are centred with flex, so an odd height puts
// the centre line on a half pixel and Chrome cannot land a text baseline there;
// it is the same reason BAR_H in TopBar is pinned even. 61.2 was the exact 10%.
const NAV_H = 62;

// The lockup, sized to sit comfortably in NAV_H. Larger than the utility bar's
// (which is squeezed into a 40px bar) because this is the mark's main
// appearance on the page.
// 27, down from 30 — a 10% trim. `height` sizes the MARK; the name beside it
// follows through WORDMARK_FONT_RATIO (0.7), and the gap between them is keyed
// to the mark's drawn size, so this one number scales the whole lockup and its
// internal proportions hold. Nothing else needs adjusting.
const LOCKUP_H = 27;

// Above the games strip, which follows this bar in the DOM and would otherwise
// paint over the account menu hanging down into it. `backdrop-filter` already
// makes this element a stacking context, which puts it in the same painting
// layer as the strip and hands the tie to document order — so the panel's own
// z-index, being *inside* that context, cannot climb out of it. A number here
// lifts the whole bar instead. Below TopBar's 300, which sits above this one.
const NAV_Z = 200;

// "My account", the signed-in state of the right-hand slot. Type only — the
// control itself is AccountMenu, which carries .utility-link and so arrives
// with the button chrome already stripped and the hover underline attached.
//
// Size and weight match the two calls to action it replaces, so the slot does
// not change optical weight when the auth state flips. The colour is --text
// rather than the utility bar's white, and the underline follows it on its own
// because .utility-link::after paints in currentColor.
//
// NOT .mx-btn, and that is the point of the swap rather than a detail of it.
// "Sign in" and "Get started" are cards because they are the front door; an
// account link is not a call to action, it is where you already are, so a card
// would ask to be pressed with the same urgency as the two it replaced.
const ACCOUNT_TYPE: CSSProperties = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  fontWeight: 600,
  fontSize: "0.85rem",
  letterSpacing: "normal",
  textTransform: "none",
  lineHeight: "normal",
  whiteSpace: "nowrap",
  color: "var(--text)",
};

export default function SiteNav() {
  const router = useRouter();
  // Which controls the right-hand slot carries, and where the lockup points.
  // Signed in there is no utility bar above this one at all (see AppChrome), so
  // both the account link and the way back to /home live here or nowhere.
  const authed = useAuthed();
  // See the bottom rule below — a plain 1px border is not crisp here.
  const dpr = useDevicePixelRatio();

  return (
    <div
      style={{
        flexShrink: 0,
        height: NAV_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        // Fill is full-bleed, contents inset by --rail — the same contract
        // TopBar and .nav follow, so the wordmark here lands on the same left
        // edge as everything else in the chrome.
        padding: "0 var(--rail)",
        boxSizing: "border-box",
        // GLASS, the same treatment the games-strip cards use — see the
        // --glass-* tokens in globals.css for the full note.
        //
        // Two things this depends on, both currently true:
        //  - No opaque ancestor. backdrop-filter samples the element's real
        //    backdrop, and .app-chrome sets no background of its own, so what
        //    it finds is the page. Give .app-chrome a fill and this silently
        //    becomes flat white.
        //  - Something behind it to blur. The bar is sticky at the top of
        //    .app-scroll, so the effect appears as content scrolls under it and
        //    is invisible over a blank stretch. That is by design, but it does
        //    mean the landing page shows nothing until it has content — see the
        //    note in the component header.
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-filter)",
        WebkitBackdropFilter: "var(--glass-filter)",
        // The band is white on a white page, so the rule below is the only
        // thing marking where the chrome stops. Same reasoning as the league
        // nav's bottom hairline. It is a child element, not a border — see
        // below — hence `position: relative` here, which the account menu also
        // needs something to hang from.
        position: "relative",
        zIndex: NAV_Z,
      }}
    >
      {/* THE BOTTOM RULE, drawn as a filled element rather than a CSS border.

          There is no shadow here and never was. A `border-bottom: 1px` lands on
          a FRACTIONAL number of device pixels at any non-integer
          devicePixelRatio — 1.25 and 1.5 are the usual Windows display scalings
          — so the browser paints one solid device row plus a partial,
          reduced-opacity one beneath it. That soft second row is what reads as
          a shadow, and it is also why the line looks thicker than 1px.

          snapToDevicePx rounds the thickness to a whole number of device pixels,
          so it paints as exactly one crisp row at any scaling. Same treatment
          LeagueNav gives its hairlines; lib/hairline.ts carries the full note.

          --surface-2 (#F0F2F5), lighter again than the --surface-3 it replaced.
          Both come from the surface ramp because the border ramp has no step
          lighter than --border (#E2E8F0), and the value is what matters. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: snapToDevicePx(1, dpr),
          background: "var(--surface-2)",
        }}
      />

      {/* `bare` draws head and name in currentColor, so the lockup takes
          --text and reads as near-black type. The default variant would paint
          an accent panel behind it — right for a badge, wrong for a wordmark
          sitting on a white bar. Same call BarePageHeader makes.

          /home when signed in, `/` otherwise, and that is load bearing rather
          than tidy. LeagueNav's "Home" goes to the *league* home, so inside a
          league the mark is the only way out — the gap the utility bar's lockup
          used to close, inherited here now that the bar is gone. Signed out
          there is no /home to send anyone to: the guard in app/(user)/layout
          bounces a tokenless visitor straight back, a round trip that lands
          where it started and can flash the guarded page on the way.

          `=== true`, not truthy, so `/` is the target while the token check is
          still outstanding rather than a link that works for one frame and then
          stops. */}
      <Link
        href={authed === true ? "/home" : "/"}
        aria-label="Wagerwolf home"
        style={{ display: "inline-flex", alignItems: "center", color: "var(--text)", flexShrink: 0 }}
      >
        <LogoWordmark height={LOCKUP_H} bare />
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* SIGNED IN vs SIGNED OUT, and nothing at all in between.

            `authed` is null until the token check lands on the client, and
            defaulting to either state flashes the wrong one at half the
            audience — "Get started" at someone who already has an account, or
            an account link at a visitor. An empty slot for one frame says
            nothing false.

            The bar's HEIGHT does not depend on this, so nothing reflows when it
            resolves — only the control appears. That is why the swap lives here
            rather than in AppChrome deciding between two different bars.

            Signed in, this is the ONLY account control in the app: TopBar is
            not rendered at all once there is a token (see AppChrome). */}
        {authed === null ? null : authed ? (
          <AccountMenu style={ACCOUNT_TYPE} />
        ) : (
          <>
            {/* Sign in — a white card with a black border, drawn the same at
                rest as under the pointer. The pair is an outlined secondary
                next to a filled primary, which is the conventional way round
                and lets both be visible controls without competing.

                .mx-btn on both, with identical fontSize / fontWeight / padding,
                so the two are the same box and only the fill and border differ.

                The colours live in .landing-cta-outline rather than inline,
                because an inline background cannot express :hover at all — and
                the global `button:hover` rule is a filled accent PILL, so
                leaving the hover unclaimed does not mean "no hover", it means
                that. */}
            <button
              type="button"
              className="mx-btn landing-cta landing-cta-outline"
              onClick={() => router.push("/sign-in")}
              style={{ fontSize: "0.85rem", fontWeight: 600, padding: "7px 18px" }}
            >
              Sign in
            </button>

            {/* Get started — the accent rectangle. .mx-btn.is-primary already IS
                "blue rectangle, white text": accent fill, #FFFFFF label, with
                the accent-hover state attached. .landing-cta adds the 4px
                corner.

                fontWeight inline because .mx-btn pins 500 in its own rule and a
                class cannot out-specify another class. Geometry is kept
                identical to "Sign in" above BY HAND — if one moves, move both,
                or the ghost's hover stops matching this. */}
            <button
              type="button"
              className="mx-btn is-primary landing-cta"
              onClick={() => router.push("/signup")}
              style={{ fontSize: "0.85rem", fontWeight: 600, padding: "7px 18px" }}
            >
              Get started
            </button>
          </>
        )}
      </div>
    </div>
  );
}
