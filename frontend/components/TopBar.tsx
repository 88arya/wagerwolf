"use client";

import type { CSSProperties } from "react";

/**
 * The landing page's tagline bar — a thin dark strip above the nav carrying one
 * sentence and an X to dismiss it. That is the whole component now.
 *
 * IT USED TO BE THE APP'S HEADER, on every route and in both auth states: the
 * lockup on the left, this sentence in the middle on `/`, and one control on
 * the right with two states — "My account" with its menu, or "Play now" for a
 * visitor.
 *
 * All of that moved into SiteNav, which is likewise on every route, is 62px
 * rather than 40, and can hold a mark and a control without squeezing either.
 * Two bars each carrying a wordmark and a call to action, stacked 40px apart,
 * was the same furniture twice. What is left here is the one thing SiteNav
 * has no place for: a sentence selling the product.
 *
 * WHICH IS WHY APPCHROME RENDERS IT ON `/` ALONE, AND ONLY WHEN SIGNED OUT.
 * Off the landing route the sentence has no business appearing, and to someone
 * who has already signed up it is selling them what they bought. See the
 * `showTopBar` note in AppChrome for the exact condition.
 *
 * Things that lived here and where they went:
 *
 *  - the lockup, and its link to /home — SiteNav, which is now the only route
 *    back out of a league, the gap this bar's lockup used to cover
 *  - "My account" and its dropdown — components/AccountMenu, rendered by
 *    SiteNav's right-hand slot
 *  - "Play now" -> /signup — SiteNav's "Get started", beside "Sign in"
 *  - SeasonCountdown, which this sentence replaced. That file is still in the
 *    tree and nothing imports it: it read "The countdown begins — 20d 01h 55m
 *    56s until the first game of the 2026-27 NFL season" and pulled
 *    GET /weeks/public/current on every landing view to compute it. This says
 *    what the product IS rather than when it starts, needs no request, and
 *    cannot go stale once the season is under way.
 */

// --header-bg, which is the bar's alone. It used to be --bar-bg, shared with
// SiteFooter so the two bars bookending the app could not drift apart; they are
// now deliberately different — true black up here, #272731 down there.
const BAR_BG = "var(--header-bg)";

// The bar's dark fill is full-bleed, but its *contents* inset by --rail — the
// same token `.nav` and SiteNav use, so the sentence starts no further in than
// the page content below it. See --rail in globals.css.
//
// GamesStrip is the deliberate exception in the chrome: it runs full-bleed
// contents and all, and is not meant to line up with either.

// KEEP THIS EVEN. Chrome snaps text baselines to whole *device* pixels, and an
// odd bar height puts the centre on a half pixel, which the baseline can never
// sit on. At 37 that cost ~0.5px: the type sat visibly high against the wolf
// mark next to it, which is vector and renders at its true subpixel position.
//
// The mark is gone from this bar, so that particular symptom cannot recur — but
// the reason holds for any centred text, which is all this bar has left.
const BAR_H = 40;

// 14px, which is what LOCKUP_H (20) x WORDMARK_FONT_RATIO (0.7) came to back
// when this bar carried the lockup and everything on it was sized off the
// mark's own text. There is no mark here any more, so the derivation is
// recorded rather than computed: the number is the design decision now, and
// importing LogoWordmark for a ratio would be a dependency on nothing.
const TEXT_PX = 14;

// The UI face at the design system's 500 ceiling. The sentence is running text,
// which wants the body face rather than a display one.
const linkStyle: CSSProperties = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "normal",
  textTransform: "none",
  lineHeight: "normal",
  display: "inline-block",
  whiteSpace: "nowrap",
  fontSize: TEXT_PX,
  color: "#FFFFFF",
};

// The dismiss X. 600 rather than 500 for the same reason the bar's controls
// used to be: white on a dark fill thins, and this is a 11px glyph.
const ctaStyle: CSSProperties = {
  ...linkStyle,
  fontWeight: 600,
};

