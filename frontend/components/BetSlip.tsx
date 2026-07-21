"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import PlayerAvatar from "@/components/PlayerAvatar";
import TeamLogo from "@/components/TeamLogo";
import { getTeamLogoUrl } from "@/lib/teamLogos";
import { fmtMoney, fmtAmount, toCents } from "@/lib/money";

export interface SlipLeg {
  type: "prop" | "gameline";
  id: string;
  direction?: "OVER" | "UNDER";
  label: string;
  odds: number;
  market?: string;
  line?: number;
  statType?: string;
  altLine?: number;
  gameId?: string;
  gameDate?: string;
  // Icon data — player image for props, team logo(s) for game lines
  playerId?: string;
  espnId?: string;
  imageUrl?: string;
  playerName?: string;
  team?: string;
  homeTeam?: string;
  awayTeam?: string;
}

const SLIP_KEY = "betslip_legs";

export function getBetSlip(): SlipLeg[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SLIP_KEY) ?? "[]"); } catch { return []; }
}

export function addToSlip(leg: SlipLeg): boolean {
  let legs = getBetSlip();
  // Defensive: remove opposite direction for same prop (can't have OVER + UNDER)
  if (leg.type === "prop" && leg.direction) {
    const opposite = leg.direction === "OVER" ? "UNDER" : "OVER";
    legs = legs.filter((l) => !(l.id === leg.id && l.direction === opposite));
  }
  if (legs.some((l) => l.id === leg.id && l.direction === leg.direction && l.altLine === leg.altLine)) return false;
  localStorage.setItem(SLIP_KEY, JSON.stringify([...legs, leg]));
  window.dispatchEvent(new Event("betslip-update"));
  return true;
}

export function removeFromSlip(id: string, direction?: string, altLine?: number): void {
  const legs = getBetSlip().filter((l) => !(l.id === id && l.direction === direction && l.altLine === altLine));
  localStorage.setItem(SLIP_KEY, JSON.stringify(legs));
  window.dispatchEvent(new Event("betslip-update"));
}

export function clearSlip(): void {
  localStorage.setItem(SLIP_KEY, "[]");
  window.dispatchEvent(new Event("betslip-update"));
}

