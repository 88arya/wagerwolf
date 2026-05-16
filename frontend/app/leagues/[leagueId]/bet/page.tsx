"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";
import BetSlip, { addToSlip, removeFromSlip, getBetSlip } from "@/components/BetSlip";
import TeamLogo from "@/components/TeamLogo";
import { getTeamSelectedColor, getTeamDisplayName, getTeamFullName, getTeamLogoUrl } from "@/lib/teamLogos";
import PlayerAvatar from "@/components/PlayerAvatar";

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

function fmtGameTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const PROP_OFFSETS = [-2, -1, 0, 1, 2];

function propStep(statType: string): number {
  const yardTypes = ["PASSING_YARDS","RUSHING_YARDS","RECEIVING_YARDS","PASSING_LONGEST","RUSHING_LONGEST","RECEIVING_LONGEST","FIELD_GOAL_LONGEST"];
  if (yardTypes.includes(statType)) return 5;
  if (statType === "KICKING_POINTS") return 1;
  return 0.5;
}

function propBlockLine(baseLine: number, offset: number, step: number): number {
  return Math.round((baseLine + offset * step) * 100) / 100;
}

function propBlockOdds(baseOdds: number, baseLine: number, altLine: number, statType: string, direction: "OVER" | "UNDER"): number {
  const step = propStep(statType);
  const steps = (altLine - baseLine) / step;
  const favSteps = direction === "OVER" ? -steps : steps;
  return Math.max(-500, Math.min(500, baseOdds - Math.round(favSteps * 15)));
}

const PR_BOX_W = 110;
const PR_BOX_H = 42;
const PR_BOX_GAP = 2;

