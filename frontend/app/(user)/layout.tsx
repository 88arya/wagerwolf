"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import GamesStrip from "@/components/GamesStrip";
import UserNav from "@/components/UserNav";

// Which league's week the strip shows out here. Remembered so the strip can
// start fetching on mount instead of waiting for /memberships to come back —
// a league page gets its id from the route and needs only one round trip, and
// this closes that gap.
const STRIP_LEAGUE_KEY = "strip_league_id";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [weekLeagueId, setWeekLeagueId] = useState("");
  // Until /memberships answers we don't know whether a strip belongs here, so
  // the strip holds its space. Once resolved with no started league it's
  // dropped entirely rather than leaving an empty bar.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    const remembered = localStorage.getItem(STRIP_LEAGUE_KEY);
    if (remembered) { setWeekLeagueId(remembered); setResolved(true); }

    api("/memberships").then((ms: any[]) => {
      const started = ms.find((m: any) => m.league?.seasonStarted);
      if (started) {
        setWeekLeagueId(started.leagueId);
        localStorage.setItem(STRIP_LEAGUE_KEY, started.leagueId);
      } else {
        setWeekLeagueId("");
        localStorage.removeItem(STRIP_LEAGUE_KEY);
      }
    }).catch(() => {}).finally(() => setResolved(true));
  }, []);

  return (
    <>
      {(!resolved || weekLeagueId) && <GamesStrip leagueId={weekLeagueId} interactive={false} />}
      <UserNav />
      {children}
    </>
  );
}