function toDecimal(american: number): number {
  if (american > 0) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

function parlayOdds(legs: number[]): number {
  if (legs.length === 0) return 0;
  const dec = legs.reduce((a, o) => a * toDecimal(o), 1);
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

function calcPayout(stake: number, american: number): number {
  if (american > 0) return stake + Math.round((stake * american) / 100);
  return stake + Math.round((stake * 100) / Math.abs(american));
}

function legKey(leg: SlipLeg): string {
  return `${leg.id}:${leg.direction ?? ""}`;
}

// The alt line originally selected on the bet page (if any) — legs are no longer editable in the slip
function legAltLine(leg: SlipLeg): number | undefined {
  return leg.altLine != null && leg.altLine !== leg.line ? leg.altLine : undefined;
}

interface LegGroup {
  gameId?: string;
  gameDate?: string;
  homeTeam?: string;
  awayTeam?: string;
  legs: SlipLeg[];
}

// Group legs by game and order earliest → latest kickoff, matching the game cards:
// asc(gameDate), asc(gameId). Stable sort preserves add order within a game.
function groupLegs(legs: SlipLeg[]): LegGroup[] {
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

  const groups: LegGroup[] = [];
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

function fmtKickoff(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function getCombinations<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, size - 1).map((c) => [first, ...c]),
    ...getCombinations(rest, size),
  ];
}

function titleCase(s: string): string {
  return s.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

function marketName(market?: string): string {
  if (!market) return "";
  if (market.includes("MONEYLINE")) return "Moneyline";
  if (market.includes("SPREAD")) return "Spread";
  if (market.includes("TOTAL")) return "Total";
  return titleCase(market);
}

function LegIcon({ leg }: { leg: SlipLeg }) {
  if (leg.type === "prop") {
    const logoUrl = leg.team ? getTeamLogoUrl(leg.team) : null;
    return (
      <div style={{ position: "relative", flexShrink: 0 }}>
        <PlayerAvatar playerId={leg.playerId} espnId={leg.espnId} imageUrl={leg.imageUrl} name={leg.playerName ?? leg.label} size={34} />
        {leg.team && (
          <div style={{
            position: "absolute", bottom: -4, right: -4, width: 18, height: 18,
            borderRadius: "50%", border: "2px solid var(--surface)",
            background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            {logoUrl
              ? <img src={logoUrl} alt={leg.team} width={12} height={12} style={{ objectFit: "contain" }} />
              : <span style={{ fontSize: 5, fontWeight: 800, color: "var(--text-2)" }}>{leg.team.substring(0, 2)}</span>
            }
          </div>
        )}
      </div>
    );
  }
  if (leg.team) return <TeamLogo team={leg.team} size={34} />;
  if (leg.homeTeam && leg.awayTeam) {
    return (
      <div style={{ position: "relative", width: 34, height: 34, flexShrink: 0, background: "var(--surface-3)", borderRadius: 6 }}>
        <div style={{ position: "absolute", top: 1, left: 1 }}><TeamLogo team={leg.awayTeam} size={19} plain /></div>
        <div style={{ position: "absolute", bottom: 1, right: 1 }}><TeamLogo team={leg.homeTeam} size={19} plain /></div>
      </div>
    );
  }
  return <div style={{ width: 34, height: 34, borderRadius: 6, background: "var(--surface-3)", flexShrink: 0 }} />;
}

function legTitle(leg: SlipLeg): string {
  if (leg.type === "prop" && leg.playerName) return leg.playerName;
  return leg.label;
}

function legSubtitle(leg: SlipLeg, displayLine?: number): string | null {
  if (leg.type === "prop") {
    if (!leg.statType || !leg.direction) return null;
    const dir = leg.direction === "OVER" ? "Over" : "Under";
    const line = displayLine ?? leg.altLine ?? leg.line;
    return `${dir} ${line ?? ""} ${titleCase(leg.statType)}`.trim();
  }
  const matchup = leg.awayTeam && leg.homeTeam ? ` · ${leg.awayTeam} @ ${leg.homeTeam}` : "";
  return `${marketName(leg.market)}${matchup}`;
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const FIELD_LABEL: React.CSSProperties = {
  display: "block", marginBottom: 4,
  fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.07em",
  color: "var(--text-3)", textTransform: "uppercase",
};
const DOLLAR: React.CSSProperties = {
  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
  color: "var(--text-3)", fontSize: "0.88rem", fontWeight: 600, pointerEvents: "none",
};

export default function BetSlip({ leagueId }: { leagueId: string }) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [open, setOpen] = useState(false);
  const [parlayStake, setParlayStake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [rrMode, setRrMode] = useState(false);
  const [rrSize, setRrSize] = useState(2);

  const refresh = useCallback(() => setLegs(getBetSlip()), []);

  useEffect(() => {
    refresh();
    window.addEventListener("betslip-update", refresh);
    return () => window.removeEventListener("betslip-update", refresh);
  }, [refresh]);

  useEffect(() => {
    if (legs.length > 0) setOpen(true);
  }, [legs.length]);

  const totalOdds = parlayOdds(legs.map((l) => l.odds));
  const stakeCents = toCents(parlayStake); // wager input is in dollars; everything else is cents
  const parlayPayout = stakeCents > 0 && legs.length >= 1 ? calcPayout(stakeCents, totalOdds) : 0;
  const parlayProfit = parlayPayout - stakeCents;

  async function placeSingle() {
    const leg = legs[0];
    if (!leg) return;
    if (!stakeCents || stakeCents <= 0) { setError("Enter a stake"); return; }
    setSubmitting(true);
    setError("");
    const altLine = legAltLine(leg);
    try {
      if (leg.type === "prop") {
        await api("/picks", {
          method: "POST",
          body: JSON.stringify({
            leagueId, propId: leg.id, direction: leg.direction, stake: stakeCents,
            ...(altLine != null ? { altLine } : {}),
          }),
        });
      } else {
        await api("/gamepicks", {
          method: "POST",
          body: JSON.stringify({
            leagueId, gameLineId: leg.id, stake: stakeCents,
            ...(altLine != null ? { altLine } : {}),
          }),
        });
      }
      setMsg(`Bet placed! To win ${fmtMoney(parlayProfit)}`);
      setParlayStake("");
      clearSlip();
      setOpen(false);
      window.dispatchEvent(new Event("bet-placed"));
      setTimeout(() => setMsg(""), 4000);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setSubmitting(false);
    }
  }

  const CROSS_CONFLICTS: Record<string, string> = {
    MONEYLINE_HOME: "SPREAD_AWAY",
    MONEYLINE_AWAY: "SPREAD_HOME",
    SPREAD_HOME: "MONEYLINE_AWAY",
    SPREAD_AWAY: "MONEYLINE_HOME",
  };

  function conflictingLeg(leg: SlipLeg): SlipLeg | null {
    if (!leg.gameId || !leg.market) return null;
    const sameGame = legs.filter((l) => l.gameId === leg.gameId && l.id !== leg.id);
    for (const other of sameGame) {
      if (!other.market) continue;
      const isSameMarketOpposite = other.market === ({ MONEYLINE_HOME: "MONEYLINE_AWAY", MONEYLINE_AWAY: "MONEYLINE_HOME", SPREAD_HOME: "SPREAD_AWAY", SPREAD_AWAY: "SPREAD_HOME", TOTAL_OVER: "TOTAL_UNDER", TOTAL_UNDER: "TOTAL_OVER" })[leg.market];
      const isCrossConflict = other.market === CROSS_CONFLICTS[leg.market];
      if (isSameMarketOpposite || isCrossConflict) return other;
    }
    return null;
  }

  async function submitParlay() {
    if (legs.length < 2) { setError("Add at least 2 legs"); return; }
    if (!stakeCents || stakeCents <= 0) { setError("Enter a parlay stake"); return; }
    // Block OVER + UNDER on the same prop
    const propDirections = new Map<string, string>();
    for (const leg of legs) {
      if (leg.type === "prop" && leg.direction) {
        const existing = propDirections.get(leg.id);
        if (existing && existing !== leg.direction) {
          setError("Can't parlay OVER and UNDER on the same prop");
          return;
        }
        propDirections.set(leg.id, leg.direction);
      }
    }
    for (const leg of legs) {
      const conflict = conflictingLeg(leg);
      if (conflict) {
        setError(`Conflicting legs: can't parlay ${leg.market?.replace("_", " ")} with ${conflict.market?.replace("_", " ")} for the same game`);
        return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      await api("/parlays", {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          stake: stakeCents,
          legs: legs.map((l) => {
            const altLine = legAltLine(l);
            return {
              propId: l.type === "prop" ? l.id : undefined,
              gameLineId: l.type === "gameline" ? l.id : undefined,
              direction: l.direction,
              ...(altLine != null ? { altLine } : {}),
            };
          }),
        }),
      });
      setMsg(`${legs.length}-leg parlay placed! To win ${fmtMoney(parlayProfit)}`);
      setParlayStake("");
      clearSlip();
      setOpen(false);
      window.dispatchEvent(new Event("bet-placed"));
      setTimeout(() => setMsg(""), 4000);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setSubmitting(false);
    }
  }

  const rrCombos = rrMode && legs.length >= 3 ? getCombinations(legs, rrSize).length : 0;
  const rrTotalStake = rrCombos * stakeCents; // cents

  async function submitRoundRobin() {
    if (legs.length < 3) { setError("Round robin requires at least 3 legs"); return; }
    if (!stakeCents || stakeCents <= 0) { setError("Enter a stake per combo"); return; }
    setSubmitting(true);
    setError("");
    try {
      const result = await api("/parlays/round-robin", {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          size: rrSize,
          stakePerParlay: stakeCents,
          legs: legs.map((l) => {
            const altLine = legAltLine(l);
            return {
              propId: l.type === "prop" ? l.id : undefined,
              gameLineId: l.type === "gameline" ? l.id : undefined,
              direction: l.direction,
              ...(altLine != null ? { altLine } : {}),
            };
          }),
        }),
      });
      const n = result.combos ?? rrCombos;
      setMsg(`${n} round robin combos placed! Total: ${fmtMoney(result.totalStake)}`);
      setParlayStake("");
      setRrMode(false);
      clearSlip();
      setOpen(false);
      window.dispatchEvent(new Event("bet-placed"));
      setTimeout(() => setMsg(""), 5000);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setSubmitting(false);
    }
  }

  if (legs.length === 0 && !msg) return null;

  return (
    <div style={{ position: "fixed", bottom: 56, right: 12, width: 368, maxWidth: "calc(100vw - 24px)", zIndex: 500, pointerEvents: "none" }}>
      {/* Success toast */}
      {msg && (
        <div style={{
          margin: "0 12px 8px",
          pointerEvents: "auto",
          background: "var(--win-bg)",
          border: "1px solid var(--win-border)",
          borderRadius: 10,
          padding: "12px 16px",
          color: "var(--win)",
          fontWeight: 700,
          fontSize: "0.85rem",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ fontSize: "1.1rem" }}>✓</span>
          {msg}
        </div>
      )}

      {/* Collapsed bar */}
      {!open && legs.length > 0 && (
        <button
          onClick={() => setOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            pointerEvents: "auto",
            background: "var(--accent)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "10px 10px 0 0",
            padding: "13px 20px",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: "0.92rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: "rgba(0,0,0,0.2)",
              color: "#FFFFFF",
              borderRadius: "50%",
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.72rem",
              fontWeight: 900,
            }}>{legs.length}</span>
            Bet Slip
          </div>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, opacity: 0.7 }}>View ↑</span>
        </button>
      )}

      {/* Expanded slip */}
      {open && (
        <div style={{
          pointerEvents: "auto",
          background: "var(--surface)",
          borderRadius: 12,
          maxHeight: "80vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border-2)",
          borderBottom: "none",
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 12px",
            background: "var(--navy)",
            borderRadius: "12px 12px 0 0",
            flexShrink: 0,
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text)", letterSpacing: "0.01em" }}>
                Bet Slip
              </span>
              <span style={{
                background: "var(--accent)",
                color: "#FFFFFF",
                borderRadius: "50%",
                width: 20,
                height: 20,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                fontWeight: 900,
              }}>
                {legs.length}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => { clearSlip(); setError(""); }}
                style={{
                  background: "var(--overlay-dim)",
                  color: "var(--text-2)",
                  fontSize: "0.72rem",
                  padding: "5px 10px",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "var(--overlay-dim)",
                  color: "var(--text-2)",
                  padding: "5px 8px",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              padding: "8px 16px",
              color: "var(--loss)",
              fontSize: "0.8rem",
              fontWeight: 600,
              background: "var(--loss-bg)",
              borderBottom: "1px solid var(--loss-border)",
              flexShrink: 0,
            }}>
              {error}
            </div>
          )}

          {/* Legs grouped by game, earliest → latest kickoff */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            {groupLegs(legs).map((group, gi) => (
              <div key={group.gameId ?? `nogame-${gi}`}>
                {group.awayTeam && group.homeTeam && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 14px",
                    background: "var(--surface-2)",
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <span style={{
                      fontSize: "0.66rem",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      color: "var(--text-2)",
                      textTransform: "uppercase",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {group.awayTeam} @ {group.homeTeam}
                    </span>
                    {group.gameDate && (
                      <span style={{ fontSize: "0.62rem", fontWeight: 600, color: "var(--text-3)", flexShrink: 0 }}>
                        {fmtKickoff(group.gameDate)}
                      </span>
                    )}
                  </div>
                )}
                {group.legs.map((leg) => {
                  const key = legKey(leg);
                  const displayLine = leg.altLine ?? leg.line;

                  return (
                    <div key={key} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--border)",
                      background: "var(--surface)",
                    }}>
                      <LegIcon leg={leg} />
                      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: "0.8rem",
                          lineHeight: 1.25,
                          color: "var(--text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {legTitle(leg)}
                        </div>
                        {legSubtitle(leg, displayLine) && (
                          <div style={{
                            fontSize: "0.68rem",
                            color: "var(--text-3)",
                            lineHeight: 1.25,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {legSubtitle(leg, displayLine)}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: "var(--accent)",
                        fontVariantNumeric: "tabular-nums",
                        flexShrink: 0,
                      }}>
                        {fmtOdds(leg.odds)}
                      </span>
                      <button
                        onClick={() => removeFromSlip(leg.id, leg.direction, leg.altLine)}
                        aria-label="Remove leg"
                        style={{
                          background: "transparent",
                          color: "var(--text-3)",
                          padding: "2px 0 2px 2px",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Single / Parlay / Round Robin section */}
          {legs.length >= 1 && (
            <div style={{
              padding: "14px 14px",
              background: "var(--surface-2)",
              borderTop: "2px solid var(--border-2)",
              flexShrink: 0,
            }}>
              {/* Header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--text)" }}>
                    {rrMode ? "Round Robin" : legs.length === 1 ? "Straight" : `${legs.length}-Leg Parlay`}
                  </span>
                  {legs.length >= 3 && (
                    <button
                      onClick={() => { setRrMode((v) => !v); setError(""); }}
                      style={{
                        fontSize: "0.65rem", fontWeight: 800, padding: "2px 7px",
                        borderRadius: 4, border: `1px solid ${rrMode ? "var(--accent)" : "var(--border-2)"}`,
                        background: rrMode ? "var(--accent)" : "transparent",
                        color: rrMode ? "#fff" : "var(--text-3)",
                        cursor: "pointer", letterSpacing: "0.05em",
                      }}
                    >RR</button>
                  )}
                </div>
                {!rrMode && (
                  <span style={{ fontWeight: 900, fontSize: "1rem", color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtOdds(totalOdds)}
                  </span>
                )}
                {rrMode && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {[2, 3].filter((s) => s < legs.length).map((s) => (
                      <button
                        key={s}
                        onClick={() => setRrSize(s)}
                        style={{
                          fontSize: "0.7rem", fontWeight: 700, padding: "3px 9px", borderRadius: 4,
                          border: `1px solid ${rrSize === s ? "var(--accent)" : "var(--border-2)"}`,
                          background: rrSize === s ? "var(--accent)" : "transparent",
                          color: rrSize === s ? "#fff" : "var(--text-3)",
                          cursor: "pointer",
                        }}
                      >{s}-team</button>
                    ))}
                  </div>
                )}
              </div>

              {rrMode && (
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginBottom: 8 }}>
                  {rrCombos} combo{rrCombos !== 1 ? "s" : ""}
                  {rrTotalStake > 0 && <span style={{ color: "var(--text-2)", fontWeight: 600 }}> · Total: {fmtMoney(rrTotalStake)}</span>}
                </div>
              )}

              {!rrMode ? (
                <div style={{ display: "flex", gap: 8 }}>
                  {/* TO WAGER */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={FIELD_LABEL}>Wager</label>
                    <div style={{ position: "relative" }}>
                      <span style={DOLLAR}>$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        min="0.01"
                        step="0.01"
                        value={parlayStake}
                        onChange={(e) => { setParlayStake(e.target.value); setError(""); }}
                        style={{ width: "100%", fontSize: "0.88rem", padding: "8px 10px 8px 22px", fontVariantNumeric: "tabular-nums" }}
                      />
                    </div>
                  </div>
                  {/* TO WIN — prefilled from wager, earnings only (excludes stake) */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={FIELD_LABEL}>To Win</label>
                    <div style={{ position: "relative" }}>
                      <span style={DOLLAR}>$</span>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        placeholder="0.00"
                        value={stakeCents > 0 && parlayProfit > 0 ? fmtAmount(parlayProfit) : ""}
                        style={{
                          width: "100%", fontSize: "0.88rem", padding: "8px 10px 8px 22px",
                          fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--win)",
                          background: "var(--surface-3)", cursor: "default",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <span style={DOLLAR}>$</span>
                  <input
                    type="number"
                    placeholder="per combo"
                    min="0.01"
                    step="0.01"
                    value={parlayStake}
                    onChange={(e) => { setParlayStake(e.target.value); setError(""); }}
                    style={{ width: "100%", fontSize: "0.88rem", padding: "8px 10px 8px 22px", fontVariantNumeric: "tabular-nums" }}
                  />
                </div>
              )}

              <button
                onClick={rrMode ? submitRoundRobin : legs.length === 1 ? placeSingle : submitParlay}
                disabled={submitting || !parlayStake || Number(parlayStake) <= 0}
                style={{
                  width: "100%", marginTop: 10, fontSize: "0.85rem", padding: "10px 16px", fontWeight: 700,
                  opacity: (submitting || !parlayStake || Number(parlayStake) <= 0) ? 0.45 : 1,
                }}
              >
                {submitting ? "Placing…" : "Place Bet"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
