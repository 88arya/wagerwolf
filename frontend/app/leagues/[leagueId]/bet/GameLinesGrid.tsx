"use client";

import TeamLogo from "@/components/TeamLogo";
import { getTeamDisplayName } from "@/lib/teamLogos";
import { OddsBox, type LineBetting } from "./OddsBox";
import { fmtSpread } from "./markets";
import { BOX_GAP, BOX_H, BOX_W, columnHeading, teamName } from "./styles";
import type { Game, GameLine } from "@/lib/types";

function TeamLabel({ team }: { team: string }) {
  return (
    <div style={{ height: BOX_H, display: "flex", alignItems: "center", gap: 8 }}>
      <TeamLogo team={team} size={26} />
      <span style={teamName}>{getTeamDisplayName(team)}</span>
    </div>
  );
}

// Away over home on the left, a 3x2 grid of spread / moneyline / total on the right.
export default function GameLinesGrid({ game, separator, betting }: {
  game: Game;
  separator: string;
  betting: LineBetting;
}) {
  const lines = game.gameLines ?? [];
  const find = (market: string) => lines.find((l) => l.market === market);
  const spAway = find("SPREAD_AWAY");
  const spHome = find("SPREAD_HOME");
  const totOver = find("TOTAL_OVER");
  const totUnder = find("TOTAL_UNDER");

  const box = (line: GameLine | undefined, topLabel?: string) => (
    <OddsBox line={line} gameLines={lines} topLabel={topLabel} betting={betting} />
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "0px 12px 3px", height: 22 }}>
        <div style={{ display: "flex", flexDirection: "row", gap: BOX_GAP, flexShrink: 0 }}>
          {(["Spread", "Moneyline", "Total"] as const).map((h) => (
            <div key={h} style={columnHeading}>{h}</div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, padding: "0 12px" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <TeamLabel team={game.awayTeam} />
          <div style={{ height: BOX_GAP, display: "flex", alignItems: "center", gap: 5, paddingLeft: 34, overflow: "visible" }}>
            <span style={{ fontSize: "0.45rem", color: "var(--text-3)", letterSpacing: "0.12em", flexShrink: 0, lineHeight: 1 }}>{separator}</span>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, var(--border), transparent)" }} />
          </div>
          <TeamLabel team={game.homeTeam} />
        </div>

        <div style={{
          flexShrink: 0, display: "grid",
          gridTemplateColumns: `repeat(3, ${BOX_W})`, gridTemplateRows: `${BOX_H}px ${BOX_H}px`,
          columnGap: BOX_GAP, rowGap: BOX_GAP,
        }}>
          {box(spAway, spAway?.line != null ? fmtSpread(spAway.line) : undefined)}
          {box(find("MONEYLINE_AWAY"))}
          {box(totOver, totOver?.line != null ? `O ${totOver.line}` : undefined)}
          {box(spHome, spHome?.line != null ? fmtSpread(spHome.line) : undefined)}
          {box(find("MONEYLINE_HOME"))}
          {box(totUnder, totUnder?.line != null ? `U ${totUnder.line}` : undefined)}
        </div>
      </div>
    </>
  );
}
