"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import TeamLogo from "@/components/TeamLogo";
import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import { fmtMoney } from "@/lib/money";

const STRIP_BG = "var(--bg)";

// The mode selector's fill. Back to the accent token after a spell in the NFL's
// own navy (#013369) — as a token it tracks --accent rather than pinning a
// third-party brand value into the strip.
const SELECTOR_BG = ACCENT;

// Inset of the label and the switch from their own edges of the header cell.
// One value for both sides, which is what keeps the two symmetric: the label is
// SELECTOR_PAD_X from the cell's left edge and the switch the same from its
// right. Raised from 12 to 24.
const SELECTOR_PAD_X = 24;

// The auto-scroll switch in the header cell. Sized to sit inside the label row
// without outgrowing the 0.68rem text beside it.
const TOGGLE_W = 26;
const TOGGLE_H = 14;
const TOGGLE_PAD = 2;
const TOGGLE_KNOB = TOGGLE_H - TOGGLE_PAD * 2;

// How far the pointer may travel between mousedown and mouseup and still count
// as a click on a card rather than a drag of the strip. A few pixels of hand
// tremor should still open the game.
const DRAG_CLICK_SLOP = 4;

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

// The mode selector still outgrows a card in width, so it reads as the strip's
// header rather than another cell — but no longer in height. It is pinned to
// STRIP_ROW_H so the blue block and the cards share one top and bottom edge and
// the strip reads as a single band; at its old 92 it towered over the 70px
// cards with white showing above and below them.
//
// Derived rather than a second literal: the card height is measured (see
// STRIP_ROW_H), so hardcoding 70 here would silently break the match the next
// time a card's padding changes.
const SELECTOR_W = 168;
const SELECTOR_H = STRIP_ROW_H;

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
  // MATCHUPS is currently unreachable: the mode dropdown that used to set it was
  // replaced by the auto-scroll toggle, so nothing calls setMode. The rendering
  // branch and its fetch are left intact rather than deleted, so putting the
  // switch back is a UI change only.
  const [mode, setMode] = useState<StripMode>("NFL");
  const [matchupRows, setMatchupRows] = useState<any[] | null>(null);
  // The toggle in the header cell. On by default; off stops the drift and hands
  // scrolling to the user via drag.
  const [autoScroll, setAutoScroll] = useState(true);
  // Hovering anywhere on the strip halts the drift so a card can be read (and
  // clicked) without it sliding out from under the cursor. Only relevant while
  // autoScroll is on — with it off there is no drift to pause.
  const [hovering, setHovering] = useState(false);
  // Only flips on mousedown/mouseup, not on every move — cheap enough for
  // state, and the cursor needs a re-render to change.
  const [dragging, setDragging] = useState(false);
  // Scroller width, tracked so the tape can be repeated enough times to cover
  // it. Starts at 0, which yields the minimum two copies until measured.
  const [scrollerW, setScrollerW] = useState(0);
  const gamesScrollRef = useRef<HTMLDivElement>(null);
  // Set by the anchor effect, consumed by the drift loop on its next start.
  const startPosRef = useRef<number | null>(null);
  // Drag-to-scroll bookkeeping, in a ref rather than state: these change on
  // every mousemove and none of them should trigger a re-render.
  //   moved — total distance travelled, used to tell a drag from a click
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });

  const drifting = autoScroll && !hovering;

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
      <div style={{ flexShrink: 0, background: STRIP_BG }}>
        {/* Blank — its only job is to hold SELECTOR_H so the page below does
            not jump once the games land. */}
        <div style={{ height: SELECTOR_H }} />
      </div>
    );
  }


  // The strip's header cell: the label, plus the switch that runs or stops the
  // drift. It replaced a dropdown that chose between NFL and MATCHUPS — hence
  // no chevron, and hence setMode having no caller (see the state above).
  const modeSelector = (
    // Bigger than a card in both directions so it reads as the strip's header.
    // Its height is what makes the strip taller than the cards, which are then
    // centred against it by the row's alignItems.
    <div style={{
      position: "relative", flexShrink: 0, display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 8,
      width: SELECTOR_W, height: SELECTOR_H, padding: `0 ${SELECTOR_PAD_X}px`,
      background: SELECTOR_BG, color: "#FFFFFF",
      fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em",
      whiteSpace: "nowrap",
    }}>
      {MODE_LABEL[mode]}
      <button
        type="button"
        role="switch"
        aria-checked={autoScroll}
        aria-label="Auto-scroll games"
        title={autoScroll ? "Auto-scroll on — click to stop and drag manually" : "Auto-scroll off — drag the strip to scroll"}
        onClick={() => setAutoScroll((v) => !v)}
        style={{
          flexShrink: 0, position: "relative", padding: 0,
          width: TOGGLE_W, height: TOGGLE_H, borderRadius: TOGGLE_H / 2,
          // Filled white when on, a faint wash when off — both legible on the
          // navy, without introducing a colour outside the two already here.
          background: autoScroll ? "#FFFFFF" : "rgba(255,255,255,0.26)",
          border: "none", boxShadow: "none", cursor: "pointer",
          // The track animates; the global button transform does not apply. See
          // the note on the cards' click handler about globals.css:141.
          transform: "none", transition: "background 0.18s",
        }}
      >
        <span style={{
          position: "absolute", top: (TOGGLE_H - TOGGLE_KNOB) / 2,
          left: autoScroll ? TOGGLE_W - TOGGLE_KNOB - TOGGLE_PAD : TOGGLE_PAD,
          width: TOGGLE_KNOB, height: TOGGLE_KNOB, borderRadius: "50%",
          background: autoScroll ? SELECTOR_BG : "#FFFFFF",
          transition: "left 0.18s, background 0.18s",
        }} />
      </button>
    </div>
  );

  // ── Drag-to-scroll, live only while the drift is off ──
  //
  // Writes scrollLeft directly rather than routing through state: the drift
  // loop owns that same property and rewrites it every frame, so a state
  // round-trip would fight it. With autoScroll off the loop is not running, so
  // the pointer is the only writer.
  function beginDrag(e: React.MouseEvent) {
    // Reset unconditionally. If this only ran on a real drag, `moved` would
    // keep its value from the previous one and swallow the next genuine click.
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

    // Wrap instead of stopping at either end. The tape is two identical halves
    // (see buildTape), so folding the offset into [0, oneCopy) always lands on
    // the matching card in the other half and the seam is invisible — the same
    // trick the drift loop uses, but applied in both directions because a drag
    // can run backwards. Doing the maths before the assignment matters:
    // scrollLeft clamps negatives to 0 on write, so letting it go past the
    // start would dead-end the strip rather than continue it.
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

  return (
    // White behind the strip — the band above and below the centred cards. The
    // cards and the selector keep their own backgrounds and are unaffected.
    //
    // Deliberately full-bleed: no `padding: 0 var(--rail)`. This is the one
    // component that opts out of the content rail, so the ticker runs the whole
    // window the way a scoreboard strip does, with the NFL cell flush to the
    // left edge. Everything else — TopBar, the nav and sub-nav, BetSlip,
    // .page-wide — still insets by --rail, so the strip's edges intentionally
    // do not line up with the content below it.
    <div style={{ flexShrink: 0, background: "var(--surface)" }}>
      {/* stretch, not center: the selector and the cards are now the same
          height, so letting both fill the row guarantees they share a top and
          bottom edge even if a card's measured height drifts a pixel from
          STRIP_ROW_H. Centring would leave a white sliver above and below the
          cards while the blue block still ran the full height. */}
      <div style={{ display: "flex", alignItems: "stretch", height: SELECTOR_H }}>
        {modeSelector}
        {/* A mask rather than the two gradient overlays that used to sit here:
            those painted a dark wash over the edges, which reads as a shadow.
            The mask fades the cards themselves out to transparent, so they
            dissolve into whatever is behind the strip at both ends.

            Only while drifting. The fade sells cards arriving and leaving under
            their own steam; with the drift stopped nothing is entering or
            leaving on its own, and it just dims two cards the user is trying to
            read and click. */}
        {/* The drift pauses on hover here rather than on the row above, so the
            mode selector beside it is not part of the target — moving onto the
            blue box leaves the cards running. */}
        <div
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => { setHovering(false); endDrag(); }}
          onMouseDown={beginDrag}
          onMouseMove={onDragMove}
          onMouseUp={endDrag}
          // Kills the browser's native image drag. Without it, pressing on a
          // team logo starts a picture drag with a ghost thumbnail instead of
          // scrolling the strip.
          onDragStart={(e) => e.preventDefault()}
          style={{
            flex: 1, overflow: "hidden", position: "relative",
            maskImage: autoScroll ? FADE_MASK : undefined,
            WebkitMaskImage: autoScroll ? FADE_MASK : undefined,
            // Only advertise dragging when the drift is off — with it running,
            // the pointer is for reading and clicking cards.
            cursor: autoScroll ? "default" : dragging ? "grabbing" : "grab",
            userSelect: dragging ? "none" : undefined,
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
                  // A drag ends with a click on whichever card is under the
                  // cursor, so anything past the slop is treated as a scroll
                  // gesture and must not navigate.
                  onClick={interactive ? () => {
                    if (dragRef.current.moved > DRAG_CLICK_SLOP) return;
                    router.push(`/leagues/${leagueId}/bet?gameId=${game.id}`);
                  } : undefined}
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
                    {/* Live games show the clock here. Scheduled ones used to
                        show an open-in-page arrow; it is gone, but the card
                        itself is still a link to the bet page — the onClick and
                        the pointer cursor above are what carry that, not this
                        icon. */}
                    {isLive && game.statusDetail ? (
                      <span style={{ fontSize: "0.62rem", color: "var(--text-3)", fontWeight: 700, whiteSpace: "nowrap" }}>{game.statusDetail}</span>
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
