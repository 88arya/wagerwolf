"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import TeamLogo from "@/components/TeamLogo";
import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import { fmtMoney } from "@/lib/money";

const STRIP_BG = "var(--bg)";

// The date/arrow band across the top of each game card — a step darker than
// the card itself. --surface-3 (#E8ECF0) sits in the same cool-grey ramp as
// --bg (#F5F7FA), so the band shares the card's hue and only drops in value.
const DATE_STRIP_BG = "var(--surface-3)";

// Hovering a game card steps it one rung darker. It cannot lighten toward
// white any more — the strip behind the cards is white, so a white hover would
// erase the card outline instead of highlighting it. --surface-2 stays clear of
// DATE_STRIP_BG below it, so the card's two tones remain distinct while hovered.
// Only the teams area moves; the date band keeps its own background.
const CARD_BG_HOVER = "var(--surface-2)";

// One card's natural height, measured: the date band + two flush 26px team
// rows sitting in 2px of padding top and bottom. The strip reserves this while
// the week is loading so games arriving don't shove the page down. If the
// card's padding or logo size changes, re-measure.
const STRIP_ROW_H = 70;

// Card width, matched to the nfl.com scoreboard cell. Fixed rather than a
// fraction of the track: cards stay this size at any viewport and the number
// visible varies, which is what keeps them from stretching on a wide screen.
const CARD_W = 128;

// The mode selector deliberately outgrows a card in both directions, so it
// reads as the strip's header rather than another cell. Its height sets the
// strip's overall height; the cards are centred against it.
const SELECTOR_W = 168;
const SELECTOR_H = 92;

// Pixels per second the games drift leftward on their own. Slow enough to read
// while it moves.
const AUTO_SCROLL_PX_PER_SEC = 45;

// How far the cards fade out at each end of the scroller, and the mask that
// does it. Opaque through the middle, transparent at both edges, so cards
// dissolve as they enter and leave rather than being clipped mid-glyph.
const FADE_W = 44;
const FADE_MASK =
  `linear-gradient(to right, transparent 0, #000 ${FADE_W}px, #000 calc(100% - ${FADE_W}px), transparent 100%)`;

// Build the looping tape: the list repeated into two identical halves, where
// each half is wide enough to cover the scroller on its own.
//
// The drift wraps at half the track's width, so that half has to be reachable
// by scrolling. If it is narrower than the visible area, scrollLeft maxes out
// before the wrap point and the strip stalls against the end instead of
// looping. Two copies is enough for a full 16-game week at a typical width, but
// not for a short week on a wide monitor — hence the count is derived rather
// than fixed.
function buildTape<T>(base: T[], scrollerW: number): T[] {
  if (!base.length) return [];
  const perHalf = Math.max(1, Math.ceil(scrollerW / (base.length * CARD_W)));
  const out: T[] = [];
  for (let i = 0; i < perHalf * 2; i++) out.push(...base);
  return out;
}

// The strip is mounted by two different layouts — app/(user)/layout.tsx and
// app/leagues/[leagueId]/layout.tsx — so navigating between a league and /home
// crosses a layout boundary and swaps one instance for another. Caching the
// week per league lets the new instance paint from memory instead of flashing
// an empty bar while it refetches.
const weekCache = new Map<string, any>();

// The two things the strip can show. NFL is the default; MATCHUPS reuses the
// exact same card shape with league members in place of teams.
type StripMode = "NFL" | "MATCHUPS";
const MODE_LABEL: Record<StripMode, string> = {
  NFL: "NFL",
  MATCHUPS: "MATCHUPS",
};

// Team abbreviations and the small meta text beside them, both matched to the
// nfl.com scoreboard strip: 12px/700 italic with 0.04em tracking for the
// abbreviation, 10px/500 with the same tracking in grey for everything else.
//
// The abbreviation is the one place in the app that departs from Inter Tight —
// Fugaz One, loaded in app/layout.tsx as --font-fugaz-one. Weight stays at 400
// because that is the only cut the family ships: asking for 700 would make the
// browser fake a bold on top of an already-heavy display face.
// How far the abbreviations lean, in degrees. Fugaz One ships no italic cut,
// so `oblique <angle>` has the browser synthesise the slant at exactly this
// angle rather than leaving it to the default faux-italic. 0 renders upright;
// a drawn italic is typically 8–14deg.
const ABBR_SLANT_DEG = 12;

