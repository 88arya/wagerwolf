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

export default function BetSlip({ leagueId }: { leagueId: string }) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => setLegs(getBetSlip()), []);

  useEffect(() => {
    refresh();
    window.addEventListener("betslip-update", refresh);
    return () => window.removeEventListener("betslip-update", refresh);
  }, [refresh]);

  const totalOdds = parlayOdds(legs.map((l) => l.odds));
  const stakeNum = Number(stake);
  const potentialPayout = stakeNum > 0 && legs.length >= 2 ? calcPayout(stakeNum, totalOdds) : 0;

  async function submitParlay() {
    if (legs.length < 2) { setError("Add at least 2 legs to submit a parlay"); return; }
    if (!stakeNum || stakeNum <= 0) { setError("Enter a valid stake"); return; }
    if (!leagueId) { setError("No league selected"); return; }

    setSubmitting(true);
    setError("");
    try {
      await api("/parlays", {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          stake: stakeNum,
          legs: legs.map((l) => ({
            propId: l.type === "prop" ? l.id : undefined,
            gameLineId: l.type === "gameline" ? l.id : undefined,
            direction: l.direction,
          })),
        }),
      });
      setMsg(`Parlay submitted! Potential payout: $${potentialPayout.toLocaleString()}`);
      setStake("");
      clearSlip();
      setTimeout(() => setMsg(""), 4000);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setSubmitting(false);
    }
  }

  if (legs.length === 0 && !msg) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 70,
      right: 12,
      zIndex: 1000,
      width: open ? 300 : "auto",
      maxWidth: "calc(100vw - 24px)",
    }}>
      {msg && (
        <div style={{
          background: "var(--win-bg)",
          border: "1px solid rgba(0,210,106,0.4)",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 8,
          color: "var(--win)",
          fontWeight: 700,
          fontSize: "0.82rem",
        }}>
          {msg}
        </div>
      )}

      {!open && legs.length > 0 && (
        <button
          onClick={() => setOpen(true)}
          style={{
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 24,
            padding: "10px 18px",
            fontWeight: 800,
            fontSize: "0.88rem",
            boxShadow: "0 4px 16px rgba(99,102,241,0.5)",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            float: "right",
          }}
        >
          <span style={{
            background: "rgba(255,255,255,0.25)",
            borderRadius: "50%",
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.78rem",
            fontWeight: 900,
          }}>
            {legs.length}
          </span>
          Bet Slip
        </button>
      )}

      {open && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{ fontWeight: 800, fontSize: "0.9rem" }}>
              Bet Slip <span style={{ color: "var(--accent)", marginLeft: 4 }}>{legs.length}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { clearSlip(); setOpen(false); }}
                style={{ background: "transparent", color: "var(--text-3)", fontSize: "0.75rem", padding: "4px 8px", border: "1px solid var(--border)", boxShadow: "none" }}
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "transparent", color: "var(--text-2)", fontSize: "0.9rem", padding: "4px 8px", border: "none", boxShadow: "none" }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Legs */}
          <div style={{ maxHeight: 240, overflowY: "auto", padding: "8px 0" }}>
            {legs.map((leg, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 14px",
                borderBottom: i < legs.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {leg.label}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-2)", marginTop: 2 }}>
                    {fmtOdds(leg.odds)}
                  </div>
                </div>
                <button
                  onClick={() => removeFromSlip(leg.id, leg.direction)}
                  style={{ background: "transparent", color: "var(--text-3)", fontSize: "1rem", padding: "2px 6px", border: "none", boxShadow: "none", marginLeft: 8, flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Odds summary */}
          {legs.length >= 2 && (
            <div style={{
              padding: "10px 14px",
              background: "var(--surface-2)",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.8rem",
            }}>
              <span style={{ color: "var(--text-2)" }}>Combined odds</span>
              <span style={{ fontWeight: 800, color: "var(--accent)" }}>{fmtOdds(totalOdds)}</span>
            </div>
          )}

          {/* Stake + submit */}
          <div style={{ padding: "12px 14px" }}>
            {error && <div style={{ color: "var(--loss)", fontSize: "0.78rem", marginBottom: 8, fontWeight: 600 }}>{error}</div>}
            <input
              type="number"
              placeholder="Stake amount"
              min="1"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              style={{ marginBottom: 8, fontSize: "0.9rem" }}
            />
            {stakeNum > 0 && potentialPayout > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-2)", marginBottom: 10 }}>
                <span>Potential payout</span>
                <span style={{ fontWeight: 800, color: "var(--win)" }}>${potentialPayout.toLocaleString()}</span>
              </div>
            )}
            <button
              onClick={submitParlay}
              disabled={submitting || legs.length < 2}
              style={{ width: "100%", opacity: (submitting || legs.length < 2) ? 0.5 : 1 }}
            >
              {submitting ? "Submitting…" : `Submit Parlay (${legs.length} legs)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
