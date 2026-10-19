import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import { emptyText } from "./Panel";
import type { Standing } from "@/lib/types";

const W = 400;
const H = 190;
const MARGIN = { left: 30, right: 16, top: 14, bottom: 32 };
const X_PAD = 20;

const axisLabel = { fontSize: 8, fill: "var(--text-3)", fontFamily: "system-ui" } as const;

// Rank on x, movement since last week on y. The SVG draws the axes; helmets
// are HTML positioned over it in percentages so they scale with the chart.
export default function PowerRankingsChart({ rankings }: { rankings: (Standing & { powerRank: number })[] }) {
  const n = rankings.length;
  if (n === 0) {
    return (
      <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={emptyText}>No members yet</span>
      </div>
    );
  }

  const plotW = W - MARGIN.left - MARGIN.right;
  const plotH = H - MARGIN.top - MARGIN.bottom;
  const yMax = Math.max(1, n - 1);
  const clamp = (change: number) => Math.max(-yMax, Math.min(yMax, change));

  const xInPlot = (rank: number) => (n === 1 ? plotW / 2 : X_PAD + ((n - rank) / (n - 1)) * (plotW - 2 * X_PAD));
  const x = (rank: number) => MARGIN.left + xInPlot(rank);
  const y = (change: number) => MARGIN.top + plotH / 2 - (clamp(change) / yMax) * (plotH / 2);
  const xPct = (rank: number) => (n === 1 ? 50 : (xInPlot(rank) / plotW) * 100);
  const yPct = (change: number) => ((1 - clamp(change) / yMax) / 2) * 100;

  const yTicks = [-yMax, -Math.round(yMax / 2), 0, Math.round(yMax / 2), yMax]
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        {yTicks.map((v) => (
          <line key={v} x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(v)} y2={y(v)}
            stroke={v === 0 ? "var(--border-2)" : "var(--border)"}
            strokeWidth={v === 0 ? 1.5 : 0.75}
            strokeDasharray={v === 0 ? undefined : "3 3"} />
        ))}
        {yTicks.map((v) => (
          <text key={v} x={MARGIN.left - 5} y={y(v) + 3.5} textAnchor="end" {...axisLabel}>
            {v > 0 ? `+${v}` : v}
          </text>
        ))}
        <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={MARGIN.top + plotH + 6} y2={MARGIN.top + plotH + 6}
          stroke="var(--border)" strokeWidth={0.75} />
        {rankings.map((m) => (
          <text key={m.userId} x={x(m.powerRank)} y={H - 4} textAnchor="middle" {...axisLabel}>
            {m.powerRank}
          </text>
        ))}
      </svg>

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute",
          top: `${MARGIN.top / H * 100}%`,
          left: `${MARGIN.left / W * 100}%`,
          right: `${MARGIN.right / W * 100}%`,
          bottom: `${MARGIN.bottom / H * 100}%`,
        }}>
          {rankings.map((m) => {
            const change = m.prevRank != null ? m.prevRank - m.powerRank : 0;
            const abbr = m.abbreviation || m.displayName.slice(0, 3).toUpperCase();
            return (
              <div key={m.userId} style={{
                position: "absolute", left: `${xPct(m.powerRank)}%`, top: `${yPct(change)}%`,
                transform: "translate(-50%, -50%)",
                display: "flex", flexDirection: "row", alignItems: "center", gap: 3, pointerEvents: "auto",
              }}>
                <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={abbr} size={24} />
                <span style={{ fontSize: "0.45rem", fontWeight: 800, color: "var(--text-2)", letterSpacing: "0.04em", lineHeight: 1, whiteSpace: "nowrap" }}>
                  {abbr}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
