"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

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

function canRotate(leg: SlipLeg): boolean {
  if (leg.line == null) return false;
  if (leg.type === "gameline") return !leg.market?.startsWith("MONEYLINE");
  return true;
}

function getStep(leg: SlipLeg): number {
  if (leg.type === "gameline") return 0.5;
  if (leg.statType === "PASSING_YARDS" || leg.statType === "RUSHING_YARDS" || leg.statType === "RECEIVING_YARDS") return 5;
  return 0.5;
}

function getAdjustedOdds(leg: SlipLeg, currentLine: number): number {
  if (leg.line == null) return leg.odds;
  const step = getStep(leg);
  const steps = (currentLine - leg.line) / step;
  let favSteps: number;
  if (leg.type === "gameline") {
    favSteps = leg.market === "TOTAL_OVER" ? -steps : steps;
  } else {
    favSteps = leg.direction === "OVER" ? -steps : steps;
  }
  return Math.max(-500, Math.min(500, leg.odds - Math.round(favSteps * 15)));
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

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function BetSlip({ leagueId }: { leagueId: string }) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [open, setOpen] = useState(false);
  const [legStakes, setLegStakes] = useState<Record<string, string>>({});
  const [legLines, setLegLines] = useState<Record<string, number>>({});
  const [parlayStake, setParlayStake] = useState("");
  const [placingLeg, setPlacingLeg] = useState<string | null>(null);
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

  function getCurrentLine(leg: SlipLeg): number | undefined {
    if (leg.line == null) return undefined;
    return legLines[legKey(leg)] ?? leg.altLine ?? leg.line;
  }

  function shiftLine(leg: SlipLeg, dir: 1 | -1) {
    const key = legKey(leg);
    const current = getCurrentLine(leg) ?? leg.line!;
    const next = Math.round((current + dir * getStep(leg)) * 100) / 100;
    setLegLines((prev) => ({ ...prev, [key]: next }));
  }

  function effectiveOdds(leg: SlipLeg): number {
    const current = getCurrentLine(leg);
    if (current == null || current === leg.line) return leg.odds;
    return getAdjustedOdds(leg, current);
  }

  const totalOdds = parlayOdds(legs.map(effectiveOdds));
  const parlayStakeNum = Number(parlayStake);
  const parlayPayout = parlayStakeNum > 0 && legs.length >= 2 ? calcPayout(parlayStakeNum, totalOdds) : 0;
  const parlayProfit = parlayPayout - parlayStakeNum;

  async function placeSingleBet(leg: SlipLeg) {
    const key = legKey(leg);
    const stakeStr = legStakes[key];
    if (!stakeStr || Number(stakeStr) <= 0) { setError("Enter a stake"); return; }
    setPlacingLeg(key);
    setError("");

    const currentLine = getCurrentLine(leg);
    const altLine = (currentLine != null && leg.line != null && currentLine !== leg.line) ? currentLine : undefined;

    try {
      if (leg.type === "prop") {
        await api("/picks", {
          method: "POST",
          body: JSON.stringify({
            leagueId, propId: leg.id, direction: leg.direction, stake: Number(stakeStr),
            ...(altLine != null ? { altLine } : {}),
          }),
        });
      } else {
        await api("/gamepicks", {
          method: "POST",
          body: JSON.stringify({
            leagueId, gameLineId: leg.id, stake: Number(stakeStr),
            ...(altLine != null ? { altLine } : {}),
          }),
        });
      }
      removeFromSlip(leg.id, leg.direction);
      setLegLines((prev) => { const n = { ...prev }; delete n[key]; return n; });
      window.dispatchEvent(new Event("bet-placed"));
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setPlacingLeg(null);
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
    if (!parlayStakeNum || parlayStakeNum <= 0) { setError("Enter a parlay stake"); return; }
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
          stake: parlayStakeNum,
          legs: legs.map((l) => {
            const currentLine = getCurrentLine(l);
            const altLine = (currentLine != null && l.line != null && currentLine !== l.line) ? currentLine : undefined;
            return {
              propId: l.type === "prop" ? l.id : undefined,
              gameLineId: l.type === "gameline" ? l.id : undefined,
              direction: l.direction,
              ...(altLine != null ? { altLine } : {}),
            };
          }),
        }),
      });
      setMsg(`${legs.length}-leg parlay placed! To win $${parlayProfit.toLocaleString()}`);
      setParlayStake("");
      clearSlip();
      setLegLines({});
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
  const rrTotalStake = rrCombos * (Number(parlayStake) || 0);

  async function submitRoundRobin() {
    if (legs.length < 3) { setError("Round robin requires at least 3 legs"); return; }
    if (!parlayStakeNum || parlayStakeNum <= 0) { setError("Enter a stake per combo"); return; }
    setSubmitting(true);
    setError("");
    try {
      const result = await api("/parlays/round-robin", {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          size: rrSize,
          stakePerParlay: parlayStakeNum,
          legs: legs.map((l) => {
            const currentLine = getCurrentLine(l);
            const altLine = (currentLine != null && l.line != null && currentLine !== l.line) ? currentLine : undefined;
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
      setMsg(`${n} round robin combos placed! Total: $${result.totalStake?.toLocaleString()}`);
      setParlayStake("");
      setRrMode(false);
      clearSlip();
      setLegLines({});
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
          boxShadow: "var(--shadow-up)",
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
                onClick={() => { clearSlip(); setLegLines({}); setError(""); }}
                style={{
                  background: "rgba(0,0,0,0.06)",
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
                  background: "rgba(0,0,0,0.06)",
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

          {/* Individual legs */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            {legs.map((leg) => {
              const key = legKey(leg);
              const stakeNum = Number(legStakes[key] ?? 0);
              const curLine = getCurrentLine(leg);
              const adjOdds = effectiveOdds(leg);
              const lineChanged = curLine != null && leg.line != null && curLine !== leg.line;
              const payout = stakeNum > 0 ? calcPayout(stakeNum, adjOdds) : 0;
              const profit = payout - stakeNum;
              const isPlacing = placingLeg === key;
              const rotatable = canRotate(leg);

              return (
                <div key={key} style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface)",
                }}>
                  {/* Leg header */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{
                        fontWeight: 700,
                        fontSize: "0.83rem",
                        lineHeight: 1.35,
                        color: "var(--text)",
                        marginBottom: 3,
                      }}>
                        {leg.label}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontSize: "0.88rem",
                          fontWeight: 800,
                          color: "var(--accent)",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {fmtOdds(adjOdds)}
                        </span>
                        {lineChanged && (
                          <span style={{
                            color: "var(--text-3)",
                            fontWeight: 400,
                            textDecoration: "line-through",
                            fontSize: "0.72rem",
                          }}>
                            {fmtOdds(leg.odds)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromSlip(leg.id, leg.direction, leg.altLine)}
                      style={{
                        background: "transparent",
                        color: "var(--text-3)",
                        fontSize: "1rem",
                        padding: "2px 4px",
                        border: "none",
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  {/* Line rotation */}
                  {rotatable && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <button
                        onClick={() => shiftLine(leg, -1)}
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          border: "1px solid var(--border-2)",
                          background: "var(--surface-3)",
                          color: "var(--text-2)",
                          fontSize: "1rem",
                          fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", flexShrink: 0,
                        }}
                      >−</button>
                      <span style={{
                        fontSize: "0.92rem",
                        fontWeight: 800,
                        minWidth: 52,
                        textAlign: "center",
                        color: lineChanged ? "var(--accent)" : "var(--text-2)",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {curLine}
                      </span>
                      <button
                        onClick={() => shiftLine(leg, 1)}
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          border: "1px solid var(--border-2)",
                          background: "var(--surface-3)",
                          color: "var(--text-2)",
                          fontSize: "1rem",
                          fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", flexShrink: 0,
                        }}
                      >+</button>
                      {lineChanged && (
                        <span style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>
                          base {leg.line}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stake + Place bet row */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                      <span style={{
                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                        color: "var(--text-3)", fontSize: "0.88rem", fontWeight: 600,
                        pointerEvents: "none",
                      }}>$</span>
                      <input
                        type="number"
                        placeholder="0"
                        min="1"
                        value={legStakes[key] ?? ""}
                        onChange={(e) => { setLegStakes((prev) => ({ ...prev, [key]: e.target.value })); setError(""); }}
                        style={{
                          paddingLeft: 22,
                          fontSize: "0.88rem",
                          padding: "8px 10px 8px 22px",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </div>
                    <button
                      onClick={() => placeSingleBet(leg)}
                      disabled={isPlacing || !legStakes[key] || Number(legStakes[key]) <= 0}
                      style={{
                        flexShrink: 0,
                        fontSize: "0.82rem",
                        padding: "8px 16px",
                        fontWeight: 700,
                        opacity: (isPlacing || !legStakes[key] || Number(legStakes[key]) <= 0) ? 0.45 : 1,
                      }}
                    >
                      {isPlacing ? "Placing…" : "Place Bet"}
                    </button>
                  </div>

                  {/* Payout display */}
                  {payout > 0 && (
                    <div style={{
                      display: "flex",
                      gap: 12,
                      marginTop: 6,
                      fontSize: "0.72rem",
                      color: "var(--text-3)",
                    }}>
                      <span>To win <span style={{ color: "var(--win)", fontWeight: 700 }}>${profit.toLocaleString()}</span></span>
                      <span>Payout <span style={{ fontWeight: 600, color: "var(--text-2)" }}>${payout.toLocaleString()}</span></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Parlay / Round Robin section */}
          {legs.length >= 2 && (
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
                    {rrMode ? "Round Robin" : `${legs.length}-Leg Parlay`}
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
                  {rrTotalStake > 0 && <span style={{ color: "var(--text-2)", fontWeight: 600 }}> · Total: ${rrTotalStake.toLocaleString()}</span>}
                </div>
              )}

              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <span style={{
                    position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                    color: "var(--text-3)", fontSize: "0.88rem", fontWeight: 600, pointerEvents: "none",
                  }}>$</span>
                  <input
                    type="number"
                    placeholder={rrMode ? "per combo" : "0"}
                    min="1"
                    value={parlayStake}
                    onChange={(e) => { setParlayStake(e.target.value); setError(""); }}
                    style={{ fontSize: "0.88rem", padding: "8px 10px 8px 22px", fontVariantNumeric: "tabular-nums" }}
                  />
                </div>
                <button
                  onClick={rrMode ? submitRoundRobin : submitParlay}
                  disabled={submitting || !parlayStake || Number(parlayStake) <= 0}
                  style={{
                    flexShrink: 0, fontSize: "0.82rem", padding: "8px 16px", fontWeight: 700,
                    opacity: (submitting || !parlayStake || Number(parlayStake) <= 0) ? 0.45 : 1,
                  }}
                >
                  {submitting ? "Placing…" : rrMode ? "Round Robin" : "Parlay"}
                </button>
              </div>

              {!rrMode && parlayPayout > 0 && (
                <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: "0.75rem", color: "var(--text-3)" }}>
                  <span>To win <span style={{ color: "var(--win)", fontWeight: 700, fontSize: "0.85rem" }}>${parlayProfit.toLocaleString()}</span></span>
                  <span>Payout <span style={{ fontWeight: 600, color: "var(--text-2)" }}>${parlayPayout.toLocaleString()}</span></span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
