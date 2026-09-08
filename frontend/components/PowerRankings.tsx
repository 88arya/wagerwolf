"use client";

/**
 * Your leagues, read at either end of the week.
 *
 * TWO CARDS FROM ONE LIST, and they bookend the page:
 *
 * - `rankings` — where you stand and the move the last resolve caused. A green
 *   rise, a red fall, a grey rule for no change. Opens the column.
 * - `todo` — the leagues with allowance still sitting unbet. Balance resets
 *   every week, so anything unstaked at kickoff is simply gone; this says so
 *   before it happens. Closes the column.
 *
 * PRESENTATIONAL. HomeBoard does the fetching and hands the same rows to both,
 * because they are the same rows — mounting two self-fetching copies would run
 * /home/leagues twice per visit to render one list at two ends of a page.
 *
 * Ranks come from the server, computed by services/standings.ts — the same
 * tally and comparator the league's own leaderboard uses. Nothing is ranked on
 * this side.
 */

import Link from "next/link";
import { fmtMoney } from "@/lib/money";

export type LeagueRow = {
  leagueId: string;
  leagueName: string;
  members: number;
  rank: number;
  prevRank: number;
  change: number;
  ranked: boolean;
  balance: number;
  betsThisWeek: number;
};

const ORDINAL = (n: number) => {
  // 11th–13th are the exceptions every naive implementation gets wrong.
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/**
 * The movement mark: a rise, a fall, or a rule.
 *
 * Colour is doing the work here, so the SHAPE has to carry it too — an up and a
 * down chevron differ by more than their fill, and the no-change case is a flat
 * rule rather than a grey chevron. Someone who cannot separate the red from the
 * green still reads three different marks.
 */
function Move({ change, ranked }: { change: number; ranked: boolean }) {
  if (!ranked || change === 0) {
    return (
      <span className="pr-move is-flat" title={ranked ? "No change" : "No resolved week yet"}>
        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
          <path d="M2.5 6.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="pr-move-n">—</span>
      </span>
    );
  }
  const up = change > 0;
  return (
    <span className={`pr-move ${up ? "is-up" : "is-down"}`} title={`${up ? "Up" : "Down"} ${Math.abs(change)}`}>
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <path
          d={up ? "M6.5 2.6 11 8.2H2z" : "M6.5 10.4 2 4.8h9z"}
          fill="currentColor"
        />
      </svg>
      <span className="pr-move-n">{Math.abs(change)}</span>
    </span>
  );
}

export default function PowerRankings({
  rows, mode, error,
}: {
  rows: LeagueRow[] | undefined;
  mode: "rankings" | "todo";
  error: boolean;
}) {
  // On `todo` the card is a to-do list, so a league with nothing left to stake
  // has nothing to say and drops out. On `rankings` every league is a result
  // and they all stay.
  const shown = mode === "todo" ? (rows ?? []).filter((r) => r.balance > 0) : (rows ?? []);

  return (
    <div className="hp-card is-wide">
      <div className="section-title hb-card-head">
        {mode === "todo" ? "Still to bet" : "Power rankings"}
      </div>

      {!rows ? (
        <div className="hp-empty">{error ? "Could not load your leagues." : "Loading…"}</div>
      ) : shown.length === 0 ? (
        <div className="hp-empty">
          {rows.length === 0
            ? "No started leagues yet. Join or create one from the sidebar."
            : mode === "todo"
              ? "Nothing left to stake — every league's allowance is in play."
              : "No standings yet."}
        </div>
      ) : (
        <ul className="pr-rows">
          {shown.map((r) => (
            <li key={r.leagueId} className="pr-row">
              <Link href={`/leagues/${r.leagueId}`} className="pr-league">{r.leagueName}</Link>

              {mode === "rankings" ? (
                <span className="pr-side">
                  <span className="pr-rank">
                    {ORDINAL(r.rank)}<span className="pr-of"> of {r.members}</span>
                  </span>
                  <Move change={r.change} ranked={r.ranked} />
                </span>
              ) : (
                <span className="pr-side">
                  <span className="pr-meta">
                    {r.betsThisWeek} {r.betsThisWeek === 1 ? "bet" : "bets"} placed
                  </span>
                  <span className="pr-balance">{fmtMoney(r.balance)} left</span>
                  <Link href={`/leagues/${r.leagueId}/bet`} className="pr-cta">Bet</Link>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
