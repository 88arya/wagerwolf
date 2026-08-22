"use client";

import React from "react";
import { fmtMoney } from "@/lib/money";
import { BetHeader, BetRows, gameLineSubtitle, gameLineTitle, titleCase, type BetRow } from "./BetRows";

// A placed bet (prop pick, game pick, or parlay) rendered in the bet slip's
// visual language: count badge + label + total odds, then the same grouped leg
// rows with the left rail, then a footer with stake / result. Used by My Bets
// and History so a settled bet reads the same as it did in the slip.

export type BetKind = "pick" | "gamepick" | "parlay";

function calcProfit(stake: number, odds: number): number {
  if (odds > 0) return Math.round((stake * odds) / 100);
  return Math.round((stake * 100) / Math.abs(odds));
}

function gameStarted(gameDate?: string): boolean {
  if (!gameDate) return true;
  return new Date(gameDate) <= new Date();
}

function outcomeColor(outcome: string, cashedOut?: boolean): string {
  if (outcome === "WIN") return "var(--win)";
  if (outcome === "LOSS") return "var(--loss)";
  if (outcome === "PENDING") return "var(--pending)";
  if (outcome === "VOID" && cashedOut) return "var(--pending)";
  // PUSH and an uncashed VOID are both stake-returned, no P&L — deliberately
  // neutral rather than borrowing the win or loss colour.
  return "var(--text-3)";
}

function OutcomeBadge({ outcome, cashedOut }: { outcome: string; cashedOut?: boolean }) {
  const label = outcome === "VOID" && cashedOut ? "CASHED" : outcome;
  if (label === "WIN") return <span className="badge badge-green">WIN</span>;
  if (label === "LOSS") return <span className="badge badge-red">LOSS</span>;
  if (label === "CASHED") return <span className="badge" style={{ color: "var(--pending)", borderColor: "rgba(245,158,11,0.3)", background: "var(--pending-bg)" }}>CASHED</span>;
  if (label === "PENDING") return <span className="badge badge-yellow">PENDING</span>;
  // PUSH: the result landed exactly on the line and the stake came back.
  if (label === "PUSH") return <span className="badge" style={{ color: "var(--text-2)" }}>PUSH</span>;
  return <span className="badge">{label}</span>;
}

/**
 * Per-leg status marker. Sits in the rail gutter where the slip puts its remove
 * button, and carries a surface-coloured ring so it breaks the rail line the
 * same way that button does.
 */
function OutcomeDot({ outcome }: { outcome?: string }) {
  if (!outcome) return null;
  return (
    <span style={{
      background: "var(--surface)",
      borderRadius: "50%",
      padding: 3,
      lineHeight: 0,
      display: "flex",
    }}>
      <span style={{
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: outcomeColor(outcome),
      }} />
    </span>
  );
}

function CashOutBtn({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      style={{
        padding: "3px 9px", borderRadius: "var(--radius-sm)", fontSize: "0.68rem",
        fontWeight: 700, background: "none", border: "1px solid var(--border-2)",
        color: "var(--text-2)", cursor: "pointer", boxShadow: "none",
      }}>
      {busy ? "…" : "Cash Out"}
    </button>
  );
}

/** Prop leg subtitle, matching the slip: "Over 37.5 Passing Yards". */
function propSubtitle(direction?: string, line?: number | null, statType?: string): string {
  const dir = direction === "OVER" ? "Over" : direction === "UNDER" ? "Under" : "";
  return `${dir} ${line ?? ""} ${statType ? titleCase(statType) : ""}`.trim();
}

/** The line actually taken: the alt line if the bet was on one, else the main line. */
function takenLine(altLine: number | null | undefined, line: number | null | undefined) {
  return altLine ?? line;
}

interface Normalized {
  count: number;
  label: string;
  totalOdds: number;
  stake: number;
  /** Profit if settled as a win, loss amount if settled as a loss, else null. */
  settled: number | null;
  toWin: number;
  rows: BetRow[];
  firstGameDate?: string;
}