function PropPlayerRow({ prop, slipLegs, submittedPropIds, pendingPropDirs, weekLocked, onBet }: {
  prop: any;
  slipLegs: any[];
  submittedPropIds: Set<string>;
  pendingPropDirs: Map<string, string>;
  weekLocked: boolean;
  onBet: (prop: any, direction: "OVER" | "UNDER", blockLine: number) => void;
}) {
  const [scrollIdx, setScrollIdx] = useState(1);
  const [hoveredBoxIdx, setHoveredBoxIdx] = useState<number | null>(null);

  const step = propStep(prop.statType);
  const placed = submittedPropIds.has(prop.id);
  const pendingDir = pendingPropDirs.get(prop.id);
  const visibleIndices = [scrollIdx, scrollIdx + 1, scrollIdx + 2];

  function isDirBlocked(dir: "OVER" | "UNDER"): boolean {
    // Rule 2: cannot bet opposite direction while a pending pick exists
    if (pendingDir && pendingDir !== dir) return true;
    return false;
  }
  const logoUrl = getTeamLogoUrl(prop.player?.team ?? "");

  function getActiveLeg(direction: "OVER" | "UNDER", blockLine: number) {
    return slipLegs.find((l: any) =>
      l.id === prop.id && l.direction === direction &&
      Math.abs((l.altLine ?? l.line ?? 0) - blockLine) < 0.001
    );
  }

  return (
    <div style={{ height: PR_BOX_H, padding: "0 12px", display: "flex", alignItems: "center", gap: 8 }}>
      {/* Player */}
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
        <div style={{ flex: 1, minWidth: 0, fontWeight: 400, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {prop.player?.name}{prop.player?.position && <span style={{ color: "var(--text-3)", marginLeft: 4 }}>· {prop.player.position}</span>}
          {placed && <span style={{ marginLeft: 5, fontSize: "0.6rem", color: "var(--win)", fontWeight: 700 }}>✓</span>}
        </div>
      </div>

      {/* Arrow + 3 boxes + Arrow */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
        <button type="button"
          onClick={() => { setScrollIdx(s => Math.max(0, s - 1)); setHoveredBoxIdx(null); }}
          style={{ width: 16, height: PR_BOX_H, background: "none", border: "none", padding: 0, cursor: scrollIdx > 0 ? "pointer" : "default", color: scrollIdx > 0 ? "var(--text-2)" : "transparent", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}
        >‹</button>

        <div style={{ display: "flex", gap: PR_BOX_GAP }}>
          {visibleIndices.map((offsetIdx) => {
            const offset = PROP_OFFSETS[offsetIdx];
            const blockLine = propBlockLine(prop.line, offset, step);
            const isHovered = hoveredBoxIdx === offsetIdx;
            const overLeg = getActiveLeg("OVER", blockLine);
            const underLeg = getActiveLeg("UNDER", blockLine);
            const hasSelection = !!(overLeg || underLeg);

            const overOdds = propBlockOdds(prop.odds ?? -110, prop.line, blockLine, prop.statType, "OVER");
            const underOdds = propBlockOdds(prop.odds ?? -110, prop.line, blockLine, prop.statType, "UNDER");
            const baseOdds = hasSelection ? (overLeg ? overOdds : underOdds) : (prop.odds ?? -110);
            const topLabel = hasSelection ? (overLeg ? "O" : "U") + " " + blockLine : String(blockLine);

            const overBlocked = isDirBlocked("OVER");
            const underBlocked = isDirBlocked("UNDER");
            const fullyBlocked = overBlocked && underBlocked && !hasSelection;
            const canHover = !weekLocked && !hasSelection && !fullyBlocked;

            return (
              <div key={offsetIdx}
                style={{
                  position: "relative", width: PR_BOX_W, height: PR_BOX_H, borderRadius: 4, overflow: "hidden", flexShrink: 0,
                  cursor: hasSelection ? "pointer" : "default",
                }}
                onMouseEnter={() => { if (canHover) setHoveredBoxIdx(offsetIdx); }}
                onMouseLeave={() => setHoveredBoxIdx(null)}
                onClick={hasSelection ? () => { onBet(prop, overLeg ? "OVER" : "UNDER", blockLine); } : undefined}
              >
                {/* Default layer */}
                <div style={{
                  position: "absolute", inset: 0, boxSizing: "border-box",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  background: hasSelection ? "var(--accent-dim)" : fullyBlocked ? "var(--surface-2)" : "var(--surface-3)",
                  border: hasSelection ? "1.5px solid var(--accent)" : "none",
                  borderRadius: 4,
                  opacity: (canHover && isHovered) ? 0 : 1,
                  transform: (canHover && isHovered) ? "scale(0.88)" : "scale(1)",
                  transition: "opacity 0.16s ease, transform 0.16s ease",
                  pointerEvents: "none",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  <div style={{ fontSize: "0.62rem", fontWeight: 400, color: hasSelection ? "var(--accent)" : fullyBlocked ? "var(--text-4)" : "var(--text-2)", lineHeight: 1 }}>
                    {topLabel}
                  </div>
                  <div style={{ fontSize: "0.7rem", fontWeight: 400, color: hasSelection ? "var(--accent)" : fullyBlocked ? "var(--text-4)" : "var(--accent)", lineHeight: 1 }}>
                    {weekLocked || fullyBlocked ? "—" : fmtOdds(baseOdds)}
                  </div>
                </div>

                {/* Split layer — shown on hover, both directions always visible; blocked side is blurred */}
                {!hasSelection && !fullyBlocked && (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", gap: 1,
                    opacity: isHovered ? 1 : 0,
                    transition: "opacity 0.16s ease",
                    pointerEvents: isHovered ? "auto" : "none",
                  }}>
                    {(["UNDER", "OVER"] as const).map((direction, i) => {
                      const blocked = direction === "UNDER" ? underBlocked : overBlocked;
                      const blockOdds = direction === "UNDER" ? underOdds : overOdds;
                      return (
                        <div key={direction} style={{
                          flex: 1, position: "relative", overflow: "hidden",
                          transform: isHovered ? "translateX(0)" : `translateX(${i === 0 ? "-" : ""}12px)`,
                          transition: "transform 0.18s ease",
                        }}>
                          <button type="button"
                            disabled={blocked}
                            onClick={() => { if (!blocked) onBet(prop, direction, blockLine); }}
                            style={{
                              width: "100%", height: "100%", border: "none",
                              cursor: blocked ? "default" : "pointer", padding: 0, outline: "none",
                              background: "var(--surface-2)",
                              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                            }}
                          >
                            <div style={{ fontSize: "0.62rem", fontWeight: 400, color: "var(--text-2)", lineHeight: 1 }}>
                              {direction === "UNDER" ? "U" : "O"}
                            </div>
                            <div style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--accent)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                              {fmtOdds(blockOdds)}
                            </div>
                          </button>
                          {blocked && (
                            <div style={{
                              position: "absolute", inset: 0, pointerEvents: "none",
                              background: "repeating-linear-gradient(45deg, rgba(0,0,0,0.045) 0px, rgba(0,0,0,0.045) 1.5px, transparent 1.5px, transparent 7px)",
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button type="button"
          onClick={() => { setScrollIdx(s => Math.min(2, s + 1)); setHoveredBoxIdx(null); }}
          style={{ width: 16, height: PR_BOX_H, background: "none", border: "none", padding: 0, cursor: scrollIdx < 2 ? "pointer" : "default", color: scrollIdx < 2 ? "var(--text-2)" : "transparent", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}
        >›</button>
      </div>
    </div>
  );
}

export default function BetPage({ params }: PageProps<"/leagues/[leagueId]/bet">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [leagueId, setLeagueId] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [weekLocked, setWeekLocked] = useState(false);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [leagueWeekLabel, setLeagueWeekLabel] = useState<string | null>(null);
  const [leagueWeekNum, setLeagueWeekNum] = useState<number | null>(null);
  const [leagueWeekTotal, setLeagueWeekTotal] = useState<number | null>(null);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [betSection, setBetSection] = useState<string>("lines");
  const [submittedPropIds, setSubmittedPropIds] = useState<Set<string>>(new Set()); // propIds with any pick (for ✓ indicator)
  const [submittedPickCount, setSubmittedPickCount] = useState(0); // total prop picks for nav count
  const [submittedLineCount, setSubmittedLineCount] = useState(0); // total game picks for nav count
  const [pendingPropDirs, setPendingPropDirs] = useState<Map<string, string>>(new Map()); // propId → direction of PENDING pick
  const [pendingLineIds, setPendingLineIds] = useState<Set<string>>(new Set()); // gameLineIds with PENDING picks
  const [slipIds, setSlipIds] = useState<Set<string>>(new Set());
  const [slipLegs, setSlipLegs] = useState<any[]>([]);
  const [isCreator, setIsCreator] = useState(false);
  const [altSpreadIdx, setAltSpreadIdx] = useState(0);
  const [altTotalIdx, setAltTotalIdx] = useState(0);
  const altSpreadScrollRef = useRef<HTMLDivElement | null>(null);
  const altTotalScrollRef = useRef<HTMLDivElement | null>(null);

  async function loadSubmitted(lid: string, weekGames: any[]) {
    try {
      const [existingPicks, existingGamePicks] = await Promise.all([
        api(`/picks?leagueId=${lid}`),
        api(`/gamepicks?leagueId=${lid}`),
      ]);
      const allPropIds = new Set(weekGames.flatMap((g: any) => (g.props ?? []).map((p: any) => p.id)));
      const allLineIds = new Set(weekGames.flatMap((g: any) => (g.gameLines ?? []).map((l: any) => l.id)));

      const weekPicks = existingPicks.filter((p: any) => allPropIds.has(p.propId));
      const weekGamePicks = existingGamePicks.filter((p: any) => allLineIds.has(p.gameLineId));

      // ✓ indicator: which props have any pick
      setSubmittedPropIds(new Set(weekPicks.map((p: any) => p.propId)));
      setSubmittedPickCount(weekPicks.length);
      setSubmittedLineCount(weekGamePicks.length);

      // Rule 2: block opposite direction if a pending pick exists on same prop
      const pendingMap = new Map<string, string>();
      for (const p of weekPicks) {
        if (p.outcome === "PENDING") pendingMap.set(p.propId, p.direction);
      }
      setPendingPropDirs(pendingMap);

      // Rule 2: track pending game picks to block their opposites
      setPendingLineIds(new Set(weekGamePicks.filter((p: any) => p.outcome === "PENDING").map((p: any) => p.gameLineId)));
    } catch {}
  }

  async function loadBalance(lid: string) {
    try {
      const memberships = await api("/memberships");
      const m = memberships.find((m: any) => m.leagueId === lid);
      if (m) setBalance(m.balance);
    } catch {}
  }

  useEffect(() => {
    let weekGamesRef: any[] = [];
    let lidRef = "";

    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId } = await params;
      setLeagueId(leagueId);
      lidRef = leagueId;
      try {
        const [weeks, memberships, leagueData] = await Promise.all([
          api(`/weeks?current=true&leagueId=${leagueId}`),
          api("/memberships"),
          api(`/leagues/${leagueId}`),
        ]);
        const m = memberships.find((m: any) => m.leagueId === leagueId);
        if (m) setBalance(m.balance);
        const uid = localStorage.getItem("userId") ?? "";
        setIsCreator(leagueData?.creatorId === uid);
        if (weeks?.length) {
          const week = weeks[0];
          setWeekLocked(week.locked || week.resolved);
          setWeekNumber(week.number);
          const sw = leagueData?.startWeek ?? 1;
          const rsw = leagueData?.regularSeasonWeeks ?? 13;
          const isPlayoff = week.number >= sw + rsw;
          const lwn = isPlayoff ? week.number - (sw + rsw) + 1 : week.number - sw + 1;
          setLeagueWeekNum(lwn);
          setLeagueWeekTotal(rsw);
          setLeagueWeekLabel(isPlayoff ? `Playoff Week ${lwn}` : `League Week ${lwn} of ${rsw}`);
          const weekGames = week.games ?? [];
          weekGamesRef = weekGames;
          setGames(weekGames);
          await loadSubmitted(leagueId, weekGames);

          const gid = searchParams.get("gameId");
          if (gid) {
            const target = weekGames.find((g: any) => g.id === gid);
            if (target) setSelectedGame(target);
          }
        }
      } catch {}

      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
      setSlipLegs(slip);
    }
    load();

    const onSlipUpdate = () => {
      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
      setSlipLegs(slip);
    };
    const onBetPlaced = () => {
      loadBalance(lidRef);
      loadSubmitted(lidRef, weekGamesRef);
    };
    window.addEventListener("betslip-update", onSlipUpdate);
    window.addEventListener("bet-placed", onBetPlaced);
    return () => {
      window.removeEventListener("betslip-update", onSlipUpdate);
      window.removeEventListener("bet-placed", onBetPlaced);
    };
  }, []);

  useEffect(() => { setAltSpreadIdx(0); setAltTotalIdx(0); }, [selectedGame?.id]);

  const OPPOSITE_MARKET: Record<string, string> = {
    MONEYLINE_HOME: "MONEYLINE_AWAY", MONEYLINE_AWAY: "MONEYLINE_HOME",
    SPREAD_HOME: "SPREAD_AWAY", SPREAD_AWAY: "SPREAD_HOME",
    TOTAL_OVER: "TOTAL_UNDER", TOTAL_UNDER: "TOTAL_OVER",
  };

  const CONFLICT_MARKETS: Record<string, string[]> = {
    MONEYLINE_HOME: ["MONEYLINE_AWAY", "SPREAD_AWAY"],
    MONEYLINE_AWAY: ["MONEYLINE_HOME", "SPREAD_HOME"],
    SPREAD_HOME:    ["SPREAD_AWAY", "MONEYLINE_AWAY"],
    SPREAD_AWAY:    ["SPREAD_HOME", "MONEYLINE_HOME"],
    TOTAL_OVER:     ["TOTAL_UNDER"],
    TOTAL_UNDER:    ["TOTAL_OVER"],
  };

  function toggleLineinSlip(line: any) {
    const inSlip = slipIds.has(`${line.id}:`);
    if (inSlip) { removeFromSlip(line.id, undefined); return; }
    const gameForLine = games.find((g: any) => (g.gameLines ?? []).some((l: any) => l.id === line.id));
    const conflicts = CONFLICT_MARKETS[line.market] ?? [];
    for (const conflictMarket of conflicts) {
      const conflictLine = (gameForLine?.gameLines ?? []).find((l: any) => l.market === conflictMarket);
      if (conflictLine && slipIds.has(`${conflictLine.id}:`)) removeFromSlip(conflictLine.id, undefined);
    }
    addToSlip({
      type: "gameline", id: line.id, label: line.label, odds: line.odds,
      market: line.market, line: line.line ?? undefined,
      gameId: gameForLine?.id,
    });
  }

  function toggleBlockInSlip(prop: any, direction: "OVER" | "UNDER", blockLine: number) {
    // Always read fresh from localStorage — React state may lag behind
    const currentSlip = getBetSlip();
    const existingLeg = currentSlip.find((l: any) => l.id === prop.id && l.direction === direction);
    const existingBlockLine = existingLeg?.altLine ?? existingLeg?.line ?? null;
    if (existingLeg && Math.abs((existingBlockLine ?? 0) - blockLine) < 0.001) {
      removeFromSlip(prop.id, direction, existingLeg.altLine); return;
    }
    if (existingLeg) removeFromSlip(prop.id, direction, existingLeg.altLine);
    // Remove opposite direction — can't have OVER and UNDER on the same prop
    const opposite = direction === "OVER" ? "UNDER" : "OVER";
    const oppositeLeg = currentSlip.find((l: any) => l.id === prop.id && l.direction === opposite);
    if (oppositeLeg) removeFromSlip(prop.id, opposite, oppositeLeg.altLine);
    const isDefault = Math.abs(blockLine - prop.line) < 0.001;
    addToSlip({
      type: "prop", id: prop.id, direction,
      label: `${prop.player?.name} ${direction} ${blockLine} ${(prop.statType as string).split("_").join(" ")}`,
      odds: prop.odds ?? -110,
      line: prop.line, statType: prop.statType,
      altLine: isDefault ? undefined : blockLine,
    });
  }

  function renderMarketCard(statType: string, props: any[]) {
    return (
      <div key={statType} className="card" style={{ marginBottom: 8, border: "none", padding: 0 }}>
        <div style={{ padding: "10px 12px 8px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>
            {fmtStatType(statType)} O/U
          </div>
        </div>
        {weekLocked
          ? <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.82rem", padding: "10px 12px" }}>Betting locked</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: PR_BOX_GAP, paddingBottom: 8 }}>
              {props.map((prop) => (
                <PropPlayerRow
                  key={prop.id}
                  prop={prop}
                  slipLegs={slipLegs}
                  submittedPropIds={submittedPropIds}
                  pendingPropDirs={pendingPropDirs}
                  weekLocked={weekLocked}
                  onBet={toggleBlockInSlip}
                />
              ))}
            </div>
        }
      </div>
    );
  }

  const lockedBanner = weekLocked && (
    <div style={{
      background: "var(--loss-bg)", border: "1px solid var(--loss-border)",
      borderRadius: 8, padding: "10px 14px", marginBottom: 10,
    }}>
      <div style={{ color: "var(--loss)", fontWeight: 700, fontSize: "0.82rem" }}>
        🔒 Betting is locked for this week
      </div>
    </div>
  );

  function fmtStatType(s: string): string {
    return (s as string).split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
  }

  function renderPropSection(props: any[]) {
    const groups: Record<string, any[]> = {};
    for (const p of props) {
      if (!groups[p.statType]) groups[p.statType] = [];
      groups[p.statType].push(p);
    }
    return Object.entries(groups).map(([statType, groupProps]) =>
      renderMarketCard(statType, groupProps)
    );
  }

  // ── Selected game view ──────────────────────────────────────────────
  if (selectedGame) {
    const gameProps = selectedGame.props ?? [];
    const gameLinesList = selectedGame.gameLines ?? [];

    const slMlAway   = gameLinesList.find((l: any) => l.market === "MONEYLINE_AWAY");
    const slMlHome   = gameLinesList.find((l: any) => l.market === "MONEYLINE_HOME");
    const slSpAway   = gameLinesList.find((l: any) => l.market === "SPREAD_AWAY");
    const slSpHome   = gameLinesList.find((l: any) => l.market === "SPREAD_HOME");
    const slTotOver  = gameLinesList.find((l: any) => l.market === "TOTAL_OVER");
    const slTotUnder = gameLinesList.find((l: any) => l.market === "TOTAL_UNDER");

    const SL_BOX_W = 110;
    const SL_BOX_H = 42;
    const SL_BOX_GAP = 2;

    function renderLineBox(line: any, topLabel?: string) {
      if (!line) return <div style={{ width: SL_BOX_W, height: SL_BOX_H, flexShrink: 0 }} />;
      const inSlip = slipIds.has(`${line.id}:`);
      const oppMarket = OPPOSITE_MARKET[line.market];
      const oppLine = oppMarket ? gameLinesList.find((l: any) => l.market === oppMarket) : null;
      const conflicted = !!oppLine && pendingLineIds.has(oppLine.id);
      const isDisabled = weekLocked || conflicted;
      return (
        <div style={{ position: "relative", width: SL_BOX_W, height: SL_BOX_H, flexShrink: 0, borderRadius: 4, overflow: "hidden" }}>
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && toggleLineinSlip(line)}
            style={{
              width: "100%", height: "100%", borderRadius: 4, boxSizing: "border-box",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
              cursor: isDisabled ? "default" : "pointer",
              background: inSlip ? "var(--accent-dim)" : "var(--surface-3)",
              border: inSlip ? "1.5px solid var(--accent)" : "none",
              outline: "none", transition: "all 0.1s", padding: 0,
            }}
          >
            {topLabel && (
              <div style={{ fontSize: "0.62rem", fontWeight: 400, color: inSlip ? "var(--accent)" : "var(--text-2)", lineHeight: 1 }}>
                {topLabel}
              </div>
            )}
            <div style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--accent)", lineHeight: 1 }}>
              {fmtOdds(line.odds)}
            </div>
          </button>
          {conflicted && (
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "repeating-linear-gradient(45deg, rgba(0,0,0,0.045) 0px, rgba(0,0,0,0.045) 1.5px, transparent 1.5px, transparent 7px)",
              borderRadius: 4,
            }} />
          )}
        </div>
      );
    }

    const DEFENSE_TYPES = new Set(["SACKS","TACKLES_ASSISTS","DEFENSIVE_INTERCEPTIONS"]);
    const KICKING_TYPES = new Set(["FIELD_GOALS_MADE","FIELD_GOAL_LONGEST","KICKING_POINTS","EXTRA_POINTS_MADE"]);

    const qbProps = gameProps.filter((p: any) => p.player?.position === "QB");
    const rushingProps = gameProps.filter((p: any) =>
      (p.statType as string).includes("RUSHING") && p.player?.position !== "QB"
    );
    const receivingProps = gameProps.filter((p: any) =>
      ((p.statType as string).includes("RECEIVING") || p.statType === "RECEPTIONS" || p.statType === "RECEIVING_TARGETS") &&
      p.player?.position !== "QB"
    );
    const defenseProps = gameProps.filter((p: any) => DEFENSE_TYPES.has(p.statType));
    const kickingProps = gameProps.filter((p: any) => KICKING_TYPES.has(p.statType));

    const tabs = [
      { key: "lines", label: "Game Lines" },
      ...(qbProps.length > 0 ? [{ key: "qb", label: "Passing Props" }] : []),
      ...(rushingProps.length > 0 ? [{ key: "rushing", label: "Rushing Props" }] : []),
      ...(receivingProps.length > 0 ? [{ key: "receiving", label: "Receiving Props" }] : []),
      ...(defenseProps.length > 0 ? [{ key: "defense", label: "Defensive Props" }] : []),
      ...(kickingProps.length > 0 ? [{ key: "kicking", label: "Kicking Props" }] : []),
    ];

    const activeSection = tabs.some((t) => t.key === betSection) ? betSection : "lines";

    return (
      <>
        <nav className="nav">
          <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
          {balance !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "4px 10px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em" }}>Balance</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>${balance.toLocaleString()}</div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "4px 10px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em" }}>Bets</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 900, color: "var(--text)" }}>{submittedPickCount + submittedLineCount}</div>
              </div>
            </div>
          )}
        </nav>

        <div className="page" style={{ paddingBottom: 160 }}>
          <button
            className="ghost"
            style={{ fontSize: "0.78rem", padding: "5px 10px", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setSelectedGame(null)}
          >
            ← All Games
          </button>

          {/* Game matchup header */}
          {(() => {
            const awayColor = getTeamSelectedColor(selectedGame.awayTeam);
            const homeColor = getTeamSelectedColor(selectedGame.homeTeam);
            return (
              <div style={{ marginBottom: 12, borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ position: "relative", background: `linear-gradient(90deg, ${awayColor} 50%, ${homeColor} 50%)` }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 12px" }}>
                      {(() => { const url = getTeamLogoUrl(selectedGame.awayTeam); return url ? <img src={url} alt={selectedGame.awayTeam} width={52} height={52} style={{ objectFit: "contain", background: "rgba(255,255,255,0.18)", borderRadius: 8, padding: 4 }} /> : <span style={{ fontWeight: 800, fontSize: "1.2rem", color: "#fff" }}>{selectedGame.awayTeam}</span>; })()}
                      <div style={{ fontWeight: 700, fontSize: "0.78rem", textAlign: "center", color: "rgba(255,255,255,0.9)", lineHeight: 1.3 }}>{getTeamFullName(selectedGame.awayTeam)}</div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 12px" }}>
                      {(() => { const url = getTeamLogoUrl(selectedGame.homeTeam); return url ? <img src={url} alt={selectedGame.homeTeam} width={52} height={52} style={{ objectFit: "contain", background: "rgba(255,255,255,0.18)", borderRadius: 8, padding: 4 }} /> : <span style={{ fontWeight: 800, fontSize: "1.2rem", color: "#fff" }}>{selectedGame.homeTeam}</span>; })()}
                      <div style={{ fontWeight: 700, fontSize: "0.78rem", textAlign: "center", color: "rgba(255,255,255,0.9)", lineHeight: 1.3 }}>{getTeamFullName(selectedGame.homeTeam)}</div>
                    </div>
                  </div>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" }}>
                    <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 8, padding: "6px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 28, height: 1, background: "linear-gradient(to right, transparent, rgba(0,0,0,0.2))" }} />
                        <div style={{ fontSize: "0.55rem", fontWeight: 800, color: "rgba(0,0,0,0.5)", letterSpacing: "0.14em" }}>AT</div>
                        <div style={{ width: 28, height: 1, background: "linear-gradient(to left, transparent, rgba(0,0,0,0.2))" }} />
                      </div>
                      <div style={{ fontSize: "0.55rem", color: "rgba(0,0,0,0.4)", textAlign: "center", whiteSpace: "nowrap", lineHeight: 1.4 }}>{fmtGameTime(selectedGame.gameDate)}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {lockedBanner}

          {/* Tab bar */}
          {(() => {
            const tabScrollRef = { current: null as HTMLDivElement | null };
            const scroll = (dir: -1 | 1) => tabScrollRef.current?.scrollBy({ left: dir * 120, behavior: "smooth" });
            const activeIdx = tabs.findIndex((t) => t.key === activeSection);
            return (
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 2 }}>
                <button type="button" onClick={() => scroll(-1)}
                  style={{ flexShrink: 0, width: 24, height: 36, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                <div ref={(el) => { tabScrollRef.current = el; }} className="tab-bar" style={{ flex: 1, flexWrap: "nowrap", overflow: "hidden" }}>
                  {tabs.map(({ key, label }) => (
                    <button key={key} type="button"
                      className={`tab-btn${activeSection === key ? " active" : ""}`}
                      onClick={() => setBetSection(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => scroll(1)}
                  style={{ flexShrink: 0, width: 24, height: 36, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
              </div>
            );
          })()}

          {/* Game Lines */}
          {activeSection === "lines" && (() => {
            const altLines = gameLinesList.filter((l: any) => (l.market as string).startsWith("ALT_"));
            const altSpreadHomeLines = altLines
              .filter((l: any) => (l.market as string).startsWith("ALT_SPREAD_HOME_"))
              .sort((a: any, b: any) => a.line - b.line);
            const altTotalOverLines = altLines
              .filter((l: any) => (l.market as string).startsWith("ALT_TOTAL_OVER_"))
              .sort((a: any, b: any) => a.line - b.line);
            const altSpreadRows = altSpreadHomeLines.map((homeL: any) => ({
              homeL,
              awayL: altLines.find((l: any) => (l.market as string).startsWith("ALT_SPREAD_AWAY_") && Math.abs(l.line + homeL.line) < 0.01) ?? null,
            }));
            const altTotalRows = altTotalOverLines.map((overL: any) => ({
              lineVal: overL.line as number,
              overL,
              underL: altLines.find((l: any) => l.market === `ALT_TOTAL_UNDER_${overL.line}`) ?? null,
            }));
            const fmtSpread = (n: number) => n > 0 ? `+${n}` : String(n);
            return (
            <>
              {gameLinesList.length === 0 && (
                <div className="card"><div className="empty"><div className="empty-icon">📊</div><div className="empty-text">No lines for this game</div></div></div>
              )}
              {gameLinesList.length > 0 && (
                <div className="card" style={{ marginBottom: 8, border: "none", padding: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "0px 12px 3px", height: 22 }}>
                    <div style={{ display: "flex", flexDirection: "row", gap: SL_BOX_GAP }}>
                      {(["Spread", "Total", "Moneyline"] as const).map((h) => (
                        <div key={h} style={{ width: SL_BOX_W, textAlign: "center", fontSize: "0.48rem", color: "var(--text-2)", letterSpacing: "0.07em", textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", padding: "0 12px" }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <div style={{ height: SL_BOX_H, display: "flex", alignItems: "center", gap: 8 }}>
                        <TeamLogo team={selectedGame.awayTeam} size={26} />
                        <span style={{ fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getTeamDisplayName(selectedGame.awayTeam)}</span>
                      </div>
                      <div style={{ height: SL_BOX_GAP, display: "flex", alignItems: "center", gap: 5, paddingLeft: 34, overflow: "visible" }}>
                        <span style={{ fontSize: "0.45rem", color: "var(--text-3)", letterSpacing: "0.12em", flexShrink: 0, lineHeight: 1 }}>AT</span>
                        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, var(--border), transparent)" }} />
                      </div>
                      <div style={{ height: SL_BOX_H, display: "flex", alignItems: "center", gap: 8 }}>
                        <TeamLogo team={selectedGame.homeTeam} size={26} />
                        <span style={{ fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getTeamDisplayName(selectedGame.homeTeam)}</span>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: `repeat(3, ${SL_BOX_W}px)`, gridTemplateRows: `${SL_BOX_H}px ${SL_BOX_H}px`, columnGap: SL_BOX_GAP, rowGap: SL_BOX_GAP }}>
                      {renderLineBox(slSpAway, slSpAway?.line != null ? String(slSpAway.line > 0 ? `+${slSpAway.line}` : slSpAway.line) : undefined)}
                      {renderLineBox(slTotOver, slTotOver?.line != null ? `O ${slTotOver.line}` : undefined)}
                      {renderLineBox(slMlAway)}
                      {renderLineBox(slSpHome, slSpHome?.line != null ? String(slSpHome.line > 0 ? `+${slSpHome.line}` : slSpHome.line) : undefined)}
                      {renderLineBox(slTotUnder, slTotUnder?.line != null ? `U ${slTotUnder.line}` : undefined)}
                      {renderLineBox(slMlHome)}
                    </div>
                  </div>
                  <div style={{ height: 12 }} />
                </div>
              )}

              {/* Alt Spreads */}
              {altSpreadRows.length > 0 && (() => {
                const safeIdx = Math.min(altSpreadIdx, altSpreadRows.length - 1);
                const { homeL, awayL } = altSpreadRows[safeIdx];
                function renderAltSpreadBox(line: any, teamLabel: string, pairedLineId?: string) {
                  if (!line) return <div style={{ flex: 1 }} />;
                  const inSlip = slipIds.has(`${line.id}:`);
                  const conflicted = !!pairedLineId && pendingLineIds.has(pairedLineId);
                  const isDisabled = weekLocked || conflicted;
                  return (
                    <div style={{ flex: 1, position: "relative", borderRadius: 4, overflow: "hidden" }}>
                      <button type="button" disabled={isDisabled}
                        onClick={() => !isDisabled && toggleLineinSlip(line)}
                        style={{
                          width: "100%", height: 56, borderRadius: 4, boxSizing: "border-box", textAlign: "left",
                          display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 10px",
                          cursor: isDisabled ? "default" : "pointer",
                          background: inSlip ? "var(--accent-dim)" : "var(--surface-3)",
                          border: inSlip ? "1.5px solid var(--accent)" : "none",
                          outline: "none",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <span style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: inSlip ? "var(--accent)" : "var(--text-2)" }}>{teamLabel}</span>
                          <span style={{ fontSize: "0.7rem", fontVariantNumeric: "tabular-nums", color: "var(--accent)" }}>{fmtOdds(line.odds)}</span>
                        </div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: inSlip ? "var(--accent)" : "var(--text)" }}>
                          {fmtSpread(line.line)}
                        </div>
                      </button>
                      {conflicted && (
                        <div style={{
                          position: "absolute", inset: 0, pointerEvents: "none",
                          background: "repeating-linear-gradient(45deg, rgba(0,0,0,0.045) 0px, rgba(0,0,0,0.045) 1.5px, transparent 1.5px, transparent 7px)",
                          borderRadius: 4,
                        }} />
                      )}
                    </div>
                  );
                }
                return (
                  <div className="card" style={{ marginBottom: 8, border: "none", padding: 0 }}>
                    <div style={{ padding: "10px 12px 8px", fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>Alternate Spread</div>
                    <div style={{ display: "flex", gap: SL_BOX_GAP, padding: "0 12px" }}>
                      {renderAltSpreadBox(awayL, selectedGame.awayTeam, homeL?.id)}
                      {renderAltSpreadBox(homeL, selectedGame.homeTeam, awayL?.id)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", padding: "8px 2px" }}>
                      <button type="button" onClick={() => altSpreadScrollRef.current?.scrollBy({ left: -80, behavior: "smooth" })}
                        style={{ width: 24, flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                      <div ref={altSpreadScrollRef} style={{ flex: 1, overflowX: "auto", scrollbarWidth: "none" }}>
                        <div style={{ display: "flex", gap: 14, padding: "2px 4px" }}>
                          {altSpreadRows.map(({ homeL: hl }: any, i: number) => (
                            <span key={i} onClick={() => setAltSpreadIdx(i)} style={{
                              flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
                              fontSize: i === safeIdx ? "0.85rem" : "0.72rem",
                              fontWeight: i === safeIdx ? 700 : 400,
                              color: i === safeIdx ? "var(--text)" : "var(--text-3)",
                            }}>{fmtSpread(hl.line)}</span>
                          ))}
                        </div>
                      </div>
                      <button type="button" onClick={() => altSpreadScrollRef.current?.scrollBy({ left: 80, behavior: "smooth" })}
                        style={{ width: 24, flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                    </div>
                    <div style={{ height: 6 }} />
                  </div>
                );
              })()}

              {/* Alt Totals */}
              {altTotalRows.length > 0 && (() => {
                const safeIdx = Math.min(altTotalIdx, altTotalRows.length - 1);
                const { lineVal, overL, underL } = altTotalRows[safeIdx];
                function renderAltTotalBox(line: any, dirLabel: string, valLabel: string, pairedLineId?: string) {
                  if (!line) return <div style={{ flex: 1 }} />;
                  const inSlip = slipIds.has(`${line.id}:`);
                  const conflicted = !!pairedLineId && pendingLineIds.has(pairedLineId);
                  const isDisabled = weekLocked || conflicted;
                  return (
                    <div style={{ flex: 1, position: "relative", borderRadius: 4, overflow: "hidden" }}>
                      <button type="button" disabled={isDisabled}
                        onClick={() => !isDisabled && toggleLineinSlip(line)}
                        style={{
                          width: "100%", height: 56, borderRadius: 4, boxSizing: "border-box", textAlign: "left",
                          display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 10px",
                          cursor: isDisabled ? "default" : "pointer",
                          background: inSlip ? "var(--accent-dim)" : "var(--surface-3)",
                          border: inSlip ? "1.5px solid var(--accent)" : "none",
                          outline: "none",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <span style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: inSlip ? "var(--accent)" : "var(--text-2)" }}>{dirLabel}</span>
                          <span style={{ fontSize: "0.7rem", fontVariantNumeric: "tabular-nums", color: "var(--accent)" }}>{fmtOdds(line.odds)}</span>
                        </div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: inSlip ? "var(--accent)" : "var(--text)" }}>
                          {valLabel}
                        </div>
                      </button>
                      {conflicted && (
                        <div style={{
                          position: "absolute", inset: 0, pointerEvents: "none",
                          background: "repeating-linear-gradient(45deg, rgba(0,0,0,0.045) 0px, rgba(0,0,0,0.045) 1.5px, transparent 1.5px, transparent 7px)",
                          borderRadius: 4,
                        }} />
                      )}
                    </div>
                  );
                }
                return (
                  <div className="card" style={{ marginBottom: 8, border: "none", padding: 0 }}>
                    <div style={{ padding: "10px 12px 8px", fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>Alternate Total</div>
                    <div style={{ display: "flex", gap: SL_BOX_GAP, padding: "0 12px" }}>
                      {renderAltTotalBox(overL, "Over", String(lineVal), underL?.id)}
                      {renderAltTotalBox(underL, "Under", String(lineVal), overL?.id)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", padding: "8px 2px" }}>
                      <button type="button" onClick={() => altTotalScrollRef.current?.scrollBy({ left: -80, behavior: "smooth" })}
                        style={{ width: 24, flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                      <div ref={altTotalScrollRef} style={{ flex: 1, overflowX: "auto", scrollbarWidth: "none" }}>
                        <div style={{ display: "flex", gap: 14, padding: "2px 4px" }}>
                          {altTotalRows.map(({ lineVal: lv }: any, i: number) => (
                            <span key={i} onClick={() => setAltTotalIdx(i)} style={{
                              flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
                              fontSize: i === safeIdx ? "0.85rem" : "0.72rem",
                              fontWeight: i === safeIdx ? 700 : 400,
                              color: i === safeIdx ? "var(--text)" : "var(--text-3)",
                            }}>{lv}</span>
                          ))}
                        </div>
                      </div>
                      <button type="button" onClick={() => altTotalScrollRef.current?.scrollBy({ left: 80, behavior: "smooth" })}
                        style={{ width: 24, flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                    </div>
                    <div style={{ height: 6 }} />
                  </div>
                );
              })()}
            </>
            );
          })()}

          {activeSection === "qb" && renderPropSection(qbProps)}
          {activeSection === "rushing" && renderPropSection(rushingProps)}
          {activeSection === "receiving" && renderPropSection(receivingProps)}
          {activeSection === "defense" && renderPropSection(defenseProps)}
          {activeSection === "kicking" && renderPropSection(kickingProps)}

          {gameLinesList.length === 0 && gameProps.length === 0 && (
            <div className="card">
              <div className="empty"><div className="empty-icon">🏈</div><div className="empty-text">No bets available for this game</div></div>
            </div>
          )}
        </div>

        <BetSlip leagueId={leagueId} />
        <BottomNav leagueId={leagueId} isCreator={isCreator} />
      </>
    );
  }

  // ── Games list view ─────────────────────────────────────────────────
  function fmtDateHeader(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
  }

  const gamesByDate: { date: string; games: any[] }[] = [];
  for (const game of games) {
    const dateKey = new Date(game.gameDate).toDateString();
    const group = gamesByDate.find((g) => g.date === dateKey);
    if (group) group.games.push(game);
    else gamesByDate.push({ date: dateKey, games: [game] });
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        {balance !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "4px 10px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em" }}>Balance</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>${balance.toLocaleString()}</div>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "4px 10px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em" }}>Bets</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 900, color: "var(--text)" }}>{submittedPickCount + submittedLineCount}</div>
            </div>
          </div>
        )}
      </nav>

      <div className="page" style={{ paddingBottom: 160 }}>
        {weekNumber && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div className="card" style={{ flex: 1, margin: 0, padding: "8px 12px", textAlign: "center", border: "none" }}>
              <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 2 }}>League Week</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)" }}>{leagueWeekNum} of {leagueWeekTotal ?? 13}</div>
            </div>
            <div className="card" style={{ flex: 1, margin: 0, padding: "8px 12px", textAlign: "center", border: "none" }}>
              <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 2 }}>NFL Week</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)" }}>{weekNumber} of 18</div>
            </div>
          </div>
        )}

        {lockedBanner}

        {games.length === 0 && (
          <div className="card">
            <div className="empty"><div className="empty-icon">🏈</div><div className="empty-text">No games this week</div></div>
          </div>
        )}

        {gamesByDate.map(({ date, games: dayGames }) => (
          <div key={date}>
            {dayGames.map((game: any) => {
              const lines: any[] = game.gameLines ?? [];
              const now = new Date();
              const isLive = game.status === "IN_PROGRESS" ||
                (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);

              const mlAway  = lines.find((l) => l.market === "MONEYLINE_AWAY");
              const mlHome  = lines.find((l) => l.market === "MONEYLINE_HOME");
              const spAway  = lines.find((l) => l.market === "SPREAD_AWAY");
              const spHome  = lines.find((l) => l.market === "SPREAD_HOME");
              const totOver = lines.find((l) => l.market === "TOTAL_OVER");
              const totUnder = lines.find((l) => l.market === "TOTAL_UNDER");

              // market-boxes: nested grid with only fixed-width columns so columnGap is exact
              const BOX_W = 110;
              const BOX_H = 42;
              const BOX_GAP = 2;

              function OddsBlock({ line, topLabel }: { line: any; topLabel?: string }) {
                if (!line) {
                  return <div style={{ width: BOX_W, height: BOX_H, flexShrink: 0 }} />;
                }
                const inSlip = slipIds.has(`${line.id}:`);
                const oppMarket = OPPOSITE_MARKET[line.market];
                const oppLine = oppMarket ? lines.find((l: any) => l.market === oppMarket) : null;
                const conflicted = !!oppLine && pendingLineIds.has(oppLine.id);
                const isDisabled = weekLocked || conflicted;
                return (
                  <div style={{ position: "relative", width: BOX_W, height: BOX_H, flexShrink: 0, borderRadius: 4, overflow: "hidden" }}>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={(e) => { e.stopPropagation(); if (!isDisabled) toggleLineinSlip(line); }}
                      style={{
                        width: "100%", height: "100%", borderRadius: 4, boxSizing: "border-box",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                        cursor: isDisabled ? "default" : "pointer",
                        background: inSlip ? "var(--accent-dim)" : "var(--surface-3)",
                        border: inSlip ? "1.5px solid var(--accent)" : "none",
                        outline: "none",
                        transition: "all 0.1s",
                        padding: 0,
                      }}
                    >
                      {topLabel && (
                        <div style={{
                          fontSize: "0.62rem", fontWeight: 400,
                          color: inSlip ? "var(--accent)" : "var(--text-2)",
                          fontVariantNumeric: "tabular-nums", lineHeight: 1,
                        }}>
                          {topLabel}
                        </div>
                      )}
                      <div style={{
                        fontSize: "0.7rem", fontWeight: 400,
                        color: "var(--accent)",
                        lineHeight: 1, letterSpacing: "-0.02em",
                      }}>
                        {fmtOdds(line.odds)}
                      </div>
                    </button>
                    {conflicted && (
                      <div style={{
                        position: "absolute", inset: 0, pointerEvents: "none",
                        background: "repeating-linear-gradient(45deg, rgba(0,0,0,0.045) 0px, rgba(0,0,0,0.045) 1.5px, transparent 1.5px, transparent 7px)",
                        borderRadius: 4,
                      }} />
                    )}
                  </div>
                );
              }

              // total width of the 3-column market block
              const MARKETS_W = BOX_W * 3 + BOX_GAP * 2;

              return (
                <div
                  key={game.id}
                  className="card"
                  style={{ marginBottom: 8, border: "none", overflow: "visible", padding: 0 }}
                >
                  {/* Header: column labels only */}
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "0px 12px 3px", height: 22 }}>
                    <div style={{ display: "flex", flexDirection: "row", gap: BOX_GAP, flexShrink: 0 }}>
                      {(["Spread", "Total", "Moneyline"] as const).map((h) => (
                        <div key={h} style={{ width: BOX_W, textAlign: "center", fontSize: "0.48rem", color: "var(--text-2)", letterSpacing: "0.07em", textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>
                  </div>

                  {/* Body: team-info column (flex) + market-box column (nested grid, isolated) */}
                  <div style={{ display: "flex", padding: "0 12px" }}>
                    {/* Left: team info stack */}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <div style={{ height: BOX_H, display: "flex", alignItems: "center", gap: 8 }}>
                        <TeamLogo team={game.awayTeam} size={26} />
                        <span style={{ fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getTeamDisplayName(game.awayTeam)}</span>
                      </div>
                      {/* AT row — same height as BOX_GAP so it visually matches vertical gap */}
                      <div style={{ height: BOX_GAP, display: "flex", alignItems: "center", gap: 5, paddingLeft: 34, overflow: "visible" }}>
                        <span style={{ fontSize: "0.45rem", color: "var(--text-3)", letterSpacing: "0.12em", flexShrink: 0, lineHeight: 1 }}>AT</span>
                        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, var(--border), transparent)" }} />
                      </div>
                      <div style={{ height: BOX_H, display: "flex", alignItems: "center", gap: 8 }}>
                        <TeamLogo team={game.homeTeam} size={26} />
                        <span style={{ fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getTeamDisplayName(game.homeTeam)}</span>
                      </div>
                    </div>

                    {/* Right: market boxes — 2-row grid, both gaps from same property so they're identical */}
                    <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: `repeat(3, ${BOX_W}px)`, gridTemplateRows: `${BOX_H}px ${BOX_H}px`, columnGap: BOX_GAP, rowGap: BOX_GAP }}>
                      <OddsBlock line={spAway} topLabel={spAway?.line != null ? String(spAway.line > 0 ? `+${spAway.line}` : spAway.line) : undefined} />
                      <OddsBlock line={totOver} topLabel={totOver?.line != null ? `O ${totOver.line}` : undefined} />
                      <OddsBlock line={mlAway} />
                      <OddsBlock line={spHome} topLabel={spHome?.line != null ? String(spHome.line > 0 ? `+${spHome.line}` : spHome.line) : undefined} />
                      <OddsBlock line={totUnder} topLabel={totUnder?.line != null ? `U ${totUnder.line}` : undefined} />
                      <OddsBlock line={mlHome} />
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-2)" }}>
                      {fmtGameTime(game.gameDate)}
                      {game.status === "FINAL" && <span style={{ marginLeft: 6, color: "var(--text-3)", fontWeight: 700 }}>· FINAL</span>}
                      {game.status === "CANCELLED" && <span style={{ marginLeft: 6, color: "var(--loss)", fontWeight: 700 }}>· CANCELLED</span>}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text)", cursor: "pointer", fontWeight: 600 }} onClick={() => setSelectedGame(game)}>More Bets &nbsp;›</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <BetSlip leagueId={leagueId} />
      <BottomNav leagueId={leagueId} isCreator={isCreator} />
    </>
  );
}
