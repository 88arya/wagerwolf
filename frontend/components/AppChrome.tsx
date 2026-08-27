"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthed } from "@/lib/auth";
import { api } from "@/lib/api";
import GamesStrip from "@/components/GamesStrip";
import SiteNav from "@/components/SiteNav";
import TopBar from "@/components/TopBar";

/**
 * The chrome above every page, mounted once in the root layout. Three pieces,
 * only one of them unconditional:
 *
 *  - TopBar, the dark utility bar. `/` only, and only for someone who is not
 *    signed in. All it carries now is the tagline.
 *  - SiteNav, the white nav bar. EVERY route, both auth states. The lockup and
 *    the account menu used to live in TopBar and live here now.
 *  - GamesStrip. Every route but `/`.
 *
 * They used to be duplicated: the league layout rendered TopBar + GamesStrip,
 * and the (user) layout rendered GamesStrip + its own UserNav. That meant
 * crossing between /home and a league swapped one set for another and the two
 * could drift apart. Here there is one mount, so the bar and the strip survive
 * navigation instead of being torn down and rebuilt at the layout boundary.
 *
 * Returns a fragment, never a wrapper element: --rail resolves against the
 * containing block, and both consumers have to stay full-width children of
 * <body> for it to come out as the window width.
 */

// Which league's week the strip shows when the route does not name one.
// Remembered so the strip can start fetching on mount instead of waiting for
// /memberships to come back.
const STRIP_LEAGUE_KEY = "strip_league_id";

// The chrome is now on EVERY route, signed in or not — landing page included,
// which gave up its own sticky header rather than stack two. What used to be a
// blocklist is down to two pages that genuinely cannot carry it:
//
//  - (/onboarding was here. It is gone: sign-up is one screen now, and the
//    reach the app, and a nav bar out of it defeats that.
//  - /logo is the wordmark preview, where a second wordmark in the bar above
//    the specimens is just confusing.
//  - /signup and /sign-in carry their own wordmark top-left. With the bar on, that is two
//    wordmarks stacked with the games strip in between, on the one screen in
//    the app meant to be nothing but itself. The bar would also offer "Play
//    now" — a link to the page you are already on.
//
// Everything else works signed out: TopBar shows "Play now" instead of the
// account menu, and the strip falls back to /weeks/public/current, which needs
// no token.
//  - /settings and the three legal pages are bare too: each carries its own
//    BarePageHeader with the lockup and a Done button, so the utility bar
//    would be a second header above a page that already has one.
const NO_CHROME = ["/logo", "/signup", "/sign-in", "/settings", "/privacy", "/terms", "/responsible-gaming"];

