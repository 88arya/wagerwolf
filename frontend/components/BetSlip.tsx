"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export interface SlipLeg {
  type: "prop" | "gameline";
  id: string;
  direction?: "OVER" | "UNDER";
  label: string;
  odds: number;
}

const SLIP_KEY = "betslip_legs";

export function getBetSlip(): SlipLeg[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SLIP_KEY) ?? "[]"); } catch { return []; }
}

export function addToSlip(leg: SlipLeg): boolean {
  const legs = getBetSlip();
  if (legs.some((l) => l.id === leg.id && l.direction === leg.direction)) return false;
  localStorage.setItem(SLIP_KEY, JSON.stringify([...legs, leg]));
  window.dispatchEvent(new Event("betslip-update"));
  return true;
}

export function removeFromSlip(id: string, direction?: string): void {
  const legs = getBetSlip().filter((l) => !(l.id === id && l.direction === direction));
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

export default function BetSlip({ leagueId }: { leagueId: string }) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [open, setOpen] = useState(false);
  const [legStakes, setLegStakes] = useState<Record<string, string>>({});
  const [parlayStake, setParlayStake] = useState("");
  const [placingLeg, setPlacingLeg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

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
  const parlayStakeNum = Number(parlayStake);
  const parlayPayout = parlayStakeNum > 0 && legs.length >= 2 ? calcPayout(parlayStakeNum, totalOdds) : 0;

  async function placeSingleBet(leg: SlipLeg) {
    const key = legKey(leg);
    const stakeStr = legStakes[key];
    if (!stakeStr || Number(stakeStr) <= 0) { setError("Enter a stake"); return; }
    setPlacingLeg(key);
    setError("");
    try {
      if (leg.type === "prop") {
        await api("/picks", {
          method: "POST",
          body: JSON.stringify({ leagueId, propId: leg.id, direction: leg.direction, stake: Number(stakeStr) }),
        });
      } else {
        await api("/gamepicks", {
          method: "POST",
          body: JSON.stringify({ leagueId, gameLineId: leg.id, stake: Number(stakeStr) }),
        });
      }
      removeFromSlip(leg.id, leg.direction);
      window.dispatchEvent(new Event("bet-placed"));
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setPlacingLeg(null);
    }
  }

  async function submitParlay() {
    if (legs.length < 2) { setError("Add at least 2 legs"); return; }
    if (!parlayStakeNum || parlayStakeNum <= 0) { setError("Enter a parlay stake"); return; }
    setSubmitting(true);
    setError("");
    try {
      await api("/parlays", {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          stake: parlayStakeNum,
          legs: legs.map((l) => ({
            propId: l.type === "prop" ? l.id : undefined,
            gameLineId: l.type === "gameline" ? l.id : undefined,
            direction: l.direction,
          })),
        }),
      });
      setMsg(`Parlay placed! To win $${(parlayPayout - parlayStakeNum).toLocaleString()}`);
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

  if (legs.length === 0 && !msg) return null;

  return (
    <div style={{ position: "fixed", bottom: 64, left: 0, right: 0, zIndex: 1000, pointerEvents: "none" }}>
      {msg && (
        <div style={{
          margin: "0 12px 8px", pointerEvents: "auto",
          background: "var(--win-bg)", border: "1px solid rgba(22,163,74,0.3)",
          borderRadius: 10, padding: "10px 14px",
          color: "var(--win)", fontWeight: 700, fontSize: "0.82rem",
        }}>
          {msg}
        </div>
      )}

      {/* Collapsed bar */}
      {!open && legs.length > 0 && (
        <button
          onClick={() => setOpen(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", pointerEvents: "auto",
            background: "var(--navy)", color: "#fff",
            border: "none", borderRadius: 0, padding: "12px 20px",
            cursor: "pointer", boxShadow: "0 -2px 12px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: "var(--accent)", borderRadius: "50%",
              width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.75rem", fontWeight: 900,
            }}>{legs.length}</span>
            <span style={{ fontWeight: 800, fontSize: "0.9rem" }}>Bet Slip</span>
          </div>
          <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>Tap to open ▲</span>
        </button>
      )}

      {/* Expanded slip */}
      {open && (
        <div style={{
          pointerEvents: "auto",
          background: "var(--surface)",
          borderRadius: "16px 16px 0 0",
          maxHeight: "72vh",
          overflowY: "auto",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.25)",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
            background: "var(--navy)",
            borderRadius: "16px 16px 0 0",
            position: "sticky", top: 0, zIndex: 1,
            flexShrink: 0,
          }}>
            <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#fff" }}>
              Bet Slip
              <span style={{ marginLeft: 8, background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 900 }}>
                {legs.length}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { clearSlip(); setOpen(false); }}
                style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", fontSize: "0.75rem", padding: "4px 10px", border: "none", borderRadius: 6, cursor: "pointer" }}
              >
                Clear all
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: "1.1rem", padding: "4px 8px", border: "none", cursor: "pointer" }}
              >
                ▼
              </button>
            </div>
          </div>

          {error && (
            <div style={{ padding: "8px 16px", color: "var(--loss)", fontSize: "0.82rem", fontWeight: 600, background: "var(--loss-bg)" }}>
              {error}
            </div>
          )}

          {/* Individual legs */}
          {legs.map((leg) => {
            const key = legKey(leg);
            const stakeNum = Number(legStakes[key] ?? 0);
            const payout = stakeNum > 0 ? calcPayout(stakeNum, leg.odds) : 0;
            const isPlacing = placingLeg === key;
            return (
              <div key={key} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", lineHeight: 1.3 }}>{leg.label}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, marginTop: 2 }}>{fmtOdds(leg.odds)}</div>
                  </div>
                  <button
                    onClick={() => removeFromSlip(leg.id, leg.direction)}
                    style={{ background: "transparent", color: "var(--text-3)", fontSize: "1rem", padding: "0 4px", border: "none", cursor: "pointer", flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    placeholder="Stake"
                    min="1"
                    value={legStakes[key] ?? ""}
                    onChange={(e) => setLegStakes((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={{ flex: 1, fontSize: "0.88rem", padding: "8px 10px" }}
                  />
                  <button
                    onClick={() => placeSingleBet(leg)}
                    disabled={isPlacing}
                    style={{ flexShrink: 0, fontSize: "0.82rem", padding: "8px 16px", opacity: isPlacing ? 0.6 : 1 }}
                  >
                    {isPlacing ? "…" : "Bet"}
                  </button>
                </div>
                {payout > 0 && (
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 5 }}>
                    Win <span style={{ color: "var(--win)", fontWeight: 700 }}>${(payout - stakeNum).toLocaleString()}</span>
                    <span style={{ marginLeft: 8 }}>· Payout <span style={{ fontWeight: 600 }}>${payout.toLocaleString()}</span></span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Parlay section */}
          {legs.length >= 2 && (
            <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderTop: "2px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{legs.length}-Leg Parlay</span>
                <span style={{ fontWeight: 900, fontSize: "0.95rem", color: "var(--accent)" }}>{fmtOdds(totalOdds)}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  type="number"
                  placeholder="Parlay stake"
                  min="1"
                  value={parlayStake}
                  onChange={(e) => setParlayStake(e.target.value)}
                  style={{ flex: 1, fontSize: "0.88rem", padding: "8px 10px" }}
                />
                <button
                  onClick={submitParlay}
                  disabled={submitting}
                  style={{ flexShrink: 0, fontSize: "0.82rem", padding: "8px 16px", opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? "…" : "Parlay"}
                </button>
              </div>
              {parlayPayout > 0 && (
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
                  Win <span style={{ color: "var(--win)", fontWeight: 700 }}>${(parlayPayout - parlayStakeNum).toLocaleString()}</span>
                  <span style={{ marginLeft: 8 }}>· Payout <span style={{ fontWeight: 600 }}>${parlayPayout.toLocaleString()}</span></span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
