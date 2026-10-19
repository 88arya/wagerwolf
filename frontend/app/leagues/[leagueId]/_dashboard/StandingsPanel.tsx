import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import Panel from "./Panel";
import type { Standing } from "@/lib/types";

const COLUMNS = "22px 1fr 20px 20px 20px 26px";

const stat = {
  fontSize: "0.72rem", fontWeight: 400, color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums",
} as const;

function StandingRow({ member, isMe, isLast, gamesBack, helmetColor }: {
  member: Standing;
  isMe: boolean;
  isLast: boolean;
  gamesBack: number;
  helmetColor: string;
}) {
  const name = member.displayName;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: COLUMNS, padding: "6px 12px",
      borderBottom: isLast ? "none" : "1px solid var(--border)",
      background: "transparent", alignItems: "center", transition: "background 0.12s", gap: 6,
    }}>
      <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "var(--text)" }}>{member.rank}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <HelmetAvatar color={helmetColor} initials={name.slice(0, 2)} size={24} />
        <span style={{
          fontWeight: isMe ? 700 : 400, fontSize: "0.8rem", color: "var(--text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72,
        }}>
          {name.length > 7 ? name.slice(0, 7) + "…" : name}
        </span>
      </div>
      <span style={stat}>{member.wins}</span>
      <span style={stat}>{member.losses}</span>
      <span style={stat}>{member.ties}</span>
      <span style={stat}>{gamesBack === 0 ? "--" : String(gamesBack)}</span>
    </div>
  );
}

// Members are already in rank order from the leaderboard endpoint.
export default function StandingsPanel({ members, userId, helmetColors }: {
  members: Standing[];
  userId: string;
  helmetColors: Record<string, string>;
}) {
  const leader = members[0];
  return (
    <div className="lg-rail" style={{ gridColumn: "3", gridRow: "1 / 4", minWidth: 0 }}>
      <Panel title="Standings">
        <div style={{
          display: "grid", gridTemplateColumns: COLUMNS, padding: "6px 12px", gap: 6,
          background: "var(--surface)", borderBottom: "1px solid var(--border)",
        }}>
          {["#", "Player", "W", "L", "T", "GB"].map((h, i) => (
            <span key={h} style={{
              fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
              color: "var(--text)", textAlign: i >= 2 ? "center" : "left",
            }}>{h}</span>
          ))}
        </div>
        {members.map((m, idx) => (
          <StandingRow
            key={m.userId}
            member={m}
            isMe={m.userId === userId}
            isLast={idx === members.length - 1}
            gamesBack={leader ? ((leader.wins - m.wins) + (m.losses - leader.losses)) / 2 : 0}
            helmetColor={helmetColors[m.userId] ?? ACCENT}
          />
        ))}
      </Panel>
    </div>
  );
}