export default function TopBar({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div style={{
      flexShrink: 0,
      background: BAR_BG,
      height: BAR_H,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // Fill stays full-bleed; only the contents inset. Same token as `.nav`.
      padding: "0 var(--rail)",
      boxSizing: "border-box",
      // What the dismiss X is positioned against — see the note on it below.
      position: "relative",
      // Above SiteNav's 200 and the games strip under it. Nothing hangs off
      // this bar any more, but it is the topmost band and should stay so.
      zIndex: 300,
    }}>
      {/* THE TAGLINE. A plain sentence, not a link and not a countdown.

          "Play now" here is TEXT, not a control. The bar's clickable CTA was
          removed deliberately: the two real entry points are "Sign in" and
          "Get started" in SiteNav directly below. If this should become a link
          again, say so — but note it would be a third call to action within
          about 60px of the other two.

          Centred by `justify-content` rather than by a pair of empty flex
          spacers. The spacers were load bearing when the bar had a lockup on
          one side and a control on the other and the sentence had to sit on the
          bar's TRUE centre rather than the centre of the space left over. With
          both of those gone the sentence is the only child, and centring it is
          just centring it. */}
      <span style={{ ...linkStyle, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        Play now for completely free &mdash; The World&rsquo;s First Fantasy Football Sportsbook.
      </span>

      {/* DISMISS.

          A DIRECT CHILD OF THE BAR, and that placement is the whole point. It
          used to sit inside the right-hand control slot, which carried
          `position: relative` of its own so the account menu could hang off it
          — so `right: 8px` resolved against THAT box, a ~363px column ending at
          the content rail, and the button parked ~386px short of the window
          edge. An absolutely positioned element answers to its nearest
          positioned ancestor, not to the one you meant.

          Out here the nearest positioned ancestor is the bar itself, which is
          full-bleed, so `right` is a real distance from the window edge.

          Session-scoped — AppChrome holds the state, so it survives navigation
          but a reload restores the bar. There is no UI to un-dismiss it, so
          persisting the choice would be a one-way door. */}
      {onDismiss && (
        <button
          type="button"
          // NOT .utility-link. That class exists only to draw the sweeping
          // hover underline under a word, and an underline beneath an icon
          // is a rule floating under a glyph rather than an underline of
          // anything. .tap-target is kept — it is the 44px hit area.
          className="tap-target"
          aria-label="Hide the tagline bar"
          title="Hide"
          onClick={onDismiss}
          style={{
            ...ctaStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
            padding: 0,
            // ABSOLUTE, against the bar, and NOT a negative margin cancelling
            // --rail.
            //
            // That is the bug this replaced, and it is worth stating because
            // the idiom looks correct: --rail is
            // `max(20px, calc((100% - 1220px) / 2))`, and a custom property
            // is substituted as raw tokens, so the `100%` inside it resolves
            // against WHOEVER USES IT rather than against wherever it was
            // defined. On TopBar's own padding, 100% is the bar's containing
            // block — the window — and the rail comes out around 146px at a
            // 1512px viewport. On a nested element, 100% is that element's
            // containing block instead, where the same expression clamps to
            // its 20px floor. `calc(4px - var(--rail))` therefore pulled the
            // button 16px rather than the ~142px needed to reach the edge, and
            // looked like a value that was simply too small.
            //
            // A DELIBERATE break from the rule that the bar's contents align
            // to --rail: a dismiss control is not content. It belongs to the
            // window edge, the way a banner's close button does.
            position: "absolute",
            right: 20,
            top: 0,
            bottom: 0,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          {/* Two crossed strokes rather than a "✕" glyph: the character's
              size and vertical centring vary by font, and this bar is 40px
              with a baseline already tuned to the device pixel. */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
               aria-hidden="true">
            <path d="M5 5 L19 19 M19 5 L5 19" />
          </svg>
        </button>
      )}
    </div>
  );
}
