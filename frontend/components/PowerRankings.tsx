"use client";

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
