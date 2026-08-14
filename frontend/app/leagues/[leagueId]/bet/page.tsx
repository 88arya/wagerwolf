"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import BetSlip, { addToSlip, removeFromSlip, getBetSlip } from "@/components/BetSlip";
import TeamLogo from "@/components/TeamLogo";
import { getTeamBannerColor, getTeamDisplayName, getTeamFullName, getTeamLogoUrl } from "@/lib/teamLogos";
import PlayerAvatar from "@/components/PlayerAvatar";

function fmtCountdown(dateStr: string): string {
  if (!dateStr) return "";
  const diffMs = new Date(dateStr).getTime() - Date.now();
  if (diffMs <= 0) return "Live";
  const totalHrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(totalHrs / 24);
  const hrs = totalHrs % 24;
  // Bare duration — the "Starts in:" prefix is now a timer icon at the render site.
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h`;
  return "Soon";
}

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

function fmtGameTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  // No timeZone option, so the browser formats in the viewer's own zone.
  // "shortGeneric" yields ET/PT rather than EDT/PDT, so the label doesn't flip
  // with daylight saving mid-season.
  let time: string;
  try {
    time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "shortGeneric" });
  } catch {
    time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }
  return `${weekday} ${time}`;
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

// Index into PROP_OFFSETS whose Over odds land closest to even money (+100)
function closestToEvenOffsetIdx(prop: any): number {
  const step = propStep(prop.statType);
  let bestIdx = 0;
  let bestDist = Infinity;
  PROP_OFFSETS.forEach((offset, idx) => {
    const blockLine = propBlockLine(prop.line, offset, step);
    const odds = propBlockOdds(prop.odds ?? -110, prop.line, blockLine, prop.statType, "OVER");
    const dist = Math.abs(odds - 100);
    if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
  });
  return bestIdx;
}

function closestToEvenLine(prop: any): number {
  const step = propStep(prop.statType);
  const idx = closestToEvenOffsetIdx(prop);
  return propBlockLine(prop.line, PROP_OFFSETS[idx], step);
}

const PR_BOX_W = 110;
const PR_BOX_H = 42;

// The one gutter used by every odds-box grid on this page: the game cards on
// the list view, the game-lines card inside a game, and the prop rows.
//
// Expressed in *device* pixels, not CSS pixels. A fractional device width
// rounds down at one column boundary and up at the next, which reads as
// uneven gutters; an integer device width renders identically wherever the
// grid's origin falls. The CSS px value therefore depends on devicePixelRatio,
// which is only known on the client — so the page component resolves it once
// into the --box-gap custom property (see boxGapStyle) and everything below
// reads that variable. This keeps the arithmetic in one place and lets
// module-scope components like PropPlayerRow, which can't see the page's dpr
// state, use the same value without prop drilling.
const GAP_DEVICE_PX = 3;
const BOX_GAP = "var(--box-gap)";

// Applied to each render branch's root so --box-gap is in scope for the whole
// subtree. Starts at dpr 1 on the server and corrects on mount.
function boxGapStyle(dpr: number): CSSProperties {
  return { ["--box-gap"]: `${GAP_DEVICE_PX / dpr}px` } as CSSProperties;
}

// Background for the matchup header card alone — the teams-and-meta block at
// the top of the selected-game view. Kept as a named constant because this is
// the surface most likely to be retried: var(--bg) makes the card blend flush
// into the page, var(--surface-2) gives a grey card that still holds an edge.
const GAME_CARD_BG = "var(--surface)";

// Side of the square team tiles in the matchup header. Chosen to clear the
// tallest content the tile holds — 38px logo, a team name wrapping to two lines
// and the Away/Home label — so no name overflows its square.
const TEAM_TILE = 124;

function PropPlayerRow({ prop, slipLegs, submittedPropIds, pendingPropDirs, weekLocked, onBet, hitRate }: {
  prop: any;
  slipLegs: any[];
  submittedPropIds: Set<string>;
  pendingPropDirs: Map<string, string>;
  weekLocked: boolean;
  onBet: (prop: any, direction: "OVER" | "UNDER", blockLine: number) => void;
  hitRate?: { overPct: number; sampleSize: number };
}) {
  const step = propStep(prop.statType);
  const placed = submittedPropIds.has(prop.id);
  const pendingDir = pendingPropDirs.get(prop.id);
  const [scrollIdx, setScrollIdx] = useState(() => {
    const bestIdx = closestToEvenOffsetIdx(prop);
    return Math.min(2, Math.max(0, bestIdx - 1));
  });
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
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ fontWeight: 400, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.25 }}>
            {prop.player?.name}
            {placed && <span style={{ marginLeft: 5, fontSize: "0.6rem", color: "var(--win)", fontWeight: 700 }}>✓</span>}
            {hitRate && hitRate.sampleSize >= 3 && (
              <span style={{
                marginLeft: 6, fontSize: "0.58rem", fontWeight: 700,
                color: hitRate.overPct >= 55 ? "var(--win)" : hitRate.overPct <= 45 ? "var(--loss)" : "var(--text-3)",
              }}>
                O {hitRate.overPct}%
              </span>
            )}
          </div>
          {prop.player?.position && (
            <div style={{ fontSize: "0.68rem", color: "var(--text-3)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {prop.player.position}{prop.player?.jersey && ` #${prop.player.jersey}`}
            </div>
          )}
        </div>
      </div>

      {/* Arrow + 3 boxes + Arrow */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
        <button type="button"
          onClick={() => setScrollIdx(s => Math.max(0, s - 1))}
          style={{ width: 16, height: PR_BOX_H, background: "none", border: "none", padding: 0, cursor: scrollIdx > 0 ? "pointer" : "default", color: scrollIdx > 0 ? "var(--text-2)" : "transparent", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}
        >‹</button>

        <div style={{ display: "flex", gap: BOX_GAP }}>
          {visibleIndices.map((offsetIdx) => {
            const offset = PROP_OFFSETS[offsetIdx];
            const blockLine = propBlockLine(prop.line, offset, step);
            const plusLine = Math.round((blockLine + 0.5) * 100) / 100;
            const overLeg = getActiveLeg("OVER", blockLine);
            const isSelected = !!overLeg;
            const overOdds = propBlockOdds(prop.odds ?? -110, prop.line, blockLine, prop.statType, "OVER");
            const blocked = isDirBlocked("OVER") && !isSelected;
            const clickable = !weekLocked && !blocked;

            return (
              <button key={offsetIdx} type="button"
                disabled={!clickable}
                onClick={() => { if (clickable) onBet(prop, "OVER", blockLine); }}
                style={{
                  position: "relative", width: PR_BOX_W, height: PR_BOX_H, borderRadius: 4, overflow: "hidden", flexShrink: 0,
                  border: "none", padding: 0, outline: "none",
                  cursor: clickable ? "pointer" : "default",
                  background: isSelected ? "var(--accent-dim)" : "var(--surface-3)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <div style={{ fontSize: "0.62rem", fontWeight: 400, color: isSelected ? "var(--accent)" : blocked ? "var(--text-4)" : "var(--text-2)", lineHeight: 1 }}>
                  {plusLine}+
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 400, color: isSelected ? "var(--accent)" : blocked ? "var(--text-4)" : "var(--accent)", lineHeight: 1 }}>
                  {weekLocked || blocked ? "—" : fmtOdds(overOdds)}
                </div>
                {blocked && (
                  <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    background: "repeating-linear-gradient(45deg, var(--stripe) 0px, var(--stripe) 1.5px, transparent 1.5px, transparent 7px)",
                  }} />
                )}
              </button>
            );
          })}
        </div>

        <button type="button"
          onClick={() => setScrollIdx(s => Math.min(2, s + 1))}
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
  const [hitRates, setHitRates] = useState<Record<string, { overPct: number; sampleSize: number }>>({});
  const [collapsedMarkets, setCollapsedMarkets] = useState<Set<string>>(new Set());

  // Track devicePixelRatio so the game-card box gap can be snapped to a whole
  // number of device pixels — a fractional device gap rounds to floor() at one
  // column boundary and ceil() at the next, which reads as uneven gutters.
  // Starts at 1 so server and first client render agree, then corrects on mount.
  const [dpr, setDpr] = useState(1);
  useEffect(() => {
    const update = () => setDpr(window.devicePixelRatio || 1);
    update();
    // devicePixelRatio changes on zoom and on moving between monitors; the
    // resolution media query fires for both, but must be re-armed each time
    // because it is pinned to the current ratio.
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [dpr]);

  function toggleMarketCollapsed(statType: string) {
    setCollapsedMarkets(prev => {
      const next = new Set(prev);
      if (next.has(statType)) next.delete(statType); else next.add(statType);
      return next;
    });
  }
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
          const weekGames = week.games ?? [];
          weekGamesRef = weekGames;
          setGames(weekGames);
          await loadSubmitted(leagueId, weekGames);

          try {
            const hr = await api("/props/hit-rates");
            setHitRates(hr ?? {});
          } catch {}

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

  // React to gameId changing in the URL after initial mount (e.g. clicking a different
  // game in the persistent top GamesStrip while already on this page) — the load effect
  // above only runs once, so it can't pick up a later query-param change on its own.
  useEffect(() => {
    const gid = searchParams.get("gameId");
    if (!gid || !games.length) return;
    if (selectedGame?.id === gid) return;
    const target = games.find((g: any) => g.id === gid);
    if (target) setSelectedGame(target);
  }, [searchParams, games]);

  const OPPOSITE_MARKET: Record<string, string> = {
    MONEYLINE_HOME: "MONEYLINE_AWAY", MONEYLINE_AWAY: "MONEYLINE_HOME",
    SPREAD_HOME: "SPREAD_AWAY", SPREAD_AWAY: "SPREAD_HOME",
    TOTAL_OVER: "TOTAL_UNDER", TOTAL_UNDER: "TOTAL_OVER",
  };

  function toggleLineinSlip(line: any) {
    const inSlip = slipIds.has(`${line.id}:`);
    if (inSlip) { removeFromSlip(line.id, undefined); return; }
    const gameForLine = games.find((g: any) => (g.gameLines ?? []).some((l: any) => l.id === line.id));
    // Conflicting lines are no longer swapped out — they go into the slip and
    // the slip flags them in amber (see lib/conflicts.ts).
    addToSlip({
      type: "gameline", id: line.id, label: line.label, odds: line.odds,
      market: line.market, line: line.line ?? undefined,
      gameId: gameForLine?.id,
      gameDate: gameForLine?.gameDate,
      team: line.market.includes("HOME") ? gameForLine?.homeTeam : line.market.includes("AWAY") ? gameForLine?.awayTeam : undefined,
      homeTeam: gameForLine?.homeTeam,
      awayTeam: gameForLine?.awayTeam,
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
    // Selecting a different line for the same direction replaces it — that's
    // the alt-line scroller's contract. The opposite direction is left alone:
    // OVER + UNDER may coexist and the slip flags them (see lib/conflicts.ts).
    if (existingLeg) removeFromSlip(prop.id, direction, existingLeg.altLine);
    const isDefault = Math.abs(blockLine - prop.line) < 0.001;
    const propGame = games.find((g: any) => g.id === prop.gameId);
    addToSlip({
      type: "prop", id: prop.id, direction,
      label: `${prop.player?.name} ${direction} ${blockLine} ${(prop.statType as string).split("_").join(" ")}`,
      odds: prop.odds ?? -110,
      line: prop.line, statType: prop.statType,
      altLine: isDefault ? undefined : blockLine,
      gameId: prop.gameId,
      gameDate: propGame?.gameDate,
      playerId: prop.player?.id,
      espnId: prop.player?.espnId ?? undefined,
      imageUrl: prop.player?.imageUrl ?? undefined,
      playerName: prop.player?.name,
      team: prop.player?.team,
      homeTeam: propGame?.homeTeam,
      awayTeam: propGame?.awayTeam,
    });
  }

  // One market (stat type) within a section's strip. Not a card of its own —
  // the section wraps every market in a single white strip and these are
  // divided by hairlines, matching the games list on the all-games view.
  function renderMarketCard(statType: string, props: any[], marketIdx: number) {
    const collapsed = collapsedMarkets.has(statType);
    return (
      <Fragment key={statType}>
        {/* Separator between markets — inset 12px to match the header padding,
            and exactly 1 device pixel tall so every rule renders the same
            weight regardless of where it lands. Same rule as the games list. */}
        {marketIdx > 0 && (
          <div style={{ height: 1 / dpr, background: "var(--border)", margin: "0 12px" }} />
        )}
        <div style={{ padding: "10px 12px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>
            {fmtStatType(statType)}
          </div>
          <button type="button"
            onClick={() => toggleMarketCollapsed(statType)}
            aria-label={collapsed ? "Expand" : "Collapse"}
            style={{ background: "none", border: "none", padding: 4, margin: "-4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
              <polyline points="1,3 5,7 9,3" />
            </svg>
          </button>
        </div>
        {!collapsed && (weekLocked
          ? <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.82rem", padding: "10px 12px" }}>Betting locked</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: BOX_GAP, paddingBottom: 8 }}>
              {props.map((prop) => (
                <PropPlayerRow
                  key={prop.id}
                  prop={prop}
                  slipLegs={slipLegs}
                  submittedPropIds={submittedPropIds}
                  pendingPropDirs={pendingPropDirs}
                  weekLocked={weekLocked}
                  onBet={toggleBlockInSlip}
                  hitRate={hitRates[`${prop.player?.id}:${prop.statType}`]}
                />
              ))}
            </div>
        )}
      </Fragment>
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
    const markets = Object.entries(groups);
    // Guard: without this an empty tab would still paint the strip, leaving a
    // stray rounded box where the old per-market cards rendered nothing.
    if (markets.length === 0) return null;
    return (
      // One continuous white strip rather than a card per market, so the
      // separator runs between markets the way it does between games.
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        {markets.map(([statType, groupProps], marketIdx) => {
          // Order players by their line closest to even odds, largest to smallest
          const sorted = [...groupProps].sort((a, b) => closestToEvenLine(b) - closestToEvenLine(a));
          return renderMarketCard(statType, sorted, marketIdx);
        })}
      </div>
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
              background: "repeating-linear-gradient(45deg, var(--stripe) 0px, var(--stripe) 1.5px, transparent 1.5px, transparent 7px)",
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

    // Game reference detail, as data rather than JSX, so the info modal can lay
    // it out as a vertical list. Built conditionally for the same reasons as
    // before: no countdown once a game is past, no stadium type for games
    // seeded outside ESPN, and no weather/temperature for indoor venues or for
    // games still outside ESPN's 10-day forecast window.
    const countdown = fmtCountdown(selectedGame.gameDate);
    const metaItems: Array<{ label: string; value: string; icon: ReactNode }> = [
      {
        label: "Kickoff",
        value: fmtGameTime(selectedGame.gameDate),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M0 0h24v24H0z" fill="none" />
            <path fill="currentColor" d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 16H5V8h14zM7 10h5v5H7z" />
          </svg>
        ),
      },
      ...(countdown ? [{
        label: "Bets lock in",
        value: countdown,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M0 0h24v24H0z" fill="none" />
            <path fill="currentColor" d="M15 1H9v2h6zm-4 13h2V8h-2zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0 0 12 4a9 9 0 0 0-9 9a9 9 0 0 0 9 9a8.994 8.994 0 0 0 7.03-14.61M12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7s7 3.13 7 7s-3.13 7-7 7" />
          </svg>
        ),
      }] : []),
      ...(selectedGame.indoor != null ? [{
        label: "Stadium type",
        value: selectedGame.indoor ? "Indoors" : "Outdoors",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M0 0h24v24H0z" fill="none" />
            <path fill="currentColor" d="M3 7V3l4 2zm15 0V3l4 2zm-7-1V2l4 2zm0 16q-1.9-.05-3.537-.312t-2.85-.663T2.7 20.1T2 19v-9q0-.625.788-1.162t2.137-.95t3.175-.65T12 7t3.9.238t3.175.65t2.138.95T22 10v9q0 .575-.7 1.1t-1.912.925t-2.85.663T13 22v-4h-2zm1-11q2.425 0 4.188-.288T19 10.05q0-.125-1.9-.587T12 9t-5.1.463t-1.9.587q1.05.375 2.812.663T12 11m-3 8.85V16h6v3.85q2-.2 3.275-.587T20 18.575V11.8q-1.375.55-3.45.875T12 13t-4.55-.325T4 11.8v6.775q.45.3 1.725.688T9 19.85m3-4.025" />
          </svg>
        ),
      }] : []),
      ...(selectedGame.indoor === false && selectedGame.weather ? [{
        label: "Weather",
        value: selectedGame.weather as string,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96" />
          </svg>
        ),
      }] : []),
      ...(selectedGame.indoor === false && selectedGame.weatherTemp != null ? [{
        label: "Temperature",
        value: `${selectedGame.weatherTemp}°`,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M0 0h24v24H0z" fill="none" />
            <path fill="currentColor" d="M15 13V5a3 3 0 0 0-6 0v8a5 5 0 1 0 6 0m-3-9a1 1 0 0 1 1 1v3h-2V5a1 1 0 0 1 1-1" />
          </svg>
        ),
      }] : []),
    ];

    return (
      <>
        <div className="page" style={{ paddingBottom: 160, ...boxGapStyle(dpr) }}>
          <button
            className="ghost"
            style={{ fontSize: "0.78rem", padding: "5px 10px", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setSelectedGame(null)}
          >
            ← All Games
          </button>

          {/* Game matchup header — halved team banner over the detail row. */}
          {(() => {
            // Each half carries its team's primary. Three pairs share a primary
            // exactly, so those matchups render as one solid block rather than
            // two visible halves: NE/SEA (#002244), DAL/LAR (#003594) and
            // CIN/DEN (#FB4F14). Deliberate — true primaries were preferred
            // over getTeamSelectedColor's curated substitutions, which exist to
            // break precisely those ties.
            function TeamSide({ team, record }: { team: string; record: string | null | undefined }) {
              const url = getTeamLogoUrl(team);
              const bg = getTeamBannerColor(team);
              // Always white, not luminance-matched. Only the Rams land on a
              // light banner (#FFA300 — their alt, used because their logo is a
              // single navy that would vanish on their primary), and white is
              // wanted there for consistency with the other 31 teams.
              const fg = "#FFFFFF";
              return (
                <div style={{
                  // Halves of one band rather than free-standing tiles: each
                  // takes half the width and the band's fixed height, which is
                  // the old square's size so the card's footprint is unchanged.
                  flex: 1, minWidth: 0, height: TEAM_TILE,
                  background: bg, padding: "10px 14px",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  {url && <img src={url} alt="" width={38} height={38} referrerPolicy="no-referrer" style={{ objectFit: "contain", flexShrink: 0 }} />}
                  <div style={{
                    fontSize: "0.8rem", fontWeight: 700, color: fg, textAlign: "center",
                    lineHeight: 1.25, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {getTeamFullName(team)}
                  </div>
                  {/* Omitted rather than dashed when ESPN has no record yet —
                      the band is a fixed height, so nothing shifts. */}
                  {record && (
                    <div style={{
                      fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.08em",
                      color: fg, opacity: 0.75, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                    }}>
                      {record}
                    </div>
                  )}
                </div>
              );
            }
            return (
              // White card with its own padding — the team blocks are inset
              // tiles now rather than halves bleeding to the card's edges.
              <div style={{ marginBottom: 12, borderRadius: "var(--radius)", background: GAME_CARD_BG, padding: 12 }}>
                {/* One band split down the middle, away on the left — the
                    reading order carries the home/away meaning that the old
                    AWAY/HOME captions spelled out, the same way "MIN @ LAC"
                    does. The "AT" chip sits on the seam. */}
                <div style={{
                  position: "relative", display: "flex",
                  borderRadius: "var(--radius-sm)", overflow: "hidden",
                }}>
                  <TeamSide team={selectedGame.awayTeam} record={selectedGame.awayRecord} />
                  <TeamSide team={selectedGame.homeTeam} record={selectedGame.homeRecord} />
                  {/* Also the only separator when both teams share a primary
                      exactly — NE/SEA (#002244), DAL/LAR (#003594) and
                      CIN/DEN (#FB4F14) — where the band is one solid colour. */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 30, height: 30, borderRadius: "50%",
                    background: GAME_CARD_BG,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.5rem", fontWeight: 500, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: "var(--text-3)",
                  }}>
                    at
                  </div>
                </div>

                {/* Detail — centred with a fixed gap rather than space-between:
                    the row drops from five items to three for indoor games, and
                    spreading those across the full width reads as a layout
                    error rather than a choice. */}
                <div style={{
                  display: "flex", flexDirection: "row", alignItems: "flex-start",
                  justifyContent: "center", gap: 24, flexWrap: "wrap", paddingTop: 14,
                }}>
                  {metaItems.map((item) => (
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
                      style={undefined}
                      onClick={(e) => {
                        setBetSection(key);
                        const btn = e.currentTarget;
                        const container = btn.closest(".tab-bar") as HTMLElement | null;
                        if (container) {
                          const btnRect = btn.getBoundingClientRect();
                          const cRect = container.getBoundingClientRect();
                          if (btnRect.left < cRect.left) container.scrollLeft -= cRect.left - btnRect.left + 8;
                          else if (btnRect.right > cRect.right) container.scrollLeft += btnRect.right - cRect.right + 8;
                        }
                      }}>
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
            // Every section below renders bare inside one continuous white strip,
            // divided by hairlines — the same treatment renderPropSection gives the
            // markets in the prop tabs, rather than a card per section.
            const divider = <div style={{ height: 1 / dpr, background: "var(--border)", margin: "0 12px" }} />;
            return (
            <>
              {gameLinesList.length === 0 && (
                <div className="card"><div className="empty"><div className="empty-icon">📊</div><div className="empty-text">No lines for this game</div></div></div>
              )}
              {gameLinesList.length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "0px 12px 3px", height: 22 }}>
                    <div style={{ display: "flex", flexDirection: "row", gap: BOX_GAP }}>
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
                      <div style={{ height: BOX_GAP, display: "flex", alignItems: "center", gap: 5, paddingLeft: 34, overflow: "visible" }}>
                        <span style={{ fontSize: "0.45rem", color: "var(--text-3)", letterSpacing: "0.12em", flexShrink: 0, lineHeight: 1 }}>VS</span>
                        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, var(--border), transparent)" }} />
                      </div>
                      <div style={{ height: SL_BOX_H, display: "flex", alignItems: "center", gap: 8 }}>
                        <TeamLogo team={selectedGame.homeTeam} size={26} />
                        <span style={{ fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getTeamDisplayName(selectedGame.homeTeam)}</span>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: `repeat(3, ${SL_BOX_W}px)`, gridTemplateRows: `${SL_BOX_H}px ${SL_BOX_H}px`, columnGap: BOX_GAP, rowGap: BOX_GAP }}>
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

              {/* Alt Spreads */}
              {altSpreadRows.length > 0 && divider}
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
                          outline: "none", fontWeight: 400, position: "relative",
                        }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: inSlip ? "var(--accent)" : "var(--text-2)" }}>{teamLabel}</span>
                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.7rem", fontVariantNumeric: "tabular-nums", color: "var(--accent)" }}>{fmtOdds(line.odds)}</span>
                        <div style={{ fontSize: "0.85rem", fontVariantNumeric: "tabular-nums", color: inSlip ? "var(--accent)" : "var(--text)" }}>
                          {fmtSpread(line.line)}
                        </div>
                      </button>
                      {conflicted && (
                        <div style={{
                          position: "absolute", inset: 0, pointerEvents: "none",
                          background: "repeating-linear-gradient(45deg, var(--stripe) 0px, var(--stripe) 1.5px, transparent 1.5px, transparent 7px)",
                          borderRadius: 4,
                        }} />
                      )}
                    </div>
                  );
                }
                return (
                  <div>
                    <div style={{ padding: "10px 12px 8px", fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>Alternate Spread</div>
                    <div style={{ display: "flex", gap: BOX_GAP, padding: "0 12px" }}>
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
                              fontWeight: 400,
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
              {altTotalRows.length > 0 && divider}
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
                          outline: "none", fontWeight: 400, position: "relative",
                        }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: inSlip ? "var(--accent)" : "var(--text-2)" }}>{dirLabel}</span>
                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.7rem", fontVariantNumeric: "tabular-nums", color: "var(--accent)" }}>{fmtOdds(line.odds)}</span>
                        <div style={{ fontSize: "0.85rem", fontVariantNumeric: "tabular-nums", color: inSlip ? "var(--accent)" : "var(--text)" }}>
                          {valLabel}
                        </div>
                      </button>
                      {conflicted && (
                        <div style={{
                          position: "absolute", inset: 0, pointerEvents: "none",
                          background: "repeating-linear-gradient(45deg, var(--stripe) 0px, var(--stripe) 1.5px, transparent 1.5px, transparent 7px)",
                          borderRadius: 4,
                        }} />
                      )}
                    </div>
                  );
                }
                return (
                  <div>
                    <div style={{ padding: "10px 12px 8px", fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>Alternate Total</div>
                    <div style={{ display: "flex", gap: BOX_GAP, padding: "0 12px" }}>
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
                              fontWeight: 400,
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
                </div>
              )}
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
      <div className="page" style={{ paddingBottom: 160, ...boxGapStyle(dpr) }}>
        {lockedBanner}

        {games.length === 0 && (
          <div className="card">
            <div className="empty"><div className="empty-icon">🏈</div><div className="empty-text">No games this week</div></div>
          </div>
        )}

        {/* One continuous white strip rather than a card per game. Groups are
            flattened so the separator runs between games across date boundaries
            too, and so gameIdx is a single running index over the whole list. */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {gamesByDate.flatMap(({ games: dayGames }) => dayGames).map((game: any, gameIdx: number) => {
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

              function OddsBlock({ line, topLabel }: { line: any; topLabel?: string }) {
                if (!line) {
                  return <div style={{ width: BOX_W, height: BOX_H }} />;
                }
                const inSlip = slipIds.has(`${line.id}:`);
                const oppMarket = OPPOSITE_MARKET[line.market];
                const oppLine = oppMarket ? lines.find((l: any) => l.market === oppMarket) : null;
                const conflicted = !!oppLine && pendingLineIds.has(oppLine.id);
                const isDisabled = weekLocked || conflicted;
                return (
                  <div style={{ position: "relative", width: BOX_W, height: BOX_H, borderRadius: 4, overflow: "hidden" }}>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={(e) => { e.stopPropagation(); if (!isDisabled) toggleLineinSlip(line); }}
                      style={{
                        width: "100%", height: "100%", borderRadius: 4, boxSizing: "border-box",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                        cursor: isDisabled ? "default" : "pointer",
                        background: inSlip ? "var(--accent-dim)" : "var(--surface-3)",
                        border: inSlip ? "1.5px solid var(--accent)" : "1.5px solid transparent",
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
                        background: "repeating-linear-gradient(45deg, var(--stripe) 0px, var(--stripe) 1.5px, transparent 1.5px, transparent 7px)",
                        borderRadius: 4,
                      }} />
                    )}
                  </div>
                );
              }

              return (
                <Fragment key={game.id}>
                  {/* Separator between games — inset 12px, the same padding the
                      footer uses, so it spans exactly from the date's left edge
                      to the right edge of "More Bets" above it. Kept a sibling of
                      the row (not a child) so the row's vertical padding doesn't
                      push it inward and unbalance the space either side of it. */}
                  {gameIdx > 0 && (
                    // height is exactly 1 device pixel. A flat `height: 1` is
                    // 1×dpr device px, which rounds to 1 or 2 depending on the
                    // line's y position — every third separator came out double
                    // weight. Snapping to 1/dpr makes them all identical.
                    <div style={{ height: 1 / dpr, background: "var(--border)", margin: "0 12px" }} />
                  )}

                  <div style={{ overflow: "visible", padding: "4px 0" }}>
                    {/* Header: column labels only */}
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "0px 12px 3px", height: 22 }}>
                      <div style={{ display: "flex", flexDirection: "row", gap: BOX_GAP, flexShrink: 0 }}>
                        {(["Spread", "Total", "Moneyline"] as const).map((h) => (
                          <div key={h} style={{ width: BOX_W, textAlign: "center", fontSize: "0.48rem", color: "var(--text-2)", letterSpacing: "0.07em", textTransform: "uppercase" }}>{h}</div>
                        ))}
                      </div>
                    </div>

                    {/* Body: team-info column (flex) + market-box column (nested grid, isolated) */}
                    <div style={{ display: "flex", gap: 12, padding: "0 12px" }}>
                      {/* Left: team info stack */}
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                        <div style={{ height: BOX_H, display: "flex", alignItems: "center", gap: 8 }}>
                          <TeamLogo team={game.awayTeam} size={26} />
                          <span style={{ fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getTeamDisplayName(game.awayTeam)}</span>
                        </div>
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
                      <span style={{ fontSize: "0.72rem", color: "var(--text)", fontWeight: 600 }}>
                        {fmtGameTime(game.gameDate)}
                        {game.status === "FINAL" && <span style={{ marginLeft: 6, color: "var(--text-3)", fontWeight: 700 }}>· FINAL</span>}
                        {game.status === "CANCELLED" && <span style={{ marginLeft: 6, color: "var(--loss)", fontWeight: 700 }}>· CANCELLED</span>}
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text)", cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2 }} onClick={() => setSelectedGame(game)}>
                        More Bets
                        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
                          <path d="M0 0h24v24H0z" fill="none" />
                          {/* stroke on top of the fill thickens the chevron without
                              redrawing it — strokeWidth is the weight knob */}
                          <path fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" d="M11.273 3.687a1 1 0 1 1 1.454-1.374l8.5 9a1 1 0 0 1 0 1.374l-8.5 9.001a1 1 0 1 1-1.454-1.373L19.125 12z" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Fragment>
              );
          })}
        </div>
      </div>

      <BetSlip leagueId={leagueId} />
    </>
  );
}
