"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthed } from "@/lib/auth";
import { api } from "@/lib/api";
import GamesStrip from "@/components/GamesStrip";
import TopBar from "@/components/TopBar";

/**
 * The two pieces of chrome that belong to every signed-in page — the utility
 * bar and the games strip — mounted once in the root layout.
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
//  - /onboarding is a gate. The whole point is that you finish it before you
//    reach the app, and a nav bar out of it defeats that.
//  - /logo is the wordmark preview, where a second wordmark in the bar above
//    the specimens is just confusing.
//
// Everything else works signed out: TopBar shows "Play now" instead of the
// account menu, and the strip falls back to /weeks/public/current, which needs
// no token.
const NO_CHROME = ["/onboarding", "/logo"];

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
      <TopBar />
      {showStrip && <GamesStrip leagueId={leagueId} interactive={interactive} />}
    </div>
  );
}
