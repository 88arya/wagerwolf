"use client";

import type { ReactNode } from "react";
import { getTeamBannerColor, getTeamFullName, getTeamLogoUrl } from "@/lib/teamLogos";
import { fmtCountdown, fmtGameTime } from "./markets";
import type { Game } from "@/lib/types";

const CARD_BG = "var(--surface)";
const TEAM_TILE = 124;

function Icon({ d, frame = true }: { d: string; frame?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      {frame && <path d="M0 0h24v24H0z" fill="none" />}
      <path fill="currentColor" d={d} />
    </svg>
  );
}

const CALENDAR = "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 16H5V8h14zM7 10h5v5H7z";
const TIMER = "M15 1H9v2h6zm-4 13h2V8h-2zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0 0 12 4a9 9 0 0 0-9 9a9 9 0 0 0 9 9a8.994 8.994 0 0 0 7.03-14.61M12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7s7 3.13 7 7s-3.13 7-7 7";
const STADIUM = "M3 7V3l4 2zm15 0V3l4 2zm-7-1V2l4 2zm0 16q-1.9-.05-3.537-.312t-2.85-.663T2.7 20.1T2 19v-9q0-.625.788-1.162t2.137-.95t3.175-.65T12 7t3.9.238t3.175.65t2.138.95T22 10v9q0 .575-.7 1.1t-1.912.925t-2.85.663T13 22v-4h-2zm1-11q2.425 0 4.188-.288T19 10.05q0-.125-1.9-.587T12 9t-5.1.463t-1.9.587q1.05.375 2.812.663T12 11m-3 8.85V16h6v3.85q2-.2 3.275-.587T20 18.575V11.8q-1.375.55-3.45.875T12 13t-4.55-.325T4 11.8v6.775q.45.3 1.725.688T9 19.85m3-4.025";
const CLOUD = "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96";
const THERMOMETER = "M15 13V5a3 3 0 0 0-6 0v8a5 5 0 1 0 6 0m-3-9a1 1 0 0 1 1 1v3h-2V5a1 1 0 0 1 1-1";

function TeamSide({ team, record }: { team: string; record: string | null | undefined }) {
  const url = getTeamLogoUrl(team);
  return (
    <div style={{
      flex: 1, minWidth: 0, height: TEAM_TILE,
      background: getTeamBannerColor(team), padding: "10px 14px",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 6,
    }}>
      {url && <img src={url} alt="" width={38} height={38} referrerPolicy="no-referrer" style={{ objectFit: "contain", flexShrink: 0 }} />}
      <div style={{
        fontSize: "0.8rem", fontWeight: 700, color: "#FFFFFF", textAlign: "center",
        lineHeight: 1.25, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {getTeamFullName(team)}
      </div>
      {record && (
        <div style={{
          fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.08em",
          color: "#FFFFFF", opacity: 0.75, lineHeight: 1, fontVariantNumeric: "tabular-nums",
        }}>
          {record}
        </div>
      )}
    </div>
  );
}

function metaItems(game: Game): Array<{ label: string; value: string; icon: ReactNode }> {
  const items = [{ label: "Kickoff", value: fmtGameTime(game.gameDate), icon: <Icon d={CALENDAR} /> }];
  const countdown = fmtCountdown(game.gameDate);
  if (countdown) items.push({ label: "Bets lock in", value: countdown, icon: <Icon d={TIMER} /> });
  if (game.indoor != null) items.push({ label: "Stadium type", value: game.indoor ? "Indoors" : "Outdoors", icon: <Icon d={STADIUM} /> });
  // Weather is the city forecast, so only shown for outdoor games.
  if (game.indoor === false && game.weather) items.push({ label: "Weather", value: game.weather, icon: <Icon d={CLOUD} frame={false} /> });
  if (game.indoor === false && game.weatherTemp != null) items.push({ label: "Temperature", value: `${game.weatherTemp}°`, icon: <Icon d={THERMOMETER} /> });
  return items;
}

export default function GameHeader({ game }: { game: Game }) {
  return (
    <div style={{ marginBottom: 12, borderRadius: "var(--radius)", background: CARD_BG, padding: 12 }}>
      <div style={{ position: "relative", display: "flex", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
        <TeamSide team={game.awayTeam} record={game.awayRecord} />
        <TeamSide team={game.homeTeam} record={game.homeRecord} />
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 30, height: 30, borderRadius: "50%",
          background: CARD_BG,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "0.5rem", fontWeight: 500, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--text-3)",
        }}>
          at
        </div>
      </div>

      <div style={{
        display: "flex", flexDirection: "row", alignItems: "flex-start",
        justifyContent: "center", gap: 24, flexWrap: "wrap", paddingTop: 14,
      }}>
        {metaItems(game).map((item) => (
          <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: "0.5rem", fontWeight: 500, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--text-3)", whiteSpace: "nowrap",
            }}>
              {item.icon}
              {item.label}
            </div>
            <div style={{
              fontSize: "0.72rem", fontWeight: 600, color: "var(--text)",
              whiteSpace: "nowrap", textAlign: "center", lineHeight: 1.2,
            }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
