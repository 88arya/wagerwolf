"use client";

import { useRef } from "react";
import { fmtOdds } from "@/lib/odds";
import { OPPOSITE_MARKET } from "./markets";
import { BOX_H, BOX_W, STRIPES, arrowButton } from "./styles";
import type { GameLine } from "@/lib/types";

// What a game-line button needs to know about the slip and existing bets.
export type LineBetting = {
  slipIds: Set<string>;
  pendingLineIds: Set<string>;
  weekLocked: boolean;
  onToggle: (line: GameLine) => void;
};

function Stripes() {
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: STRIPES, borderRadius: 4 }} />;
}

// A pending bet on the opposite side blocks this one.
function isConflicted(line: GameLine, gameLines: GameLine[], pendingLineIds: Set<string>): boolean {
  const oppMarket = OPPOSITE_MARKET[line.market];
  const oppLine = oppMarket ? gameLines.find((l) => l.market === oppMarket) : null;
  return !!oppLine && pendingLineIds.has(oppLine.id);
}

export function OddsBox({ line, gameLines, topLabel, betting }: {
  line?: GameLine;
  gameLines: GameLine[];
  topLabel?: string;
  betting: LineBetting;
}) {
  if (!line) return <div style={{ width: BOX_W, height: BOX_H }} />;

  const inSlip = betting.slipIds.has(`${line.id}:`);
  const conflicted = isConflicted(line, gameLines, betting.pendingLineIds);
  const disabled = betting.weekLocked || conflicted;

  return (
    <div style={{ position: "relative", width: BOX_W, height: BOX_H, borderRadius: 4, overflow: "hidden" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); if (!disabled) betting.onToggle(line); }}
        style={{
          width: "100%", height: "100%", borderRadius: 4, boxSizing: "border-box",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          cursor: disabled ? "default" : "pointer",
          background: inSlip ? "var(--accent-dim)" : "var(--surface-3)",
          border: inSlip ? "1.5px solid var(--accent)" : "1.5px solid transparent",
          outline: "none",
          transition: "all 0.1s",
          padding: 0,
        }}
      >
        {topLabel && (
          <div style={{
            fontSize: "0.62rem", fontWeight: 400, color: inSlip ? "var(--accent)" : "var(--text)",
            fontVariantNumeric: "tabular-nums", lineHeight: 1,
          }}>
            {topLabel}
          </div>
        )}
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--accent)", lineHeight: 1, letterSpacing: "-0.02em" }}>
          {fmtOdds(line.odds)}
        </div>
      </button>
      {conflicted && <Stripes />}
    </div>
  );
}

// A wide box for one side of an alternate spread or total.
export function AltLineBox({ line, label, value, pairedLineId, betting }: {
  line?: GameLine | null;
  label: string;
  value: string;
  pairedLineId?: string;
  betting: LineBetting;
}) {
  if (!line) return <div style={{ flex: 1 }} />;

  const inSlip = betting.slipIds.has(`${line.id}:`);
  const conflicted = !!pairedLineId && betting.pendingLineIds.has(pairedLineId);
  const disabled = betting.weekLocked || conflicted;

  return (
    <div style={{ flex: 1, position: "relative", borderRadius: 4, overflow: "hidden" }}>
      <button type="button" disabled={disabled}
        onClick={() => !disabled && betting.onToggle(line)}
        style={{
          width: "100%", height: 56, borderRadius: 4, boxSizing: "border-box", textAlign: "left",
          display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 10px",
          cursor: disabled ? "default" : "pointer",
          background: inSlip ? "var(--accent-dim)" : "var(--surface-3)",
          border: inSlip ? "1.5px solid var(--accent)" : "none",
          outline: "none", fontWeight: 400, position: "relative",
        }}>
        <span style={{
          fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
          color: inSlip ? "var(--accent)" : "var(--text-2)",
        }}>
          {label}
        </span>
        <span style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          fontSize: "0.7rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--accent)",
        }}>
          {fmtOdds(line.odds)}
        </span>
        <div style={{ fontSize: "0.85rem", fontVariantNumeric: "tabular-nums", color: inSlip ? "var(--accent)" : "var(--text)" }}>
          {value}
        </div>
      </button>
      {conflicted && <Stripes />}
    </div>
  );
}

// Horizontal strip of alternate line values; the selected one is larger.
export function AltLinePicker({ values, selected, onSelect }: {
  values: string[];
  selected: number;
  onSelect: (idx: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scroll = (dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div style={{ display: "flex", alignItems: "center", padding: "8px 2px" }}>
      <button type="button" onClick={() => scroll(-80)} style={arrowButton}>‹</button>
      <div ref={scrollRef} style={{ flex: 1, overflowX: "auto", scrollbarWidth: "none" }}>
        <div style={{ display: "flex", gap: 14, padding: "2px 4px" }}>
          {values.map((value, i) => (
            <span key={i} onClick={() => onSelect(i)} style={{
              flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
              fontSize: i === selected ? "0.85rem" : "0.72rem",
              fontWeight: 400,
              color: i === selected ? "var(--text)" : "var(--text-3)",
            }}>{value}</span>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => scroll(80)} style={arrowButton}>›</button>
    </div>
  );
}