function normalize(kind: BetKind, data: any): Normalized {
  if (kind === "pick") {
    const odds = data.odds ?? -110;
    const stake = Number(data.stake);
    const game = data.prop?.game;
    return {
      count: 1,
      label: "Straight",
      totalOdds: odds,
      stake,
      settled: data.outcome === "WIN" ? calcProfit(stake, odds)
             : data.outcome === "LOSS" ? -stake
             : data.outcome === "PUSH" ? 0 : null,
      toWin: calcProfit(stake, odds),
      firstGameDate: game?.gameDate,
      rows: [{
        key: data.id,
        title: data.prop?.player?.name ?? "—",
        subtitle: propSubtitle(data.direction, data.altLine ?? data.prop?.line, data.prop?.statType),
        odds,
        gameId: game?.id,
        gameDate: game?.gameDate,
        homeTeam: game?.homeTeam,
        awayTeam: game?.awayTeam,
        gutter: <OutcomeDot outcome={data.outcome} />,
      }],
    };
  }

  if (kind === "gamepick") {
    const odds = data.odds;
    const stake = Number(data.stake);
    const game = data.gameLine?.game;
    return {
      count: 1,
      label: "Straight",
      totalOdds: odds,
      stake,
      settled: data.outcome === "WIN" ? calcProfit(stake, odds)
             : data.outcome === "LOSS" ? -stake
             : data.outcome === "PUSH" ? 0 : null,
      toWin: calcProfit(stake, odds),
      firstGameDate: game?.gameDate,
      rows: [{
        key: data.id,
        title: gameLineTitle({
          market: data.gameLine?.market,
          line: takenLine(data.altLine, data.gameLine?.line),
          homeTeam: game?.homeTeam,
          awayTeam: game?.awayTeam,
          label: data.gameLine?.label,
        }),
        subtitle: gameLineSubtitle(data.gameLine?.market),
        odds,
        gameId: game?.id,
        gameDate: game?.gameDate,
        homeTeam: game?.homeTeam,
        awayTeam: game?.awayTeam,
        gutter: <OutcomeDot outcome={data.outcome} />,
      }],
    };
  }

  const stake = Number(data.stake);
  const payout = Number(data.payout);
  const legs = data.legs ?? [];
  return {
    count: legs.length,
    label: `${legs.length}-Leg Parlay`,
    totalOdds: data.totalOdds,
    stake,
    settled: data.outcome === "WIN" ? payout - stake
           : data.outcome === "LOSS" ? -stake
           : data.outcome === "PUSH" ? 0 : null,
    toWin: payout - stake,
    // Matches the pre-existing cash-out rule: gated on the first leg's game.
    firstGameDate: (legs[0]?.prop?.game ?? legs[0]?.gameLine?.game)?.gameDate,
    rows: legs.map((leg: any, i: number) => {
      const game = leg.prop?.game ?? leg.gameLine?.game;
      return {
        key: `${data.id}-${i}`,
        title: leg.prop
          ? (leg.prop.player?.name ?? "—")
          : gameLineTitle({
              market: leg.gameLine?.market,
              line: takenLine(leg.altLine, leg.gameLine?.line),
              homeTeam: game?.homeTeam,
              awayTeam: game?.awayTeam,
              label: leg.gameLine?.label,
            }),
        subtitle: leg.prop
          ? propSubtitle(leg.direction, leg.altLine ?? leg.prop.line, leg.prop.statType)
          : gameLineSubtitle(leg.gameLine?.market),
        odds: leg.odds,
        gameId: game?.id,
        gameDate: game?.gameDate,
        homeTeam: game?.homeTeam,
        awayTeam: game?.awayTeam,
        gutter: <OutcomeDot outcome={leg.outcome} />,
      };
    }),
  };
}

export default function PlacedBetCard({
  kind, data, cashingOut, onCashOut,
}: {
  kind: BetKind;
  data: any;
  cashingOut?: string | null;
  onCashOut?: (kind: BetKind, id: string) => void;
}) {
  const bet = normalize(kind, data);
  const canCashout = data.outcome === "PENDING" && !data.cashedOut && !gameStarted(bet.firstGameDate);

  return (
    <div style={{
      background: "var(--surface)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      <BetHeader count={bet.count} label={bet.label} odds={bet.totalOdds} />

      <BetRows rows={bet.rows} />

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "10px 14px",
      }}>
        <div style={{
          display: "flex", gap: 12, minWidth: 0, flexWrap: "wrap",
          fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums",
        }}>
          <span>
            Stake <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{fmtMoney(bet.stake)}</span>
          </span>
          {bet.settled != null ? (
            <span style={{ color: bet.settled >= 0 ? "var(--win)" : "var(--loss)", fontWeight: 700 }}>
              {fmtMoney(bet.settled, { sign: true })}
            </span>
          ) : (
            <span>
              To win <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{fmtMoney(bet.toWin)}</span>
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {canCashout && onCashOut && (
            <CashOutBtn busy={cashingOut === data.id} onClick={() => onCashOut(kind, data.id)} />
          )}
          <OutcomeBadge outcome={data.outcome} cashedOut={data.cashedOut} />
        </div>
      </div>

      {/* A refund with no explanation reads as a bug. Say why the stake came
          back — the player never took the field, or every leg pushed. */}
      {data.voidReason && !data.cashedOut && (
        <div style={{
          padding: "8px 14px", borderTop: "1px solid var(--border)",
          fontSize: "0.7rem", color: "var(--text-2)",
        }}>
          {data.voidReason}
        </div>
      )}
    </div>
  );
}
