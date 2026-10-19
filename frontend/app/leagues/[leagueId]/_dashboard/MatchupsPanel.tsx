import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import { fmtMoney } from "@/lib/money";
import Panel, { emptyText } from "./Panel";
import type { Matchup } from "@/lib/types";


function Side({ name, color, isMe }: { name: string; color: string; isMe: boolean }) {
  const ghost = name === "Ghost";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <HelmetAvatar color={ghost ? "#ffffff" : color} initials={name.slice(0, 2)} size={20} />
      <span style={{
        fontWeight: isMe ? 700 : 400, fontSize: "0.75rem", color: "var(--text)", fontStyle: ghost ? "italic" : "normal",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {name}
      </span>
    </div>
  );
}

const score = { fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" } as const;

// This week's head-to-head pairings with each side's profit so far.
export default function MatchupsPanel({ matchups, userId, helmetColors }: {
  matchups: Matchup[];
  userId: string;
  helmetColors: Record<string, string>;
}) {
  return (
    <Panel title="Matchups" className="card lg-main" style={{ gridColumn: "1", gridRow: "2 / 4", minWidth: 0 }}>
      {matchups.length === 0 ? (
        <div style={{ padding: "12px 12px" }}>
          <span style={emptyText}>No matchups yet</span>
        </div>
      ) : matchups.map((m, idx) => (
        <div key={m.id} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 12px",
          borderBottom: idx < matchups.length - 1 ? "1px solid var(--border)" : "none",
          background: "transparent", gap: 8,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
            <Side name={m.homeUser?.displayName ?? "—"} color={helmetColors[m.homeUserId] ?? ACCENT} isMe={m.homeUserId === userId} />
            <Side name={m.awayUser?.displayName ?? "—"} color={helmetColors[m.awayUserId] ?? ACCENT} isMe={m.awayUserId === userId} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
            <span style={score}>{fmtMoney(m.homeProfit ?? 0)}</span>
            <span style={score}>{fmtMoney(m.awayProfit ?? 0)}</span>
          </div>
        </div>
      ))}
    </Panel>
  );
}
