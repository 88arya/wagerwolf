"use client";

import GameLinesGrid from "./GameLinesGrid";
import { AltLineBox, AltLinePicker, type LineBetting } from "./OddsBox";
import { fmtSpread } from "./markets";
import { BOX_GAP, hairline, panel, sectionTitle } from "./styles";
import type { Game } from "@/lib/types";

// The "Game Lines" tab: main lines, then alternate spread and total pickers.
export default function GameLines({ game, dpr, betting, altSpreadIdx, onAltSpread, altTotalIdx, onAltTotal }: {
  game: Game;
  dpr: number;
  betting: LineBetting;
  altSpreadIdx: number;
  onAltSpread: (idx: number) => void;
  altTotalIdx: number;
  onAltTotal: (idx: number) => void;
}) {
  const lines = game.gameLines ?? [];
  if (lines.length === 0) {
    return (
      <div className="card"><div className="empty"><div className="empty-icon">📊</div><div className="empty-text">No lines for this game</div></div></div>
    );
  }

  const altLines = lines.filter((l) => l.market.startsWith("ALT_"));
  const altSpreadRows = altLines
    .filter((l) => l.market.startsWith("ALT_SPREAD_HOME_"))
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
    .map((homeL) => ({
      homeL,
      awayL: altLines.find((l) => l.market.startsWith("ALT_SPREAD_AWAY_") && Math.abs((l.line ?? 0) + (homeL.line ?? 0)) < 0.01) ?? null,
    }));
  const altTotalRows = altLines
    .filter((l) => l.market.startsWith("ALT_TOTAL_OVER_"))
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
    .map((overL) => ({
      overL,
      underL: altLines.find((l) => l.market === `ALT_TOTAL_UNDER_${overL.line}`) ?? null,
    }));

  const divider = <div style={hairline(dpr)} />;

  return (
    <div style={panel}>
      <div style={{ paddingTop: 8 }}>
        <GameLinesGrid game={game} separator="VS" betting={betting} />
        <div style={{ height: 12 }} />
      </div>

      {altSpreadRows.length > 0 && (() => {
        const idx = Math.min(altSpreadIdx, altSpreadRows.length - 1);
        const { homeL, awayL } = altSpreadRows[idx];
        return (
          <>
            {divider}
            <div>
              <div style={{ padding: "10px 12px 8px", ...sectionTitle }}>Alternate Spread</div>
              <div style={{ display: "flex", gap: BOX_GAP, padding: "0 12px" }}>
                <AltLineBox line={awayL} label={game.awayTeam} value={fmtSpread(awayL?.line ?? 0)} pairedLineId={homeL?.id} betting={betting} />
                <AltLineBox line={homeL} label={game.homeTeam} value={fmtSpread(homeL.line ?? 0)} pairedLineId={awayL?.id} betting={betting} />
              </div>
              <AltLinePicker values={altSpreadRows.map((r) => fmtSpread(r.homeL.line ?? 0))} selected={idx} onSelect={onAltSpread} />
              <div style={{ height: 6 }} />
            </div>
          </>
        );
      })()}

      {altTotalRows.length > 0 && (() => {
        const idx = Math.min(altTotalIdx, altTotalRows.length - 1);
        const { overL, underL } = altTotalRows[idx];
        const value = String(overL.line);
        return (
          <>
            {divider}
            <div>
              <div style={{ padding: "10px 12px 8px", ...sectionTitle }}>Alternate Total</div>
              <div style={{ display: "flex", gap: BOX_GAP, padding: "0 12px" }}>
                <AltLineBox line={overL} label="Over" value={value} pairedLineId={underL?.id} betting={betting} />
                <AltLineBox line={underL} label="Under" value={value} pairedLineId={overL?.id} betting={betting} />
              </div>
              <AltLinePicker values={altTotalRows.map((r) => String(r.overL.line))} selected={idx} onSelect={onAltTotal} />
              <div style={{ height: 6 }} />
            </div>
          </>
        );
      })()}
    </div>
  );
}
