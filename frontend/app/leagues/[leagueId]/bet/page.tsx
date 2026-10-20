"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useDevicePixelRatio } from "@/lib/hairline";
import BetSlip, { addToSlip, removeFromSlip, getBetSlip, type SlipLeg } from "@/components/BetSlip";
import GameHeader from "./GameHeader";
import GameLines from "./GameLines";
import GameLinesGrid from "./GameLinesGrid";
import PropMarkets, { type PropBetting } from "./PropMarkets";
import type { LineBetting } from "./OddsBox";
import { PROP_TABS, fmtGameTime, propTab } from "./markets";
import { propLadderOdds } from "./propLadder";
import { arrowButton, hairline, pageStyle, panel } from "./styles";
import type { Direction, Game, GameLine, GamePick, Pick, Prop, Week } from "@/lib/types";


function slipKeys(slip: SlipLeg[]) {
  return new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`));
}

function LockedBanner() {
  return (
    <div style={{
      background: "var(--loss-bg)", border: "1px solid var(--loss-border)",
      borderRadius: 8, padding: "10px 14px", marginBottom: 10,
    }}>
      <div style={{ color: "var(--loss)", fontWeight: 700, fontSize: "0.82rem" }}>
        🔒 Betting is locked for this week
      </div>
    </div>
  );
}

function EmptyCard({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="card">
      <div className="empty"><div className="empty-icon">{icon}</div><div className="empty-text">{text}</div></div>
    </div>
  );
}

function SectionTabs({ tabs, active, onSelect }: {
  tabs: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const scroll = (dir: -1 | 1) => barRef.current?.scrollBy({ left: dir * 120, behavior: "smooth" });
  const arrow = { ...arrowButton, height: 36, padding: 0 };

  return (
    <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 2 }}>
      <button type="button" onClick={() => scroll(-1)} style={arrow}>‹</button>
      <div ref={barRef} className="tab-bar" style={{ flex: 1, flexWrap: "nowrap", overflow: "hidden" }}>
        {tabs.map(({ key, label }) => (
          <button key={key} type="button"
            className={`tab-btn${active === key ? " active" : ""}`}
            onClick={(e) => {
              onSelect(key);
              // Bring a partly hidden tab fully into view.
              const btn = e.currentTarget.getBoundingClientRect();
              const bar = barRef.current;
              if (!bar) return;
              const box = bar.getBoundingClientRect();
              if (btn.left < box.left) bar.scrollLeft -= box.left - btn.left + 8;
              else if (btn.right > box.right) bar.scrollLeft += btn.right - box.right + 8;
            }}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => scroll(1)} style={arrow}>›</button>
    </div>
  );
}

export default function BetPage({ params }: PageProps<"/leagues/[leagueId]/bet">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dpr = useDevicePixelRatio();
  const [leagueId, setLeagueId] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [weekLocked, setWeekLocked] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [betSection, setBetSection] = useState("lines");
  // Props with any pick (for the ✓), and the direction of each pending prop pick.
  const [submittedPropIds, setSubmittedPropIds] = useState<Set<string>>(new Set());
  const [pendingPropDirs, setPendingPropDirs] = useState<Map<string, string>>(new Map());
  const [pendingLineIds, setPendingLineIds] = useState<Set<string>>(new Set());
  const [slipIds, setSlipIds] = useState<Set<string>>(new Set());
  const [slipLegs, setSlipLegs] = useState<SlipLeg[]>([]);
  const [altSpreadIdx, setAltSpreadIdx] = useState(0);
  const [altTotalIdx, setAltTotalIdx] = useState(0);
  const [collapsedMarkets, setCollapsedMarkets] = useState<Set<string>>(new Set());

  function toggleMarketCollapsed(statType: string) {
    setCollapsedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(statType)) next.delete(statType); else next.add(statType);
      return next;
    });
  }

  // Existing bets this week, used to show ✓ and to block betting the opposite side.
  async function loadSubmitted(lid: string, weekGames: Game[]) {
    try {
      const [existingPicks, existingGamePicks]: [Pick[], GamePick[]] = await Promise.all([
        api(`/picks?leagueId=${lid}`),
        api(`/gamepicks?leagueId=${lid}`),
      ]);
      const propIds = new Set(weekGames.flatMap((g) => (g.props ?? []).map((p) => p.id)));
      const lineIds = new Set(weekGames.flatMap((g) => (g.gameLines ?? []).map((l) => l.id)));
      const weekPicks = existingPicks.filter((p) => propIds.has(p.propId));
      const weekGamePicks = existingGamePicks.filter((p) => lineIds.has(p.gameLineId));

      setSubmittedPropIds(new Set(weekPicks.map((p) => p.propId)));
      setPendingPropDirs(new Map(weekPicks.filter((p) => p.outcome === "PENDING").map((p) => [p.propId, p.direction])));
      setPendingLineIds(new Set(weekGamePicks.filter((p) => p.outcome === "PENDING").map((p) => p.gameLineId)));
    } catch {}
  }

  useEffect(() => {
    let weekGames: Game[] = [];
    let lid = "";

    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      lid = (await params).leagueId;
      setLeagueId(lid);
      try {
        const weeks: Week[] = await api(`/weeks?current=true&leagueId=${lid}`);
        if (weeks?.length) {
          const week = weeks[0];
          setWeekLocked(week.locked || week.resolved);
          weekGames = week.games ?? [];
          setGames(weekGames);
          await loadSubmitted(lid, weekGames);

          const gid = searchParams.get("gameId");
          const target = gid && weekGames.find((g) => g.id === gid);
          if (target) setSelectedGame(target);
        }
      } catch {}
      onSlipUpdate();
    }

    function onSlipUpdate() {
      const slip = getBetSlip();
      setSlipIds(slipKeys(slip));
      setSlipLegs(slip);
    }
    const onBetPlaced = () => loadSubmitted(lid, weekGames);

    load();
    window.addEventListener("betslip-update", onSlipUpdate);
    window.addEventListener("bet-placed", onBetPlaced);
    return () => {
      window.removeEventListener("betslip-update", onSlipUpdate);
      window.removeEventListener("bet-placed", onBetPlaced);
    };
  }, []);

  useEffect(() => { setAltSpreadIdx(0); setAltTotalIdx(0); }, [selectedGame?.id]);

  useEffect(() => {
    const gid = searchParams.get("gameId");
    if (!gid || !games.length || selectedGame?.id === gid) return;
    const target = games.find((g) => g.id === gid);
    if (target) setSelectedGame(target);
  }, [searchParams, games]);

  function toggleLineInSlip(line: GameLine) {
    if (slipIds.has(`${line.id}:`)) { removeFromSlip(line.id, undefined); return; }
    const game = games.find((g) => (g.gameLines ?? []).some((l) => l.id === line.id));
    addToSlip({
      type: "gameline", id: line.id, label: line.label, odds: line.odds,
      market: line.market, line: line.line ?? undefined,
      gameId: game?.id,
      gameDate: game?.gameDate,
      team: line.market.includes("HOME") ? game?.homeTeam : line.market.includes("AWAY") ? game?.awayTeam : undefined,
      homeTeam: game?.homeTeam,
      awayTeam: game?.awayTeam,
    });
  }

  function togglePropInSlip(prop: Prop, direction: Direction, line: number) {
    // Read the slip fresh; React state can lag behind localStorage.
    const existing = getBetSlip().find((l) => l.id === prop.id && l.direction === direction);
    if (existing) {
      removeFromSlip(prop.id, direction, existing.altLine);
      // Clicking the line that's already selected just removes it.
      if (Math.abs((existing.altLine ?? existing.line ?? 0) - line) < 0.001) return;
    }
    const isMainLine = Math.abs(line - prop.line) < 0.001;
    const game = games.find((g) => g.id === prop.gameId);
    addToSlip({
      type: "prop", id: prop.id, direction,
      label: `${prop.player?.name} ${direction} ${line} ${prop.statType.split("_").join(" ")}`,
      odds: propLadderOdds(prop, line, direction),
      line: prop.line, statType: prop.statType,
      altLine: isMainLine ? undefined : line,
      gameId: prop.gameId,
      gameDate: game?.gameDate,
      playerId: prop.player?.id,
      espnId: prop.player?.espnId ?? undefined,
      imageUrl: prop.player?.imageUrl ?? undefined,
      playerName: prop.player?.name,
      team: prop.player?.team,
      homeTeam: game?.homeTeam,
      awayTeam: game?.awayTeam,
    });
  }

  const lineBetting: LineBetting = { slipIds, pendingLineIds, weekLocked, onToggle: toggleLineInSlip };
  const propBetting: PropBetting = { slipLegs, submittedPropIds, pendingPropDirs, weekLocked, onBet: togglePropInSlip };

  if (selectedGame) {
    const gameProps = selectedGame.props ?? [];
    const gameLines = selectedGame.gameLines ?? [];
    const tabs = [
      { key: "lines", label: "Game Lines" },
      ...PROP_TABS.filter((t) => gameProps.some((p) => propTab(p.statType) === t.key)),
    ];
    const section = tabs.some((t) => t.key === betSection) ? betSection : "lines";

    return (
      <>
        <div className="page bet-layout" style={pageStyle(dpr)}>
          <div className="bet-board">
          <button
            className="ghost"
            style={{ fontSize: "0.78rem", padding: "5px 10px", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setSelectedGame(null)}
          >
            ← All Games
          </button>

          <GameHeader game={selectedGame} />
          {weekLocked && <LockedBanner />}
          <SectionTabs tabs={tabs} active={section} onSelect={setBetSection} />

          {section === "lines" ? (
            <GameLines
              game={selectedGame}
              dpr={dpr}
              betting={lineBetting}
              altSpreadIdx={altSpreadIdx}
              onAltSpread={setAltSpreadIdx}
              altTotalIdx={altTotalIdx}
              onAltTotal={setAltTotalIdx}
            />
          ) : (
            <PropMarkets
              props={gameProps.filter((p) => propTab(p.statType) === section)}
              dpr={dpr}
              collapsed={collapsedMarkets}
              onToggleCollapsed={toggleMarketCollapsed}
              betting={propBetting}
            />
          )}

          {gameLines.length === 0 && gameProps.length === 0 && (
            <EmptyCard icon="🏈" text="No bets available for this game" />
          )}
          </div>

          <BetSlip leagueId={leagueId} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page bet-layout" style={pageStyle(dpr)}>
        <div className="bet-board">
        {weekLocked && <LockedBanner />}
        {games.length === 0 && <EmptyCard icon="🏈" text="No games this week" />}

        <div style={panel}>
          {games.map((game, i) => (
            <Fragment key={game.id}>
              {i > 0 && <div style={hairline(dpr)} />}
              <div style={{ overflow: "visible", padding: "4px 0" }}>
                <GameLinesGrid game={game} separator="AT" betting={lineBetting} />
                <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text)", fontWeight: 600 }}>
                    {fmtGameTime(game.gameDate)}
                    {game.status === "FINAL" && <span style={{ marginLeft: 6, color: "var(--text-3)", fontWeight: 700 }}>· FINAL</span>}
                    {game.status === "CANCELLED" && <span style={{ marginLeft: 6, color: "var(--loss)", fontWeight: 700 }}>· CANCELLED</span>}
                  </span>
                  <span
                    style={{ fontSize: "0.72rem", color: "var(--text)", cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2 }}
                    onClick={() => setSelectedGame(game)}
                  >
                    More Bets
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M0 0h24v24H0z" fill="none" />
                      <path fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" d="M11.273 3.687a1 1 0 1 1 1.454-1.374l8.5 9a1 1 0 0 1 0 1.374l-8.5 9.001a1 1 0 1 1-1.454-1.373L19.125 12z" />
                    </svg>
                  </span>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
        </div>

        <BetSlip leagueId={leagueId} />
      </div>
    </>
  );
}
