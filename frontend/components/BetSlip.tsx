"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { fmtMoney, fmtAmount, toCents } from "@/lib/money";
import { BetHeader, BetRows, gameLineSubtitle, gameLineTitle, titleCase, type BetRow } from "./BetRows";

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

function getCombinations<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, size - 1).map((c) => [first, ...c]),
    ...getCombinations(rest, size),
  ];
}

function legTitle(leg: SlipLeg): string {
  if (leg.type === "prop" && leg.playerName) return leg.playerName;
  if (leg.type === "gameline") {
    return gameLineTitle({
      market: leg.market,
      line: leg.altLine ?? leg.line,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      label: leg.label,
    });
  }
  return leg.label;
}

function legSubtitle(leg: SlipLeg): string | null {
  if (leg.type === "prop") {
    if (!leg.statType || !leg.direction) return null;
    const dir = leg.direction === "OVER" ? "Over" : "Under";
    const line = leg.altLine ?? leg.line;
    return `${dir} ${line ?? ""} ${titleCase(leg.statType)}`.trim();
  }
  return gameLineSubtitle(leg.market);
}

function MinusCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// LeagueNav's horizontal padding — the slip's right edge lines up with the
// nav's right-hand contents. Keep in sync with LeagueNav / GamesStrip.
const NAV_GUTTER = 300;
// Nav (44) + sub-nav (40), used only until the real offset is measured.
const NAV_FALLBACK = 84;

/** Removes a leg from the slip — sits in the rail gutter of each leg row. */
function RemoveBtn({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      aria-label="Remove bet"
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "none",
        borderRadius: "50%",
        padding: 0,
        lineHeight: 0,
        color: "var(--loss)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
      }}
    >
      <MinusCircleIcon />
    </button>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
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

  // Anchor the slip just below the nav stack. Measured rather than hardcoded:
  // the games strip above the nav is conditional and the sub-nav only renders
  // for some routes, so the stack height varies per page.
  const [navBottom, setNavBottom] = useState(NAV_FALLBACK);
  useEffect(() => {
    const page = document.querySelector(".page, .page-wide");
    if (!page) return;
    const measure = () => setNavBottom(Math.round(page.getBoundingClientRect().top));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(page);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const betLabel = legs.length === 0
    ? "Bet Slip"
    : rrMode ? "Round Robin" : legs.length === 1 ? "Straight" : `${legs.length}-Leg Parlay`;

  const rows: BetRow[] = legs.map((leg) => ({
    key: legKey(leg),
    title: legTitle(leg),
    subtitle: legSubtitle(leg),
    odds: leg.odds,
    gameId: leg.gameId,
    gameDate: leg.gameDate,
    homeTeam: leg.homeTeam,
    awayTeam: leg.awayTeam,
    gutter: <RemoveBtn onRemove={() => removeFromSlip(leg.id, leg.direction, leg.altLine)} />,
  }));

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
      window.dispatchEvent(new Event("bet-placed"));
      setTimeout(() => setMsg(""), 5000);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: "fixed",
      top: navBottom + 12,
      bottom: 12,
      right: NAV_GUTTER,
      width: 368,
      maxWidth: `calc(100vw - ${NAV_GUTTER + 12}px)`,
      zIndex: 500,
      pointerEvents: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: 10,
    }}>
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

      {/* Part 1 — header + legs, anchored under the nav */}
      <div style={{
          pointerEvents: "auto",
          background: "var(--surface)",
          borderRadius: 12,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          <BetHeader
            count={legs.length}
            label={betLabel}
            odds={!rrMode && legs.length > 0 ? totalOdds : null}
          />

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
          {/* flex-basis auto (not 0) so the list sizes to its content and only
              shrinks — and therefore only scrolls — once space runs out */}
          <div style={{ flex: "0 1 auto", overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            {legs.length === 0 && (
              <div style={{
                padding: "28px 20px",
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: "0.78rem",
                lineHeight: 1.5,
              }}>
                Tap any odds to start building a bet.
              </div>
            )}
            <BetRows rows={rows} />
          </div>
      </div>

      {/* Part 2 — wager controls, pinned to the bottom of the screen */}
      {legs.length >= 1 && (
            <div style={{
              marginTop: "auto",
              pointerEvents: "auto",
              padding: "14px 14px",
              background: "var(--surface)",
              borderRadius: 12,
              flexShrink: 0,
            }}>
              {/* Remove all selections */}
              <button
                onClick={() => { clearSlip(); setError(""); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  padding: "0 0 12px",
                  color: "var(--loss)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <TrashIcon />
                Remove all selections
              </button>

              {/* Round robin controls */}
              {legs.length >= 3 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
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
              )}

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
  );
}