const TEAM_ABBR = {
  fontFamily: "var(--font-fugaz-one), system-ui, sans-serif",
  fontWeight: 400,
  fontStyle: `oblique ${ABBR_SLANT_DEG}deg`,
  fontSize: "0.75rem",
  letterSpacing: "0.04em",
  color: "var(--text)",
};

// nfl.com sets records in this; we keep odds in that slot and only borrow the
// metrics. --text-2 rather than --text-3 because their #626C80 lands nearer the
// darker of our two greys.
const TEAM_META = {
  fontSize: "0.625rem",
  fontWeight: 500,
  letterSpacing: "0.04em",
  fontVariantNumeric: "tabular-nums" as const,
  color: "var(--text-2)",
  whiteSpace: "nowrap" as const,
};

// Odds keep the nfl.com record metrics but take the accent, matching how odds
// numbers are treated everywhere else in the app, and run bolder than the 500
// a record would use.
const TEAM_ODDS = { ...TEAM_META, color: ACCENT, fontWeight: 600 };

// The date in the top band runs bolder than nfl.com's 500 — it is the card's
// only label up there, so it carries more weight than a stat line would.
const TEAM_DATE = { ...TEAM_META, fontWeight: 700 };

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export default function GamesStrip({ leagueId, interactive = true }: { leagueId: string; interactive?: boolean }) {
  const router = useRouter();
  const cached = leagueId ? weekCache.get(leagueId) : null;
  const [week, setWeek] = useState<any>(cached ?? null);
  // Whether the fetch has settled. Distinguishes "still loading" (reserve the
  // height) from "resolved, nothing to show" (collapse for real).
  const [loaded, setLoaded] = useState(!!cached);
  const [mode, setMode] = useState<StripMode>("NFL");
  const [menuOpen, setMenuOpen] = useState(false);
  const [matchupRows, setMatchupRows] = useState<any[] | null>(null);
  // Hovering anywhere on the strip halts the drift so a card can be read (and
  // clicked) without it sliding out from under the cursor.
  const [drifting, setDrifting] = useState(true);
  // Scroller width, tracked so the tape can be repeated enough times to cover
  // it. Starts at 0, which yields the minimum two copies until measured.
  const [scrollerW, setScrollerW] = useState(0);
  const gamesScrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Set by the anchor effect, consumed by the drift loop on its next start.
  const startPosRef = useRef<number | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Drop cached matchups when the league or week changes. Without this the
  // `if (matchupRows)` guard below would keep showing the previous league's
  // pairings, since that guard blocks any refetch once rows are held.
  useEffect(() => { setMatchupRows(null); }, [leagueId, week?.number]);

  // Matchups are fetched lazily — only once the user actually switches modes,
  // so the default NFL view costs no extra request.
  useEffect(() => {
    if (mode !== "MATCHUPS" || !leagueId || matchupRows) return;
    if (!localStorage.getItem("token")) return;
    const wk = week?.number;
    api(`/leagues/${leagueId}/matchups${wk ? `?weekNumber=${wk}` : ""}`)
      .then((rows: any[]) => setMatchupRows(rows ?? []))
      .catch(() => setMatchupRows([]));
  }, [mode, leagueId, week?.number, matchupRows]);

  // The two modes hold different numbers of cards, so a scroll offset carried
  // over from the other one can land on blank space. Reset on every switch.
  useEffect(() => {
    if (gamesScrollRef.current) gamesScrollRef.current.scrollLeft = 0;
  }, [mode]);

  useEffect(() => {
    if (!leagueId) return;
    const hit = weekCache.get(leagueId);
    if (hit) { setWeek(hit); setLoaded(true); }
    if (!localStorage.getItem("token")) return;
    api(`/weeks?current=true&leagueId=${leagueId}`)
      .then((weeks: any) => {
        if (weeks?.[0]) { weekCache.set(leagueId, weeks[0]); setWeek(weeks[0]); }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [leagueId]);

  // Track the scroller's width. The number of copies the tape needs depends on
  // it, so a resize has to be able to change that — a fixed count that happens
  // to cover a 1200px scroller leaves a gap on an ultrawide one.
  useEffect(() => {
    const el = gamesScrollRef.current;
    if (!el) return;
    setScrollerW(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setScrollerW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, week]);

  // Anchor scroll to the first upcoming game. NFL mode only — the indices are
  // game indices, and applying them to the matchup list would scroll to an
  // unrelated position.
  useEffect(() => {
    if (mode !== "NFL") return;
    const games: any[] = week?.games ?? [];
    if (!games.length) return;
    const el = gamesScrollRef.current;
    if (!el) return;

    const now = new Date();
    const firstUpcoming = games.findIndex(
      (g) => g.status !== "FINAL" && g.status !== "CANCELLED" && new Date(g.gameDate) > now
    );
    const targetIndex = firstUpcoming === -1 ? 0 : firstUpcoming;

    // Hand the start offset to the drift loop rather than writing scrollLeft
    // here. The loop keeps its own accumulator and rewrites scrollLeft every
    // frame, so anything set behind its back is overwritten on the next tick —
    // which is what used to make this effect silently do nothing. CARD_W
    // directly, since the track holds repeated copies and dividing scrollWidth
    // by the game count would report a fraction of a card.
    startPosRef.current = targetIndex * CARD_W;
    el.scrollLeft = startPosRef.current;
  }, [week, mode]);

  // Drift the cards leftward on their own. Driven by rAF rather than an
  // interval so the step is proportional to the real frame time — a dropped
  // frame slows the motion instead of making it jump. Fractional scrollLeft is
  // fine and is what keeps it smooth at this speed. On reaching the end it
  // wraps to the start; if everything already fits there is nothing to scroll
  // and the loop idles.
  useEffect(() => {
    if (!drifting) return;
    const el = gamesScrollRef.current;
    if (!el) return;
    let raf = 0;
    let prev = performance.now();
    // The position is accumulated here rather than read back from the element
    // each frame. A frame's step is well under a pixel, and scrollLeft rounds
    // to device pixels on read, so reading it back would discard the fraction
    // every frame and the strip would never move at all.
    //
    // A pending offset from the anchor effect wins over the element's current
    // position, and is consumed so that later restarts (pausing on hover, say)
    // resume from where the tape actually is.
    let pos = startPosRef.current ?? el.scrollLeft;
    startPosRef.current = null;
    const step = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      // Wrap at one copy's width, not at the scroll maximum. Landing on the
      // matching card in the second copy makes the reset invisible; wrapping at
      // the true end would snap the whole tape back.
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
  }, [drifting, mode, week, matchupRows]);

  // Poll every 60s when any game is live
  useEffect(() => {
    const hasLive = week?.games?.some((g: any) => g.status === "IN_PROGRESS");
    if (!hasLive || !leagueId) return;
    const interval = setInterval(async () => {
      try {
        const weeks = await api(`/weeks?current=true&leagueId=${leagueId}`);
        if (weeks?.[0]) setWeek(weeks[0]);
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [week, leagueId]);

  // Only NFL mode collapses when empty. In matchups mode the frame has to stay
  // up regardless — it carries the mode selector, and returning null would take
  // away the only control for switching back.
  if (mode === "NFL" && !week?.games?.length) {
    // Settled with nothing to show — collapse. Otherwise hold the space so the
    // page below doesn't jump once the games land.
    if (loaded) return null;
    return (
      <div style={{ flexShrink: 0, background: STRIP_BG, padding: "0 300px" }}>
        <div style={{ height: SELECTOR_H, borderLeft: "1px solid var(--border)" }} />
      </div>
    );
  }


  // Accent-blue mode selector. Sits at the head of the strip and names what the
  // strip is currently showing; the chevron opens the two-option menu.
  const modeSelector = (
    // Bigger than a card in both directions so it reads as the strip's header.
    // Its height is what makes the strip taller than the cards, which are then
    // centred against it by the row's alignItems.
    <div ref={menuRef} style={{
      position: "relative", flexShrink: 0, display: "flex",
      width: SELECTOR_W, height: SELECTOR_H,
    }}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          width: "100%", height: "100%", padding: "0 12px",
          background: ACCENT, color: "#FFFFFF",
          border: "none", borderRadius: 0, boxShadow: "none",
          fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em",
          whiteSpace: "nowrap", cursor: "pointer",
        }}
      >
        {MODE_LABEL[mode]}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {menuOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 400,
          background: "var(--surface)", boxShadow: "var(--shadow-md)",
          padding: "6px 0", minWidth: 190,
        }}>
          {/* Styled inline rather than with .navmenu-league: that rule is
              scoped to `.nav`, and the strip sits outside it, so the items
              would fall back to the global navy `button` fill. */}
          {(["NFL", "MATCHUPS"] as StripMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setMenuOpen(false); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 14px",
                background: "none", border: "none", borderRadius: 0, boxShadow: "none",
                color: "#000", cursor: "pointer",
                fontSize: "0.68rem", fontWeight: mode === m ? 700 : 500,
                letterSpacing: "0.08em", whiteSpace: "nowrap",
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    // White behind the strip — the rail gutters either side, and the band above
    // and below the centred cards. The cards and the selector keep their own
    // backgrounds and are unaffected.
    <div style={{ flexShrink: 0, background: "var(--surface)", padding: "0 300px" }}>
      {/* alignItems centres the shorter cards against the taller selector,
          which is what sets the strip's height. */}
      <div style={{ display: "flex", alignItems: "center", height: SELECTOR_H, borderLeft: "1px solid var(--border)" }}>
        {modeSelector}
        {/* A mask rather than the two gradient overlays that used to sit here:
            those painted a dark wash over the edges, which reads as a shadow.
            The mask fades the cards themselves out to transparent, so they
            dissolve into whatever is behind the strip at both ends. */}
        {/* The drift pauses on hover here rather than on the row above, so the
            mode selector beside it is not part of the target — moving onto the
            blue box leaves the cards running. */}
        <div
          onMouseEnter={() => setDrifting(false)}
          onMouseLeave={() => setDrifting(true)}
          style={{
            flex: 1, overflow: "hidden", position: "relative",
            maskImage: FADE_MASK,
            WebkitMaskImage: FADE_MASK,
          }}>
          <div ref={gamesScrollRef} className="no-scrollbar" style={{ display: "flex", overflowX: "auto" }}>
            {/* Two identical halves (see buildTape). The drift wraps at the
                width of one half, landing on the identical card in the other,
                so the reset is invisible and the strip reads as an endless tape
                rather than snapping back to the start. */}
            {mode === "MATCHUPS" ? buildTape(matchupRows ?? [], scrollerW).map((mu: any, i: number) => {
              // Same card frame as a game, minus the status row: no kickoff
              // time and no open-in-page arrow, since a matchup has neither.
              const side = (u: any) => (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <HelmetAvatar color={u?.helmetColor ?? ACCENT} initials={(u?.abbreviation || u?.displayName || "?").slice(0, 2)} size={20} />
                    <span style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u?.abbreviation || u?.displayName || "—"}
                    </span>
                  </div>
                  <span style={{ fontSize: "0.7rem", fontWeight: 550, fontVariantNumeric: "tabular-nums", color: "var(--text)", whiteSpace: "nowrap" }}>
                    {u?.balance != null ? fmtMoney(u.balance) : "—"}
                  </span>
                </div>
              );
              return (
                <div key={`${mu.id}-${i}`} style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "12px 14px 6px",
                  gap: 6,
                  flex: `0 0 ${CARD_W}px`,
                  boxSizing: "border-box",
                  background: STRIP_BG,
                  borderRight: "1px solid var(--border-2)",
                  minHeight: STRIP_ROW_H,
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {side(mu.awayUser)}
                    {side(mu.homeUser)}
                  </div>
                </div>
              );
            }) : buildTape(week.games as any[], scrollerW).map((game: any, i: number) => {
              const now = new Date();
              const isLive = game.status === "IN_PROGRESS" ||
                (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);
              const isScheduled = !isLive && game.status !== "FINAL" && game.status !== "CANCELLED";
              const awayML = isScheduled ? game.gameLines?.find((l: any) => l.market === "MONEYLINE_AWAY") : null;
              const homeML = isScheduled ? game.gameLines?.find((l: any) => l.market === "MONEYLINE_HOME") : null;
              return (
                <div key={`${game.id}-${i}`}
                  onClick={interactive ? () => router.push(`/leagues/${leagueId}/bet?gameId=${game.id}`) : undefined}
                  // Only the card's own background moves on hover. The band
                  // paints its own, so it stays put and just the teams area —
                  // which has no background of its own — lightens.
                  onMouseEnter={interactive ? e => (e.currentTarget.style.background = CARD_BG_HOVER) : undefined}
                  onMouseLeave={interactive ? e => (e.currentTarget.style.background = STRIP_BG) : undefined}
                  style={{
                  display: "flex",
                  flexDirection: "column",
                  // No padding here: the date band has to bleed to both card
                  // edges, so the 14px gutter lives on the two sections below
                  // rather than on the card.
                  padding: 0,
                  gap: 0,
                  flex: `0 0 ${CARD_W}px`,
                  boxSizing: "border-box",
                  background: STRIP_BG,
                  borderRight: "1px solid var(--border-2)",
                  transition: "background 0.12s",
                  cursor: interactive ? "pointer" : "default",
                }}>
                  {/* Top row — date and open-arrow, on its own band */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", lineHeight: 1, background: DATE_STRIP_BG, padding: "4px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {isLive ? (
                        <>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--win)", flexShrink: 0 }} />
                          <span style={{ fontSize: "0.62rem", color: "var(--win)", fontWeight: 700, letterSpacing: "0.04em" }}>LIVE</span>
                        </>
                      ) : isScheduled && game.gameDate ? (
                        <>
                          {/* No timeZone option — weekday and time both render in the
                              viewer's own zone, matching the game-card footers. */}
                          <span style={{ ...TEAM_DATE, textTransform: "uppercase" }}>{new Date(game.gameDate).toLocaleDateString("en-US", { weekday: "short" })}</span>
                          <span style={TEAM_DATE}>{new Date(game.gameDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                        </>
                      ) : game.status === "CANCELLED" ? (
                        <span style={{ fontSize: "0.62rem", color: "var(--loss)", fontWeight: 700 }}>CANCELLED</span>
                      ) : (
                        <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-3)" }}>FINAL</span>
                      )}
                    </div>
                    {isLive ? (
                      game.statusDetail && <span style={{ fontSize: "0.62rem", color: "var(--text-3)", fontWeight: 700, whiteSpace: "nowrap" }}>{game.statusDetail}</span>
                    ) : isScheduled && interactive ? (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 1h6v6M9 1L1 9" />
                      </svg>
                    ) : null}
                  </div>
                  {/* Teams + scores. Spacing copied from the nfl.com scoreboard
                      card: the two rows sit flush against each other with no
                      gap, each carrying 2px of padding on its outer edge only,
                      and the logo sits 8px from the abbreviation. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "0 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, padding: "2px 0 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <TeamLogo team={game.awayTeam} size={24} plain />
                        <span style={TEAM_ABBR}>{game.awayTeam}</span>
                      </div>
                      {(isLive || game.status === "FINAL") ? (
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{game.awayScore}</span>
                      ) : awayML ? (
                        <span style={TEAM_ODDS}>{fmtOdds(awayML.odds)}</span>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, padding: "0 0 2px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <TeamLogo team={game.homeTeam} size={24} plain />
                        <span style={TEAM_ABBR}>{game.homeTeam}</span>
                      </div>
                      {(isLive || game.status === "FINAL") ? (
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{game.homeScore}</span>
                      ) : homeML ? (
                        <span style={TEAM_ODDS}>{fmtOdds(homeML.odds)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
