"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthed } from "@/lib/auth";
import { api } from "@/lib/api";
import GamesStrip from "@/components/GamesStrip";
import SiteNav from "@/components/SiteNav";
import TopBar from "@/components/TopBar";
import type { MyMembership } from "@/lib/types";

// Last league the user was in; the strip falls back to it outside league routes.
const STRIP_LEAGUE_KEY = "strip_league_id";

const NO_CHROME = ["/logo", "/signup", "/sign-in", "/auth", "/settings", "/docs"];

function isPublicRoute(pathname: string) {
  return NO_CHROME.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

const LEAGUE_ROUTE = /^\/leagues\/([^/]+)/;

export default function AppChrome() {
  const pathname = usePathname() ?? "";
  const publicRoute = isPublicRoute(pathname);
  const isLanding = pathname === "/";
  const routeLeagueId = LEAGUE_ROUTE.exec(pathname)?.[1] ?? "";

  // Mounted once and never remounts, so auth state has to be reactive.
  const authed = useAuthed();
  const [fallbackLeagueId, setFallbackLeagueId] = useState("");
  const [resolved, setResolved] = useState(false);
  const chromeRef = useRef<HTMLDivElement>(null);
  const [barDismissed, setBarDismissed] = useState(false);

  useEffect(() => {
    if (publicRoute) return;

    if (authed === null) return;
    if (!authed) { setFallbackLeagueId(""); setResolved(true); return; }

    // Remember the league so leaving it doesn't swap the strip and restart the ticker.
    if (routeLeagueId) {
      setFallbackLeagueId(routeLeagueId);
      localStorage.setItem(STRIP_LEAGUE_KEY, routeLeagueId);
      setResolved(true);
      return;
    }

    const remembered = localStorage.getItem(STRIP_LEAGUE_KEY);
    if (remembered) { setFallbackLeagueId(remembered); setResolved(true); }

    api<MyMembership[]>("/memberships").then((ms) => {
      const started = ms.filter((m) => m.league?.seasonStarted);
      const keep = remembered && started.some((m) => m.leagueId === remembered)
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

  useEffect(() => {
    // Publishes the chrome height as --chrome-h for .page min-height.
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

  const showTopBar = !barDismissed && isLanding && authed !== true;

  const interactive = Boolean(routeLeagueId) && authed !== false;
  const leagueId = authed === false ? "" : (routeLeagueId || fallbackLeagueId);
  const showStrip = authed === false || interactive || !resolved || Boolean(fallbackLeagueId);

  return (
    <div ref={chromeRef} className="app-chrome">
      {showTopBar && <TopBar onDismiss={() => setBarDismissed(true)} />}

      <SiteNav />

      {!isLanding && showStrip && <GamesStrip leagueId={leagueId} interactive={interactive} />}
    </div>
  );
}
