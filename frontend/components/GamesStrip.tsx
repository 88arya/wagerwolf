"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import TeamLogo from "@/components/TeamLogo";
import { ACCENT } from "@/lib/constants";
import { useOpticalAlign } from "@/lib/useOpticalAlign";
import { fmtOdds } from "@/lib/odds";
import type { Game, Week } from "@/lib/types";

const CARD_GLASS_BG = "var(--glass-bg)";
const CARD_GLASS_FILTER = "var(--glass-filter)";
const CARD_GLASS_BG_HOVER = "rgba(255, 255, 255, 0.72)";
const STRIP_BG = CARD_GLASS_BG;
const CARD_BG_HOVER = CARD_GLASS_BG_HOVER;
const DATE_STRIP_BG = "var(--surface-3)";
const CARD_BORDER = "1px solid var(--border-2)";

const STRIP_ROW_H = 70;
const CARD_W = 128;
const DRAG_CLICK_SLOP = 4;
const AUTO_SCROLL_PX_PER_SEC = 45;
const SLIDE_EASE = "0.26s cubic-bezier(0.4, 0, 0.2, 1)";

const FADE_W = 44;
const FADE_MASK =
  `linear-gradient(to right, transparent 0, #000 ${FADE_W}px, #000 calc(100% - ${FADE_W}px), transparent 100%)`;

// Two identical halves, each at least as wide as the scroller, so wrapping at
// half the width is seamless.
function buildTape<T>(base: T[], scrollerW: number): T[] {
  if (!base.length) return [];
  const perHalf = Math.max(1, Math.ceil(scrollerW / (base.length * CARD_W)));
  const out: T[] = [];
  for (let i = 0; i < perHalf * 2; i++) out.push(...base);
  return out;
}

// Per-league cache so a remount paints immediately.
const weekCache = new Map<string, Week>();

const COLLAPSED_KEY = "strip_collapsed";
let collapsedPref = false;

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return collapsedPref;
  return localStorage.getItem(COLLAPSED_KEY) === "1";
}

function writeCollapsed(on: boolean) {
  collapsedPref = on;
  try {
    localStorage.setItem(COLLAPSED_KEY, on ? "1" : "0");
  } catch {
  }
}

const AUTO_SCROLL_KEY = "strip_autoscroll";
let autoScrollPref = true;

function readStoredAutoScroll(): boolean {
  if (typeof window === "undefined") return autoScrollPref;
  return localStorage.getItem(AUTO_SCROLL_KEY) !== "0";
}

const ABBR_OPTICAL_SHIFT = "var(--strip-abbr-shift, 0.5663px)";
const ODDS_BASELINE_NUDGE = "var(--strip-odds-shift, 0.6703px)";
const SCORE_BASELINE_NUDGE = "var(--strip-score-shift, -0.0529px)";
const ABBR_SLANT_DEG = 12;

const TEAM_ABBR: CSSProperties = {
  // Fugaz One, loaded in app/layout.tsx as --font-fugaz-one.
  fontFamily: "var(--font-fugaz-one), system-ui, sans-serif",
  fontWeight: 400,
  fontStyle: `oblique ${ABBR_SLANT_DEG}deg`,
  fontSize: "0.75rem",
  letterSpacing: "0.04em",
  color: "var(--text)",
  position: "relative",
  top: ABBR_OPTICAL_SHIFT,
};

const TEAM_META: CSSProperties = {
  fontSize: "0.625rem",
  fontWeight: 500,
  letterSpacing: "0.04em",
  fontVariantNumeric: "tabular-nums",
  color: "var(--text-2)",
  whiteSpace: "nowrap",
};

const TEAM_SCORE: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: "var(--text)",
  position: "relative",
  top: SCORE_BASELINE_NUDGE,
};

const TEAM_ODDS: CSSProperties = {
  ...TEAM_META,
  color: ACCENT,
  fontWeight: 700,
  position: "relative",
  top: ODDS_BASELINE_NUDGE,
};

const TEAM_DATE: CSSProperties = { ...TEAM_META, fontWeight: 700 };
const TEAM_DAY: CSSProperties = { ...TEAM_DATE, textTransform: "uppercase" };

