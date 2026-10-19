"use client";

import { useEffect, useState } from "react";
import InboxColumn from "./InboxColumn";
import PowerRankings, { type LeagueRow } from "./PowerRankings";
import PulseCards, { type Pulse } from "./PulseCards";
import FriendsCard from "./FriendsCard";
import { api } from "@/lib/api";
import { getCached, readCached, setCached } from "@/lib/pageCache";

const PULSE_KEY = "home:pulse";
const LEAGUES_KEY = "home:leagues";

export default function HomeBoard() {
  const [pulse, setPulse] = useState<Pulse | undefined>(() => getCached<Pulse>(PULSE_KEY));
  const [leagues, setLeagues] = useState<LeagueRow[] | undefined>(
    () => getCached<LeagueRow[]>(LEAGUES_KEY),
  );
  const [pulseError, setPulseError] = useState(false);
  const [leaguesError, setLeaguesError] = useState(false);

  useEffect(() => {
    let live = true;

    const warmPulse = readCached<Pulse>(PULSE_KEY);
    const warmLeagues = readCached<LeagueRow[]>(LEAGUES_KEY);
    if (warmPulse) setPulse(warmPulse);
    if (warmLeagues) setLeagues(warmLeagues);

    api("/home/pulse?limit=1", undefined, { gate: !warmPulse })
      .then((data: Pulse) => {
        if (!live) return;
        setCached(PULSE_KEY, data);
        setPulse(data);
      })
      .catch(() => { if (live) setPulseError(true); });

    api("/home/leagues", undefined, { gate: !warmLeagues })
      .then((data: LeagueRow[]) => {
        if (!live) return;
        setCached(LEAGUES_KEY, data);
        setLeagues(data);
      })
      .catch(() => { if (live) setLeaguesError(true); });

    return () => { live = false; };
  }, []);

  return (
    <div className="hb">
      <InboxColumn />

      <section className="hb-center">
        <div className="hb-col-body">
          <PowerRankings rows={leagues} mode="rankings" error={leaguesError} />
          <PulseCards pulse={pulse} which="current" error={pulseError} />
          <PulseCards pulse={pulse} which="last" error={pulseError} />
          <PowerRankings rows={leagues} mode="todo" error={leaguesError} />
        </div>
      </section>

      <aside className="hb-right">
        <FriendsCard />
      </aside>

      <div className="hb-rule" aria-hidden="true" />
    </div>
  );
}
