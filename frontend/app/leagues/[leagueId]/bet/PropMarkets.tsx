"use client";

import { Fragment, useState } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { getTeamLogoUrl } from "@/lib/teamLogos";
import { fmtOdds } from "@/lib/odds";
import { closestToEvenIdx, closestToEvenLine, propLadderLines, propLadderOdds } from "./propLadder";
import { fmtStatType } from "./markets";
import { BOX_GAP, BOX_H, PROP_BOX_W, STRIPES, hairline, panel, sectionTitle } from "./styles";
import type { Direction, Prop } from "@/lib/types";
import type { SlipLeg } from "@/components/BetSlip";


export type PropBetting = {
  slipLegs: SlipLeg[];
  submittedPropIds: Set<string>;
  pendingPropDirs: Map<string, string>;
  weekLocked: boolean;
  onBet: (prop: Prop, direction: Direction, line: number) => void;
};

const ladderArrow = (enabled: boolean) => ({
  width: 16, height: BOX_H, background: "none", border: "none", padding: 0,
  cursor: enabled ? "pointer" : "default", color: enabled ? "var(--text-2)" : "transparent",
  fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center",
});

// One player: name on the left, three Over boxes from the alt ladder on the right.
function PropPlayerRow({ prop, betting }: { prop: Prop; betting: PropBetting }) {
  const { slipLegs, submittedPropIds, pendingPropDirs, weekLocked, onBet } = betting;
  const placed = submittedPropIds.has(prop.id);
  const pendingDir = pendingPropDirs.get(prop.id);
  const ladderLines = propLadderLines(prop);
  const maxScrollIdx = Math.max(0, ladderLines.length - 3);
  const [scrollIdx, setScrollIdx] = useState(() =>
    Math.min(maxScrollIdx, Math.max(0, closestToEvenIdx(prop) - 1)),
  );
  const visibleIndices = [scrollIdx, scrollIdx + 1, scrollIdx + 2].filter((i) => i < ladderLines.length);
  const logoUrl = getTeamLogoUrl(prop.player?.team ?? "");

  // Can't bet the other side of a pending pick.
  const blockedDir = (dir: Direction) => !!pendingDir && pendingDir !== dir;

  const activeLeg = (direction: Direction, line: number) =>
    slipLegs.find((l) =>
      l.id === prop.id && l.direction === direction &&
      Math.abs((l.altLine ?? l.line ?? 0) - line) < 0.001,
    );

  return (
    <div style={{ height: BOX_H, padding: "0 12px", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <PlayerAvatar playerId={prop.player?.id} espnId={prop.player?.espnId} imageUrl={prop.player?.imageUrl} name={prop.player?.name} size={34} />
          {prop.player?.team && (
            <div style={{
              position: "absolute", bottom: -4, right: -4, width: 18, height: 18,
              borderRadius: "50%", border: "2px solid var(--surface)",
              background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}>
              {logoUrl
                ? <img src={logoUrl} alt={prop.player.team} width={12} height={12} style={{ objectFit: "contain" }} />
                : <span style={{ fontSize: 5, fontWeight: 800, color: "var(--text-2)" }}>{prop.player.team.substring(0, 2)}</span>
              }
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ fontWeight: 400, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.25 }}>
            {prop.player?.name}
            {placed && <span style={{ marginLeft: 5, fontSize: "0.6rem", color: "var(--win)", fontWeight: 700 }}>✓</span>}
          </div>
          {prop.player?.position && (
            <div style={{ fontSize: "0.68rem", color: "var(--text-3)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {prop.player.position}{prop.player?.jersey && ` #${prop.player.jersey}`}
            </div>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
        <button type="button" onClick={() => setScrollIdx((s) => Math.max(0, s - 1))} style={ladderArrow(scrollIdx > 0)}>‹</button>

        <div style={{ display: "flex", gap: BOX_GAP }}>
          {visibleIndices.map((idx) => {
            const line = ladderLines[idx];
            const selected = !!activeLeg("OVER", line);
            const blocked = blockedDir("OVER") && !selected;
            const clickable = !weekLocked && !blocked;
            const color = selected ? "var(--accent)" : blocked ? "var(--text-4)" : undefined;

            return (
              <button key={idx} type="button"
                disabled={!clickable}
                onClick={() => { if (clickable) onBet(prop, "OVER", line); }}
                style={{
                  position: "relative", width: PROP_BOX_W, height: BOX_H, borderRadius: 4, overflow: "hidden", flexShrink: 0,
                  border: "none", padding: 0, outline: "none",
                  cursor: clickable ? "pointer" : "default",
                  background: selected ? "var(--accent-dim)" : "var(--surface-3)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <div style={{ fontSize: "0.62rem", fontWeight: 400, color: color ?? "var(--text)", lineHeight: 1 }}>
                  {Math.round((line + 0.5) * 100) / 100}+
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: color ?? "var(--accent)", lineHeight: 1 }}>
                  {weekLocked || blocked ? "—" : fmtOdds(propLadderOdds(prop, line, "OVER"))}
                </div>
                {blocked && <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: STRIPES }} />}
              </button>
            );
          })}
        </div>

        <button type="button" onClick={() => setScrollIdx((s) => Math.min(maxScrollIdx, s + 1))} style={ladderArrow(scrollIdx < maxScrollIdx)}>›</button>
      </div>
    </div>
  );
}

// Props grouped into one collapsible card per stat type.
export default function PropMarkets({ props, dpr, collapsed, onToggleCollapsed, betting }: {
  props: Prop[];
  dpr: number;
  collapsed: Set<string>;
  onToggleCollapsed: (statType: string) => void;
  betting: PropBetting;
}) {
  const groups = new Map<string, Prop[]>();
  for (const p of props) groups.set(p.statType, [...(groups.get(p.statType) ?? []), p]);
  if (groups.size === 0) return null;

  return (
    <div style={panel}>
      {[...groups].map(([statType, groupProps], i) => {
        const isCollapsed = collapsed.has(statType);
        const sorted = [...groupProps].sort((a, b) =>
          (closestToEvenLine(b) - closestToEvenLine(a)) ||
          (b.line - a.line) ||
          ((a.odds ?? -110) - (b.odds ?? -110)),
        );
        return (
          <Fragment key={statType}>
            {i > 0 && <div style={hairline(dpr)} />}
            <div style={{ padding: "10px 12px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={sectionTitle}>{fmtStatType(statType)}</div>
              <button type="button"
                onClick={() => onToggleCollapsed(statType)}
                aria-label={isCollapsed ? "Expand" : "Collapse"}
                style={{ background: "none", border: "none", padding: 4, margin: "-4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                  <polyline points="1,3 5,7 9,3" />
                </svg>
              </button>
            </div>
            {!isCollapsed && (betting.weekLocked
              ? <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.82rem", padding: "10px 12px" }}>Betting locked</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: BOX_GAP, paddingBottom: 8 }}>
                  {sorted.map((prop) => <PropPlayerRow key={prop.id} prop={prop} betting={betting} />)}
                </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