const S = {
  outer: { flexShrink: 0, background: "transparent" },
  placeholder: { flexShrink: 0, background: STRIP_BG },
  glass: { backdropFilter: CARD_GLASS_FILTER, WebkitBackdropFilter: CARD_GLASS_FILTER },
  tape: { display: "flex", overflowX: "auto" },
  card: {
    display: "flex",
    flexDirection: "column",
    padding: 0,
    gap: 0,
    flex: `0 0 ${CARD_W}px`,
    boxSizing: "border-box",
    height: STRIP_ROW_H,
    minHeight: 0,
    background: STRIP_BG,
    borderRight: CARD_BORDER,
    borderBottom: CARD_BORDER,
    transition: "background 0.12s",
  },
  dateBand: {
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    lineHeight: 1, background: DATE_STRIP_BG, padding: "4px 8px",
  },
  dateGroup: { display: "flex", alignItems: "center", gap: 4 },
  betCount: { fontSize: "0.62rem", fontWeight: 700, whiteSpace: "nowrap", cursor: "default", color: "var(--text)" },
  teams: { display: "flex", flexDirection: "column", gap: 0, padding: "0 8px" },
  teamRowTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, padding: "2px 0 0" },
  teamRowBottom: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, padding: "0 0 2px" },
  team: { display: "flex", alignItems: "center", gap: 8 },
  tabRow: { display: "flex", justifyContent: "flex-end", alignItems: "flex-start", height: 0 },
  tooltip: {
    position: "fixed",
    transform: "translateX(-50%)",
    background: "var(--header-bg)",
    border: "none",
    borderRadius: 0,
    boxShadow: "var(--shadow-md)",
    padding: "6px 9px",
    fontSize: "0.68rem",
    color: "#FFFFFF",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 400,
  },
} satisfies Record<string, CSSProperties>;

function fmtBetCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export default function GamesStrip({ leagueId, interactive = true }: { leagueId: string; interactive?: boolean }) {
  const router = useRouter();
  useOpticalAlign();
  const cached = weekCache.get(leagueId || "__public__") ?? null;
  const [week, setWeek] = useState<Week | null>(cached ?? null);
  const [loaded, setLoaded] = useState(!!cached);
  // Kept separate from `week` so polling counts doesn't replace the week and restart the ticker.
  const [betCounts, setBetCounts] = useState<Record<string, number>>({});
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [autoScroll, setAutoScroll] = useState(autoScrollPref);
  const [collapsed, setCollapsed] = useState(collapsedPref);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scrollerW, setScrollerW] = useState(0);
  const gamesScrollRef = useRef<HTMLDivElement>(null);
  // Set by the anchor effect, consumed by the drift loop on its next start.
  const startPosRef = useRef<number | null>(null);
  // Anchor to the first upcoming game once per week, not on every refetch.
  const anchoredKeyRef = useRef<string | null>(null);
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });

  useEffect(() => {
    const stored = readStoredAutoScroll();
    autoScrollPref = stored;
    setAutoScroll(stored);
  }, []);

  useEffect(() => {
    const stored = readStoredCollapsed();
    collapsedPref = stored;
    setCollapsed(stored);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    writeCollapsed(next);
    setCollapsed(next);
  }

  const drifting = autoScroll && !hovering && !collapsed;

  // `week` is replaced on every poll; effects that only care which week it is use this.
  const weekKey = week?.id ?? week?.number ?? null;

  const hasLive = Boolean(week?.games?.some((g) => g.status === "IN_PROGRESS"));

  useEffect(() => {
    const token = typeof window !== "undefined" && localStorage.getItem("token");
    const scoped = Boolean(leagueId && token);
    const key = scoped ? leagueId : "__public__";

    const hit = weekCache.get(key);
    if (hit) { setWeek(hit); setLoaded(true); }

    api(scoped ? `/weeks?current=true&leagueId=${leagueId}` : "/weeks/public/current")
      .then((weeks) => {
        if (weeks?.[0]) { weekCache.set(key, weeks[0]); setWeek(weeks[0]); }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [leagueId]);

  useEffect(() => {
    const el = gamesScrollRef.current;
    if (!el) return;
    setScrollerW(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setScrollerW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [weekKey]);

  useEffect(() => {
    const games = week?.games ?? [];
    if (!games.length) return;
    const el = gamesScrollRef.current;
    if (!el) return;

    const key = String(weekKey ?? "");
    if (anchoredKeyRef.current === key) return;
    anchoredKeyRef.current = key;

    const now = new Date();
    const firstUpcoming = games.findIndex(
      (g) => g.status !== "FINAL" && g.status !== "CANCELLED" && new Date(g.gameDate) > now
    );
    const targetIndex = firstUpcoming === -1 ? 0 : firstUpcoming;

    startPosRef.current = targetIndex * CARD_W;
    el.scrollLeft = startPosRef.current;
  }, [weekKey, week]);

  useEffect(() => {
    if (!drifting) return;
    const el = gamesScrollRef.current;
    if (!el) return;
    let raf = 0;
    let prev = performance.now();
    // Accumulate position here: scrollLeft rounds to device pixels, which would
    // swallow sub-pixel steps.
    let pos = startPosRef.current ?? el.scrollLeft;
    startPosRef.current = null;
    const step = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      // Wrap at one copy's width so the reset lands on an identical card.
      const oneCopy = el.scrollWidth / 2;
      if (oneCopy > 0) {
        pos += AUTO_SCROLL_PX_PER_SEC * dt;
        if (pos >= oneCopy) pos -= oneCopy;
        el.scrollLeft = pos;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [drifting, weekKey]);

  useEffect(() => {
    if (!hasLive || !leagueId) return;
    const interval = setInterval(async () => {
      try {
        const weeks = await api(`/weeks?current=true&leagueId=${leagueId}`);
        if (weeks?.[0]) setWeek(weeks[0]);
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [hasLive, leagueId]);

  useEffect(() => {
    const weekId = week?.id;
    const hasUpcoming = Boolean(
      week?.games?.some(
        (g) =>
          g.status !== "FINAL" &&
          g.status !== "CANCELLED" &&
          g.gameDate &&
          new Date(g.gameDate).getTime() > Date.now()
      )
    );
    if (!weekId || !hasUpcoming) return;
    let alive = true;
    const load = async () => {
      try {
        const counts = await api(`/weeks/${weekId}/bet-counts`);
        if (alive && counts && typeof counts === "object") setBetCounts(counts);
      } catch {}
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [weekKey]);

  if (!week?.games?.length) {
    if (loaded) return null;
    return (
      <div style={S.placeholder}>
        <div style={{ height: STRIP_ROW_H }} />
      </div>
    );
  }

  function beginDrag(e: React.MouseEvent) {
    dragRef.current.moved = 0;
    const el = gamesScrollRef.current;
    if (autoScroll || !el) return;
    dragRef.current.active = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startScroll = el.scrollLeft;
    setDragging(true);
  }

  function onDragMove(e: React.MouseEvent) {
    const d = dragRef.current;
    const el = gamesScrollRef.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.startX;
    d.moved = Math.max(d.moved, Math.abs(dx));

    const oneCopy = el.scrollWidth / 2;
    const next = d.startScroll - dx;
    el.scrollLeft = oneCopy > 0 ? ((next % oneCopy) + oneCopy) % oneCopy : next;

    // Without this the browser starts a text/image selection mid-drag.
    e.preventDefault();
  }

  function endDrag() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
  }

  function showBetTip(e: React.MouseEvent, betCount: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({
      text: betCount === 1
        ? "1 bet has been placed on this game."
        : `${betCount} bets have been placed on this game.`,
      x: r.left + r.width / 2,
      y: r.bottom + 2,
    });
  }

  function renderGame(game: Game, i: number) {
    const now = new Date();
    const isLive = game.status === "IN_PROGRESS" ||
      (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);
    const isScheduled = !isLive && game.status !== "FINAL" && game.status !== "CANCELLED";
    const showScore = isLive || game.status === "FINAL";
    const betCount = betCounts[game.id] ?? game.betCount ?? 0;
    const awayML = isScheduled ? game.gameLines?.find((l) => l.market === "MONEYLINE_AWAY") : null;
    const homeML = isScheduled ? game.gameLines?.find((l) => l.market === "MONEYLINE_HOME") : null;

    return (
      <div key={`${game.id}-${i}`}
        // A drag ends in a click; ignore it past the slop.
        onClick={interactive ? () => {
          if (dragRef.current.moved > DRAG_CLICK_SLOP) return;
          router.push(`/leagues/${leagueId}/bet?gameId=${game.id}`);
        } : undefined}
        onMouseEnter={interactive ? e => (e.currentTarget.style.background = CARD_BG_HOVER) : undefined}
        onMouseLeave={interactive ? e => (e.currentTarget.style.background = STRIP_BG) : undefined}
        style={{ ...S.card, cursor: interactive ? "pointer" : "default" }}>
        <div style={S.dateBand}>
          <div style={S.dateGroup}>
            {game.gameDate && (
              <>
                <span style={TEAM_DAY}>{new Date(game.gameDate).toLocaleDateString("en-US", { weekday: "short" })}</span>
                <span style={TEAM_DATE}>{new Date(game.gameDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
              </>
            )}
          </div>
          {betCount > 0 ? (
            <span
              style={S.betCount}
              onMouseEnter={e => showBetTip(e, betCount)}
              onMouseLeave={() => setTip(null)}
            >
              {fmtBetCount(betCount)}
            </span>
          ) : null}
        </div>
        <div style={S.teams}>
          <div style={S.teamRowTop}>
            <div style={S.team}>
              <TeamLogo team={game.awayTeam} size={24} plain />
              <span style={TEAM_ABBR}>{game.awayTeam}</span>
            </div>
            {showScore ? (
              <span style={TEAM_SCORE}>{game.awayScore}</span>
            ) : awayML ? (
              <span style={TEAM_ODDS}>{fmtOdds(awayML.odds)}</span>
            ) : null}
          </div>
          <div style={S.teamRowBottom}>
            <div style={S.team}>
              <TeamLogo team={game.homeTeam} size={24} plain />
              <span style={TEAM_ABBR}>{game.homeTeam}</span>
            </div>
            {showScore ? (
              <span style={TEAM_SCORE}>{game.homeScore}</span>
            ) : homeML ? (
              <span style={TEAM_ODDS}>{fmtOdds(homeML.odds)}</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.outer}>
      <div style={S.glass}>
        <div style={{ overflow: "hidden", height: collapsed ? 0 : STRIP_ROW_H, transition: `height ${SLIDE_EASE}` }}>
          <div style={{
            display: "flex", alignItems: "stretch", height: STRIP_ROW_H,
            transform: collapsed ? `translateY(-${STRIP_ROW_H}px)` : "none",
            transition: `transform ${SLIDE_EASE}`,
          }}>
            <div
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => { setHovering(false); endDrag(); }}
              onMouseDown={beginDrag}
              onMouseMove={onDragMove}
              onMouseUp={endDrag}
              // Stop native image drag on the logos.
              onDragStart={(e) => e.preventDefault()}
              style={{
                flex: 1, overflow: "hidden", position: "relative",
                maskImage: FADE_MASK,
                WebkitMaskImage: FADE_MASK,
                cursor: autoScroll ? "default" : dragging ? "grabbing" : "grab",
                userSelect: dragging ? "none" : undefined,
              }}>
              <div ref={gamesScrollRef} className="no-scrollbar" style={S.tape}>
                {buildTape(week.games, scrollerW).map(renderGame)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={S.tabRow}>
        <button
          type="button"
          className="tap-target"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show games" : "Hide games"}
          title={collapsed ? "Show games" : "Hide games"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 16,
            padding: 0,
            marginRight: 100,
            background: collapsed ? "var(--header-bg)" : CARD_GLASS_BG,
            backdropFilter: collapsed ? "none" : CARD_GLASS_FILTER,
            WebkitBackdropFilter: collapsed ? "none" : CARD_GLASS_FILTER,
            border: collapsed ? "1px solid var(--header-bg)" : CARD_BORDER,
            borderTop: "none",
            borderRadius: 0,
            boxShadow: "none",
            color: collapsed ? "rgba(255, 255, 255, 0.72)" : "var(--text-2)",
            cursor: "pointer",
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={e => {
            if (!collapsed) e.currentTarget.style.background = CARD_GLASS_BG_HOVER;
            e.currentTarget.style.color = collapsed ? "#FFFFFF" : "var(--text)";
          }}
          onMouseLeave={e => {
            if (!collapsed) e.currentTarget.style.background = CARD_GLASS_BG;
            e.currentTarget.style.color = collapsed ? "rgba(255, 255, 255, 0.72)" : "var(--text-2)";
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.18s ease" }}
          >
            <path d="M6 15 L12 9 L18 15" />
          </svg>
        </button>
      </div>

      {tip ? (
        <div
          role="tooltip"
          style={{
            ...S.tooltip,
            left: Math.min(Math.max(tip.x, 96), (typeof window !== "undefined" ? window.innerWidth : 0) - 96),
            top: tip.y,
          }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