function isPublicRoute(pathname: string) {
  return NO_CHROME.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

// `/leagues/<id>/…`. There is no longer a plain `/leagues` list page to
// exclude — it became the rail on /home — but the shape of the match is
// unchanged: a league route is the segment plus an id.
const LEAGUE_ROUTE = /^\/leagues\/([^/]+)/;

export default function AppChrome() {
  const pathname = usePathname() ?? "";
  const publicRoute = isPublicRoute(pathname);
  const isLanding = pathname === "/";
  const routeLeagueId = LEAGUE_ROUTE.exec(pathname)?.[1] ?? "";

  // Reactive, from lib/auth. This component is mounted once in the root layout
  // and never remounts, so a one-shot read left the strip scoped to the league
  // of whoever was signed in before — and left it there after a sign-out.
  const authed = useAuthed();
  const [fallbackLeagueId, setFallbackLeagueId] = useState("");
  // Until /memberships answers we don't know whether a strip belongs here, so
  // the strip holds its space. Once resolved with no started league it's
  // dropped entirely rather than leaving an empty bar.
  const [resolved, setResolved] = useState(false);
  const chromeRef = useRef<HTMLDivElement>(null);
  // The tagline bar's dismiss X (landing only — see the note on it in TopBar).
  //
  // State lives HERE rather than in TopBar because AppChrome mounts once in the
  // root layout and never remounts, so the choice survives navigation without
  // being written anywhere. Deliberately not localStorage: nothing in the UI
  // brings the bar back, so persisting it would be a one-way door. A reload
  // restores it.
  const [barDismissed, setBarDismissed] = useState(false);

  useEffect(() => {
    if (publicRoute) return;

    // Re-runs whenever `authed` flips, so signing in immediately looks up the
    // league to scope the strip to, and signing out drops back to public mode.
    if (authed === null) return;
    if (!authed) { setFallbackLeagueId(""); setResolved(true); return; }

    // The route already names the league, so there is nothing to look up — but
    // remember it as the fallback. Being inside a league is the strongest
    // signal about which week the strip should be showing, and without this,
    // leaving for /home swapped in whichever league happened to come first from
    // /memberships. That swap changes the leagueId prop, which refetches the
    // week, which replaces it, which visibly restarts the ticker.
    if (routeLeagueId) {
      setFallbackLeagueId(routeLeagueId);
      localStorage.setItem(STRIP_LEAGUE_KEY, routeLeagueId);
      setResolved(true);
      return;
    }

    const remembered = localStorage.getItem(STRIP_LEAGUE_KEY);
    if (remembered) { setFallbackLeagueId(remembered); setResolved(true); }

    api("/memberships").then((ms: any[]) => {
      const started = ms.filter((m: any) => m.league?.seasonStarted);
      // Keep the remembered league as long as it is still one the user is in
      // and it has started. Only fall back to "first started" when the
      // remembered one no longer qualifies — left the league, season not begun,
      // nothing remembered yet.
      const keep = remembered && started.some((m: any) => m.leagueId === remembered)
        ? remembered
        : started[0]?.leagueId ?? "";
      if (keep) {
        setFallbackLeagueId(keep);
        localStorage.setItem(STRIP_LEAGUE_KEY, keep);
      } else {
        setFallbackLeagueId("");
        localStorage.removeItem(STRIP_LEAGUE_KEY);
      }
    }).catch(() => {}).finally(() => setResolved(true));
  }, [publicRoute, routeLeagueId, authed]);

  // Publishes the chrome's rendered height as --chrome-h.
  //
  // The chrome now lives INSIDE .app-scroll, so it counts toward that
  // scroller's content. Without this, .page's `min-height: 100%` would be a
  // full viewport of page stacked under a full-height header, and every page —
  // however short — would carry the chrome's worth of dead scroll before
  // reaching the footer. .page subtracts this instead.
  //
  // Measured rather than hardcoded because the height is not constant: the
  // strip is absent on some routes and while it is still resolving, and it
  // collapses to its selector row when a week has no games.
  useEffect(() => {
    const el = chromeRef.current;
    const root = document.documentElement;
    if (!el) {
      root.style.setProperty("--chrome-h", "0px");
      return;
    }
    const write = () => root.style.setProperty("--chrome-h", `${el.getBoundingClientRect().height}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--chrome-h", "0px");
    };
  }, [publicRoute]);

  if (publicRoute) return null;

  // Signed out there is no league to scope to, so the strip runs in its public
  // mode: display-only cards from the league-agnostic week. It is no longer
  // hidden — that was when its only data source needed a token.

  // Inside a league a card is a shortcut to that game's bet page; outside one
  // there is no league to bet in, so the cards are display only.
  //
  // THE UTILITY BAR IS THE LANDING PITCH, AND NOTHING ELSE NOW.
  //
  // It used to be the app's header on every route: lockup left, account menu
  // right. Both of those moved down into SiteNav, which is on every route too
  // and can carry them at a size that is not squeezed into 40px — so the bar
  // was left holding one thing, the tagline it shows on `/`. That is a pitch,
  // and a pitch has an audience of exactly one kind of person.
  //
  // Hence both halves of the condition:
  //
  //  - `isLanding`, because off `/` the bar renders nothing at all but two
  //    empty flex slots. It was already blank there in everything but height.
  //  - `authed !== true`, because someone who has signed up is being sold what
  //    they already bought. `!== true` rather than `=== false` so the bar is
  //    up on the first frame: a visitor is the common case on `/`, and the
  //    signed-in one is redirected to /home by SignedOutOnly anyway.
  const showTopBar = !barDismissed && isLanding && authed !== true;

  const interactive = Boolean(routeLeagueId) && authed !== false;
  const leagueId = authed === false ? "" : (routeLeagueId || fallbackLeagueId);
  const showStrip = authed === false || interactive || !resolved || Boolean(fallbackLeagueId);

  return (
    // One sticky wrapper rather than two sticky siblings. Stacking two would
    // mean the strip's `top` had to equal the bar's height — a constant in
    // TopBar.tsx that CSS would have to be kept in step with by hand.
    //
    // This is also what fixes the rail mismatch: --rail's `100%` used to
    // resolve against <body> for the chrome and against .app-scroll for the
    // page, which put the page's right edge a scrollbar's width inboard of the
    // nav's. Both sit inside the same scroller now, so both edges agree.
    <div ref={chromeRef} className="app-chrome">
      {/* --chrome-h is measured off this wrapper by the ResizeObserver above,
          so dropping the bar reflows .page's min-height on its own. */}
      {showTopBar && <TopBar onDismiss={() => setBarDismissed(true)} />}

      {/* UNCONDITIONAL. SiteNav is the app's header on every route in both auth
          states — it carries the lockup, and it carries either the two front
          doors or the account menu. Nothing about it is route-dependent, which
          is what lets the chrome keep a stable height while `authed` resolves:
          only the control inside the slot appears, the bar itself never
          arrives or leaves.

          It was LandingNav, mounted here on `/` alone. */}
      <SiteNav />

      {/* The strip is a ticker of live odds for a league you are in. On `/`
          there is no league, nothing to bet on and no slip, so it was showing
          the product instead of selling it — and it pushed the entry points a
          screen down. Everywhere else it sits under the nav as before. */}
      {!isLanding && showStrip && <GamesStrip leagueId={leagueId} interactive={interactive} />}
    </div>
  );
}
