"use client";

/**
 * /home, as three regions inside the content card: Inbox | the week | Friends.
 *
 * The shape is borrowed deliberately, and the important part of the borrowing
 * is WHICH regions are cards:
 *
 * - **Left is a column, not a card.** A list you scan is a region of the page.
 *   Boxing it draws a border around something whose edge is already the page's
 *   edge, and the vertical hairline does that job with one line instead of
 *   four.
 * - **Centre is plain.** It is the content; content does not need a container
 *   to say it is the content. The cards *inside* it are cards because each one
 *   is a separate fact, not because the column needs a frame.
 * - **Right IS cards.** Discrete objects sitting beside the content rather than
 *   part of its flow, each under its own uppercase micro-label.
 *
 * ONE SCREEN, NO WEEK TOGGLE. There was a This week / Last week control at the
 * top of the centre column — first two chips, then a segmented control, then a
 * dropdown — and all three had the same problem: the two halves are not
 * alternatives. Nobody arrives wanting to see EITHER how last week finished OR
 * what is being bet now; they want both, and a control that hides one behind
 * the other turns a glance into two clicks. Stacked, the column reads top to
 * bottom as a week.
 *
 * The order is deliberate at both ends. Power rankings opens because it is
 * about you and it is a result. Still to bet closes because it is the only card
 * that asks for anything, and the last thing on a page should be the thing to
 * do next.
 *
 * BOTH FETCHES LIVE HERE. /home/pulse feeds the two grids in the middle and
 * /home/leagues feeds the two cards around them; each is requested once and
 * handed down. The children used to fetch for themselves, which was fine while
 * each appeared once — but Power rankings and Still to bet are the same list
 * read two ways, so self-fetching children would run /home/leagues twice per
 * visit.
 *
 * The three columns do NOT scroll independently. `.app-card` is the scroller
 * for the whole shell and one scrollport is easier to reason about than three.
 *
 * /home does not use `.page-wide`. That padding would inset the left column
 * from the card's edge, and a flush column with a rule down its right side is
 * the entire visual idea here.
 */

import { useEffect, useState } from "react";
import InboxColumn from "./InboxColumn";
import PowerRankings, { type LeagueRow } from "./PowerRankings";
import PulseCards, { type Pulse } from "./PulseCards";
import FriendsCard from "./FriendsCard";
import { api } from "@/lib/api";
import { getCached, setCached } from "@/lib/pageCache";

const PULSE_KEY = "home:pulse";
const LEAGUES_KEY = "home:leagues";

export default function HomeBoard() {
  const [pulse, setPulse] = useState<Pulse | undefined>(() => getCached<Pulse>(PULSE_KEY));
  const [leagues, setLeagues] = useState<LeagueRow[] | undefined>(
    () => getCached<LeagueRow[]>(LEAGUES_KEY),
  );
  const [pulseError, setPulseError] = useState(false);
  const [leaguesError, setLeaguesError] = useState(false);

  // Stale-while-revalidate through lib/pageCache: a return to /home paints the
  // last numbers immediately and refreshes underneath, rather than showing a
  // loading block every visit. Same treatment /mybets and /history get. No
  // league id in either key — one has no league, the other spans all of them.
  useEffect(() => {
    let live = true;

    // limit=1: each card shows exactly one entity, so anything past the leader
    // would be fetched and thrown away. The endpoint defaults to 5 and caps at
    // 10 — raise this at the same time as anything that wants a second row.
    api("/home/pulse?limit=1")
      .then((data: Pulse) => {
        if (!live) return;
        setCached(PULSE_KEY, data);
        setPulse(data);
      })
      .catch(() => { if (live) setPulseError(true); });

    api("/home/leagues")
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

      {/* Nothing but the Inbox column's hairline, carried to the bottom of the
          card. The three columns share a content-height row so the Friends card
          stops level with the last card in the centre; this sits in the filler
          row underneath so the rule does not stop with them. See .hb. */}
      <div className="hb-rule" aria-hidden="true" />
    </div>
  );
}
