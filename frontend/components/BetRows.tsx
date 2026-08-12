"use client";

import React from "react";
import { getTeamFullName } from "@/lib/teamLogos";

// Shared row rendering for the bet slip (BetSlip.tsx) and for placed bets
// (PlacedBetCard.tsx — My Bets / History). Both surfaces must look identical,
// so the geometry, grouping, and row markup live here rather than being
// duplicated per page.

/* ─────────────── formatting ─────────────── */

export function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export function titleCase(s: string): string {
  return s.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

/** Signed spread: -3.5 → "-3.5", 3.5 → "+3.5". */
function fmtSigned(line: number): string {
  return line > 0 ? `+${line}` : `${line}`;
}

export interface GameLineRef {
  market?: string;
  /** The line actually taken — alt line if the bet was on one, else the main line. */
  line?: number | null;
  homeTeam?: string;
  awayTeam?: string;
  /** Server-side label, used only when the market can't be recognised. */
  label?: string;
}

// Game lines name the side in the title and the market in the subtitle:
//   Moneyline  → "Los Angeles Rams"      / "MONEYLINE"
//   Spread     → "Los Angeles Rams -3.5" / "SPREAD"
//   Total      → "Over 44.5"             / "TOTAL MATCH POINTS"
// Matching on substrings so the ALT_ variants (ALT_SPREAD_HOME_-7,
// ALT_TOTAL_OVER_45) fall out for free. The matchup is deliberately left off
// the subtitle — the game group header above the row already carries it.

export function gameLineTitle(ref: GameLineRef): string {
  const { market } = ref;
  if (!market) return ref.label ?? "";

  const side = market.includes("HOME") ? ref.homeTeam : market.includes("AWAY") ? ref.awayTeam : undefined;
  const team = side ? getTeamFullName(side) : "";

  if (market.includes("MONEYLINE")) return team || ref.label || "";
  if (market.includes("SPREAD")) {
    if (ref.line == null) return team || ref.label || "";
    return `${team} ${fmtSigned(ref.line)}`.trim();
  }
  if (market.includes("TOTAL")) {
    const dir = market.includes("UNDER") ? "Under" : "Over";
    return ref.line == null ? dir : `${dir} ${ref.line}`;
  }
  return ref.label ?? "";
}

export function gameLineSubtitle(market?: string): string | null {
  if (!market) return null;
  if (market.includes("MONEYLINE")) return "MONEYLINE";
  if (market.includes("SPREAD")) return "SPREAD";
  if (market.includes("TOTAL")) return "TOTAL MATCH POINTS";
  return titleCase(market);
}

export function fmtKickoff(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/* ─────────────── grouping ─────────────── */

export interface RowGame {
  gameId?: string;
  gameDate?: string;
  homeTeam?: string;
  awayTeam?: string;
}

/** One rendered leg row. `gutter` is whatever sits over the rail for this row. */
export interface BetRow extends RowGame {
  key: string;
  title: string;
  subtitle?: string | null;
  odds: number;
  gutter?: React.ReactNode;
  /** Slip-only: leg can't be parlayed with another selection. Renders amber. */
  conflict?: boolean;
}

export interface LegGroup<T extends RowGame> extends RowGame {
  legs: T[];
}

// Group legs by game and order earliest → latest kickoff, matching the game
// cards: asc(gameDate), asc(gameId). Stable sort preserves add order within a game.
export function groupLegs<T extends RowGame>(legs: T[]): LegGroup<T>[] {
  const ordered = legs
    .map((leg, i) => ({ leg, i }))
    .sort((a, b) => {
      const da = a.leg.gameDate ? new Date(a.leg.gameDate).getTime() : Infinity;
      const db = b.leg.gameDate ? new Date(b.leg.gameDate).getTime() : Infinity;
      if (da !== db) return da - db;
      const ga = a.leg.gameId ?? "";
      const gb = b.leg.gameId ?? "";
      if (ga !== gb) return ga < gb ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.leg);

  const groups: LegGroup<T>[] = [];
  for (const leg of ordered) {
    const last = groups[groups.length - 1];
    if (last && leg.gameId != null && last.gameId === leg.gameId) {
      last.legs.push(leg);
    } else {
      groups.push({ gameId: leg.gameId, gameDate: leg.gameDate, homeTeam: leg.homeTeam, awayTeam: leg.awayTeam, legs: [leg] });
    }
  }
  return groups;
}

/* ─────────────── left rail ─────────────── */

// The row owns the line so it spans the row's full height (padding included)
// and stays continuous from one row to the next.
export const RAIL_PAD = 8;
export const RAIL_W = 22;
export const RAIL_X = RAIL_PAD + RAIL_W / 2;

/**
 * The continuous vertical line. Overhangs 1px to cover the row's bottom border.
 * The final row must not overhang: there's no next row's border left to bridge,
 * and the bleed past a scroll container's content box counts as sub-pixel
 * overflow, which shows a scrollbar even when the rows fit with room to spare.
 */
export function RailLine({ last }: { last?: boolean }) {
  return (
    <div style={{
      position: "absolute", left: RAIL_X, top: 0, bottom: last ? 0 : -1,
      width: 1, background: "var(--border-2)", pointerEvents: "none",
    }} />
  );
}

/** Gutter cell sitting over the rail, holding this row's control (if any). */
export function RailCell({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      width: RAIL_W,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {children}
    </div>
  );
}

/* ─────────────── header ─────────────── */

/** Count badge + bet label on the left, total odds on the right. */
export function BetHeader({ count, label, odds }: { count: number; label: string; odds?: number | null }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 16px 12px",
      background: "var(--surface)",
      // Top corners must track the parent card's radius (PlacedBetCard / BetSlip)
      // or the header squares off inside a rounded container.
      borderRadius: "var(--radius) var(--radius) 0 0",
      flexShrink: 0,
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{
          background: "var(--accent)",
          color: "#FFFFFF",
          borderRadius: "50%",
          width: 20,
          height: 20,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.7rem",
          fontWeight: 900,
        }}>
          {count}
        </span>
        <span style={{
          fontWeight: 800, fontSize: "0.95rem", color: "var(--text)", letterSpacing: "0.01em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {label}
        </span>
      </div>
      {odds != null && (
        <span style={{
          fontWeight: 900,
          fontSize: "1rem",
          color: "var(--accent)",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          flexShrink: 0,
        }}>
          {fmtOdds(odds)}
        </span>
      )}
    </div>
  );
}

/* ─────────────── rows ─────────────── */

/** Game group headers + leg rows, sharing one continuous left rail. */
export function BetRows({ rows }: { rows: BetRow[] }) {
  const groups = groupLegs(rows);

  return (
    <>
      {groups.map((group, gi) => (
        <div key={group.gameId ?? `nogame-${gi}`}>
          {group.awayTeam && group.homeTeam && (
            <div style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: `6px 14px 6px ${RAIL_PAD}px`,
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
            }}>
              <RailLine />
              <RailCell />
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: "0.66rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  lineHeight: 1.35,
                  color: "var(--text-2)",
                  textTransform: "uppercase",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  <div>{getTeamFullName(group.awayTeam)}</div>
                  <div>@ {getTeamFullName(group.homeTeam)}</div>
                </div>
              </div>
              {group.gameDate && (
                <span style={{ fontSize: "0.62rem", fontWeight: 600, color: "var(--text-3)", flexShrink: 0 }}>
                  {fmtKickoff(group.gameDate)}
                </span>
              )}
            </div>
          )}
          {group.legs.map((row, li) => {
            const isLastRow = gi === groups.length - 1 && li === group.legs.length - 1;

            return (
              <div key={row.key} style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: `12px 14px 12px ${RAIL_PAD}px`,
                borderBottom: "1px solid var(--border)",
                background: row.conflict ? "var(--pending-bg)" : "var(--surface)",
              }}>
                <RailLine last={isLastRow} />
                <RailCell>{row.gutter}</RailCell>
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    lineHeight: 1.25,
                    color: row.conflict ? "var(--pending)" : "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {row.title}
                  </div>
                  {row.subtitle && (
                    <div style={{
                      fontSize: "0.68rem",
                      color: row.conflict ? "var(--pending)" : "var(--text-3)",
                      opacity: row.conflict ? 0.8 : 1,
                      lineHeight: 1.25,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {row.subtitle}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: row.conflict ? "var(--pending)" : "var(--accent)",
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}>
                  {fmtOdds(row.odds)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
