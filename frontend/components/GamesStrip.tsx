"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import TeamLogo from "@/components/TeamLogo";
import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import { fmtMoney } from "@/lib/money";
import { useOpticalAlign } from "@/lib/useOpticalAlign";

const STRIP_BG = "var(--bg)";

// The mode selector's fill. Back to the accent token after a spell in the NFL's
// own navy (#013369) and a spell in --surface-3 — as a token it tracks --accent
// rather than pinning a third-party brand value into the strip.
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

// The one hairline every strip cell is drawn with. Each card carries it on its
// right and its bottom: the right edges are the dividers between neighbouring
// cards, and the bottom closes the row off underneath so a card reads as a
// boxed cell rather than a column of type standing on white. Same weight and
// token on both, which is what keeps the corner where they meet clean.
//
// The cards are stretched to the row height by the container, and they are
// border-box, so the bottom rule is taken out of the card's own 70px rather
// than added to the strip — the strip does not get 1px taller.
const CARD_BORDER = "1px solid var(--border-2)";

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
//
// A mask, not a tinted overlay, and that is the point: only its alpha channel is
// read, so the `#000` here is arbitrary and the cards fade to TRANSPARENT rather
// than to a colour. Whatever the strip sits on shows through, which stays right
// on its own if the background ever changes. Tinting the ends in the accent was
// tried and reverted — it has to be painted OVER the cards, so it only reads as
// a dissolve where the colour matches the backdrop, and the right-hand end has
// nothing behind it to match.
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

// Week data, cached per league so a fresh mount paints from memory instead of
// flashing an empty bar while it refetches. Predates AppChrome, when the strip
// was mounted by two different layouts and crossing between a league and /home
// swapped one instance for another; it still earns its place on a hard reload.
const weekCache = new Map<string, any>();

// ── Auto-scroll preference ──────────────────────────────────────────────────
// Off means off everywhere, across navigation and across sessions, until it is
// switched back on. Two layers, because they solve different halves:
//
//   autoScrollPref — module-level, so a remount paints the right state on its
//     first frame. Reading localStorage in the effect below is a frame too
//     late, and the toggle would visibly flick back on before settling.
//   localStorage   — survives a reload, which the module variable does not.
//
// Never read in a useState initializer: that runs during SSR, where there is no
// localStorage and the server would render the default while the client
// rendered the stored value — a hydration mismatch. The initializer takes the
// module variable (safe on both sides, since it starts at the default), and the
// stored value is folded in from an effect on mount.
const AUTO_SCROLL_KEY = "strip_autoscroll";

let autoScrollPref = true;

function readStoredAutoScroll(): boolean {
  if (typeof window === "undefined") return autoScrollPref;
  // Only an explicit "0" turns it off. A missing key, a cleared store, or a
  // value written by some older build all fall through to on, which is the
  // default the strip should have when nothing is known.
  return localStorage.getItem(AUTO_SCROLL_KEY) !== "0";
}

function writeAutoScroll(on: boolean) {
  autoScrollPref = on;
  try {
    localStorage.setItem(AUTO_SCROLL_KEY, on ? "1" : "0");
  } catch {
    // Private mode or a full quota. The module variable already took the value,
    // so the preference still holds for this session — it just won't outlive it.
  }
}

// The two things the strip can show. NFL is the default; MATCHUPS reuses the
// exact same card shape with league members in place of teams.
type StripMode = "NFL" | "MATCHUPS";
const MODE_LABEL: Record<StripMode, string> = {
  NFL: "NFL",
  MATCHUPS: "MATCHUPS",
};

// Team abbreviations and the small meta text beside them, both sized from the
// nfl.com scoreboard strip: 12px/700 with 0.04em tracking for the
// abbreviation, 10px/500 with the same tracking in grey for everything else.
//
// The abbreviation is the one place in the app that departs from the UI face.
// It was Fugaz One at 400, slanted 12deg; it is Lemon Milk at 700, upright, as
// of 22 Aug 2026 — see TEAM_ABBR below for why each of those three changed.
// FUGAZ ONE IS NOW UNUSED: still loaded in app/layout.tsx, consumed by nothing.

/**
 * Drops the abbreviation onto the logo's optical centre.
 *
 * `align-items: center` centres the abbreviation's LINE BOX against the 24px
 * logo. The eye does not read a line box: for all-caps text with no descenders
 * it reads the middle of the CAPS, and Fugaz One is not symmetric about that.
 *
 * The value is MEASURED AT RUNTIME by lib/useOpticalAlign, because no constant
 * can be correct — Chrome rounds the face's ascent and descent to whole device
 * pixels independently, and browser zoom changes what a device pixel is. Read
 * the header of that file before touching any of these; it is the reason the
 * old hardcoded nudges kept drifting.
 *
 * The logos are not the culprit and were checked: all of them are ink-centred
 * in their own bitmap to within 0.0025 of frame height.
 *
 * Fallbacks are the pure-geometry values — what a display with no rounding
 * error would want. They paint for the frame or two before the hook reports.
 */
const ABBR_OPTICAL_SHIFT = "var(--strip-abbr-shift, 0.5663px)";

const TEAM_ABBR = {
  // Lemon Milk, not Fugaz One. An all-caps display face is a liability for a
  // ten-letter name and an asset for a three-letter team code, which is caps by
  // nature — so the property that disqualified it as a wordmark costs nothing
  // here. Mounted globally in app/layout.tsx.
  fontFamily: "var(--font-lemon-milk), system-ui, sans-serif",
  // 700, a real cut. Fugaz One sat at 400 because it ships exactly one weight
  // and asking for more would have had the browser fake a bold on an already
  // heavy face. Lemon Milk carries 400/500/700, so 700 is drawn, not synthesised.
  fontWeight: 700,
  // Upright. The 12deg oblique existed because Fugaz One has no italic cut, so
  // the slant was synthesised — a shear applied to upright letterforms rather
  // than a drawn italic. Dropped with the face that needed it.
  fontStyle: "normal",
  fontSize: "0.75rem",
  letterSpacing: "0.04em",
  color: "var(--text)",
  position: "relative" as const,
  top: ABBR_OPTICAL_SHIFT,
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
// a record would use — 700, level with the date band above them, so the two
// pieces of Inter Tight on the card carry the same weight and only colour and
// size separate them.
/**
 * Baseline corrections for the three pairs that sit one face beside another in
 * a centred row. All MEASURED AT RUNTIME — see lib/useOpticalAlign.
 *
 * These were hardcoded as -0.385, -0.769 and 0.385. Every one of those is a
 * whole or half DEVICE pixel divided by one machine's 1.3 dpr: the numbers were
 * read off a rendered screen that Chrome had already rounded, so what got
 * recorded was that display's rounding wearing font geometry's clothes. Bake in
 * a rounding artifact from one dpr and it is wrong at every other dpr — and
 * browser zoom changes the dpr. That is the whole reason alignment in this
 * strip kept looking right at one zoom and a pixel out at the next.
 *
 * The odds one was also just wrong: its true offset is +0.104, so a -0.385
 * nudge moved the odds AWAY from the abbreviation's baseline, leaving them
 * ~0.49px worse off than no correction at all.
 *
 * The odds and score sit beside the abbreviation and must stay locked to its
 * baseline, so the hook folds ABBR_OPTICAL_SHIFT into both — the abbreviation
 * moved down to meet the logo, and they go with it. The matchup row has no
 * Fugaz One and no logo, so its value takes its own delta alone.
 *
 * `position: relative` is paint-only, so row heights are untouched — which is
 * the point. Baseline-aligning the row instead does fix the pairing, but it
 * changes what drives the row's height and lifts the whole text group off the
 * logo.
 *
 * Nothing here needs re-tuning when a face or size changes. The hook reads the
 * sizes off REM in its own file and measures whatever face is actually
 * resolving, so keep those two in step with the objects below and it follows.
 */
const ODDS_BASELINE_NUDGE = "var(--strip-odds-shift, 0.6703px)";
const SCORE_BASELINE_NUDGE = "var(--strip-score-shift, -0.0529px)";
const MATCHUP_VALUE_NUDGE = "var(--strip-value-shift, 0.2885px)";

// The live/final score that replaces the odds. Hoisted out of the two inline
// objects it used to be duplicated into, so the nudge cannot be applied to one
// row and forgotten on the other.
const TEAM_SCORE = {
  fontSize: "0.75rem",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums" as const,
  color: "var(--text)",
  position: "relative" as const,
  top: SCORE_BASELINE_NUDGE,
};
const TEAM_ODDS = {
  ...TEAM_META,
  color: ACCENT,
  fontWeight: 700,
  position: "relative" as const,
  top: ODDS_BASELINE_NUDGE,
};

// The date in the top band runs bolder than nfl.com's 500 — it is the card's
// only label up there, so it carries more weight than a stat line would.
const TEAM_DATE = { ...TEAM_META, fontWeight: 700 };

/**
 * Bet count as it appears on a card.
 *
 * Up to three digits it prints plainly — 1, 42, 999. From 1000 it becomes one
 * decimal and a k: 1.2k, 12.3k. CARD_W is 128px and the date on the left of the
 * same row already takes most of it ("SUN 10:00 PM" is the worst case), so a
 * fourth digit is where the two would meet in the middle.
 *
 * "1.2k" is four glyphs against "1234"'s four, so the swap costs no width — it
 * just stops the number growing without bound. The integer part is deliberately
 * uncapped: a million would print as 1000.0k. Silly, but it is orders of
 * magnitude past anything this app will see, and an M branch for it would be
 * dead code.
 *
 * toFixed rounds rather than truncates, so 1250 is 1.3k and 9999 is 10.0k.
 */
function fmtBetCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export default function GamesStrip({ leagueId, interactive = true }: { leagueId: string; interactive?: boolean }) {
  const router = useRouter();
  // Publishes --strip-*-shift, the vertical text offsets the cards below read.
  // Must be measured rather than hardcoded; the hook's header explains why.
  useOpticalAlign();
  const cached = weekCache.get(leagueId || "__public__") ?? null;
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
  // Bet counts live in their OWN state, keyed by game id, and are never merged
  // back into `week`. Calling setWeek on a 30s cadence would replace the week
  // object wholesale and restart everything keyed off it — the drift loop, the
  // scroll anchor — which is the exact failure the weekKey/anchoredKeyRef
  // guards below exist to prevent. See "Strip continuity" in CLAUDE.md.
  const [betCounts, setBetCounts] = useState<Record<string, number>>({});
  // The hovered count's tooltip. Position is viewport coordinates, because the
  // popup is position: fixed — see where it renders, at the foot of this file.
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  // The toggle in the header cell. On by default; off stops the drift and hands
  // scrolling to the user via drag. Global and sticky — see the autoScrollPref
  // block above for why the initial value comes from the module variable and
  // the stored one is folded in from an effect.
  const [autoScroll, setAutoScrollState] = useState(autoScrollPref);

  useEffect(() => {
    const stored = readStoredAutoScroll();
    autoScrollPref = stored;
    setAutoScrollState(stored);
  }, []);

  function setAutoScroll(on: boolean) {
    writeAutoScroll(on);
    setAutoScrollState(on);
  }
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

  // Which week the tape has already been positioned for. The anchor below is a
  // one-time placement, not something to re-apply: `week` takes a fresh object
  // identity on every refetch — crossing a route boundary, and once a minute
  // while a game is live — and re-running on identity slammed the strip back to
  // the first upcoming game each time, which is what made the ticker visibly
  // restart when switching pages. Keyed on the week itself, so a genuinely
  // different week still gets anchored.
  const anchoredKeyRef = useRef<string | null>(null);
  // Drag-to-scroll bookkeeping, in a ref rather than state: these change on
  // every mousemove and none of them should trigger a re-render.
  //   moved — total distance travelled, used to tell a drag from a click
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });

  const drifting = autoScroll && !hovering;

  // Which week this is, as a primitive. `week` is replaced wholesale by every
  // refetch — a route change, or the live-score poll once a minute — even when
  // it is the same week showing the same cards. Effects that only care *which*
  // week it is key off this instead of the object, so a score update no longer
  // tears down the drift loop and the observers underneath it.
  const weekKey = week?.id ?? week?.number ?? null;

  // Hoisted for the same reason: the poll's own dependency is whether anything
  // is live, not the week object it read that from.
  const hasLive = Boolean(week?.games?.some((g: any) => g.status === "IN_PROGRESS"));

  // Whether any game has yet to kick off — the window in which a bet count can
  // still move. Deliberately the inverse of hasLive above: bets lock at kickoff
  // and cashout is refused after it, so once every game has started the numbers
  // are frozen and polling them is pure waste. A boolean, so the poll's effect
  // does not restart on every re-render the way a `week` dependency would.
  const hasUpcoming = Boolean(
    week?.games?.some(
      (g: any) =>
        g.status !== "FINAL" &&
        g.status !== "CANCELLED" &&
        g.gameDate &&
        new Date(g.gameDate).getTime() > Date.now()
    )
  );

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
    // Three cases now that the strip runs on public routes too:
    //
    //  - a league and a token  -> that league's current week, as before
    //  - no league, or no token -> /weeks/public/current, which needs neither
    //
    // The public endpoint carries games but no props or game lines, which is
    // all this component draws. Cached under a fixed key so the landing page
    // and the auth funnel share one fetch.
    const token = typeof window !== "undefined" && localStorage.getItem("token");
    const scoped = Boolean(leagueId && token);
    const key = scoped ? leagueId : "__public__";

    const hit = weekCache.get(key);
    if (hit) { setWeek(hit); setLoaded(true); }

    api(scoped ? `/weeks?current=true&leagueId=${leagueId}` : "/weeks/public/current")
      .then((weeks: any) => {
        if (weeks?.[0]) { weekCache.set(key, weeks[0]); setWeek(weeks[0]); }
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
  }, [mode, weekKey]);

  // Anchor scroll to the first upcoming game. NFL mode only — the indices are
  // game indices, and applying them to the matchup list would scroll to an
  // unrelated position.
  useEffect(() => {
    if (mode !== "NFL") return;
    const games: any[] = week?.games ?? [];
    if (!games.length) return;
    const el = gamesScrollRef.current;
    if (!el) return;

    // Mode is in the key because the two lists hold different cards, so coming
    // back to NFL does want re-anchoring. Recorded only once the element exists,
    // so an early render with no scroller doesn't burn the key.
    const key = `${mode}:${weekKey ?? ""}`;
    if (anchoredKeyRef.current === key) return;
    anchoredKeyRef.current = key;

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
  }, [weekKey, mode, week]);

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
  }, [drifting, mode, weekKey, matchupRows]);

  // Poll every 60s when any game is live. Keyed on `hasLive` rather than the
  // week object: keyed on the object, every poll replaced `week` and so
  // restarted its own interval, and the loop below it.
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

  // Bet counts, on their own endpoint and their own cadence.
  //
  // No leagueId gate, unlike the score poll above: the counts are platform-wide
  // and the endpoint is unauthenticated, so this runs on the landing page for
  // signed-out visitors too — who would otherwise see a number frozen at page
  // load forever.
  //
  // 30s against a 15s server-side cache, so a crowd all watching the same week
  // costs a fixed handful of queries a minute rather than one per viewer.
  useEffect(() => {
    const weekId = week?.id;
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
  }, [hasUpcoming, week?.id]);

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
        onClick={() => setAutoScroll(!autoScroll)}
        style={{
          flexShrink: 0, position: "relative", padding: 0,
          width: TOGGLE_W, height: TOGGLE_H, borderRadius: TOGGLE_H / 2,
          // Filled white when on, a faint wash when off — both legible on the
          // accent, without introducing a colour outside the two already here.
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
            // Always on, drift or no drift. It used to be gated on autoScroll,
            // on the reasoning that a stopped strip is one you are dragging and
            // reading, so dissolving the ends would hide cards you are reaching
            // for. In practice the ends stayed soft while it moved and went
            // hard the moment you touched it, which read as the edge treatment
            // flickering in and out rather than as a considered state.
            maskImage: FADE_MASK,
            WebkitMaskImage: FADE_MASK,
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
                  <span style={{ fontSize: "0.7rem", fontWeight: 550, fontVariantNumeric: "tabular-nums", color: "var(--text)", whiteSpace: "nowrap", position: "relative", top: MATCHUP_VALUE_NUDGE }}>
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
                  borderRight: CARD_BORDER,
                  borderBottom: CARD_BORDER,
                  // Border-box, so the hairline comes out of STRIP_ROW_H rather
                  // than pushing past it — same reasoning as the game card.
                  height: STRIP_ROW_H,
                  minHeight: 0,
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
              // Polled value wins; the week payload's own betCount is the
              // starting point, so the number is right on the first paint
              // rather than after the first poll.
              const betCount = betCounts[game.id] ?? game.betCount ?? 0;
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
                  // The card's content measures out to exactly STRIP_ROW_H, so
                  // `align-items: stretch` alone is not enough once there is a
                  // bottom border: min-height:auto floors the item at its
                  // content height and the border lands a pixel *below* the
                  // strip, where the nav (z-index 200, opaque) paints over it.
                  // Pinning the border box to STRIP_ROW_H and releasing the
                  // floor takes the hairline out of the 70px instead of adding
                  // to it. STRIP_ROW_H rather than `height: 100%`: the scroller
                  // between this card and the fixed-height row is itself auto,
                  // so a percentage has nothing to resolve against.
                  height: STRIP_ROW_H,
                  minHeight: 0,
                  background: STRIP_BG,
                  borderRight: CARD_BORDER,
                  borderBottom: CARD_BORDER,
                  transition: "background 0.12s",
                  cursor: interactive ? "pointer" : "default",
                }}>
                  {/* Top row — date and open-arrow, on its own band */}
                  {/* alignItems baseline, not centre: the count is a hair smaller than the
                      date opposite it, and centring two different sizes puts them on two
                      different baselines — they read as one line only if they sit on one.
                      The 8px of padding is symmetric, so the date's left inset and the
                      count chip's right inset are the same distance from the card edge. */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", lineHeight: 1, background: DATE_STRIP_BG, padding: "4px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {/* The kickoff, whatever the game's state — no LIVE badge,
                          no FINAL, no CANCELLED. Every card now reads the same
                          way: date, bet count, teams, and a number on the right
                          that is the odds before kickoff and the score after.
                          The state is carried by WHICH number that is, so the
                          band does not have to say it as well.

                          No timeZone option — weekday and time both render in
                          the viewer's own zone, matching the game-card footers. */}
                      {game.gameDate && (
                        <>
                          <span style={{ ...TEAM_DATE, textTransform: "uppercase" }}>{new Date(game.gameDate).toLocaleDateString("en-US", { weekday: "short" })}</span>
                          <span style={TEAM_DATE}>{new Date(game.gameDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                        </>
                      )}
                    </div>
                    {/* How many bets are riding on this game, across every
                        league. Replaces the live game clock that used to hold
                        this slot — the two cannot share it at CARD_W 128, which
                        leaves about 44px beside the date.

                        Zero renders as nothing rather than as "0". Most cards
                        are zero most of the time, and a column of noughts down
                        the strip reads as a broken feature rather than a quiet
                        one.

                        Static once the game starts, so nothing here polls for
                        it: placement locks at kickoff and cashout is refused
                        after it, which between them freeze the number. It rides
                        along on the week payload the strip already fetches. */}
                    {betCount > 0 ? (
                      <span
                        style={{ fontSize: "0.62rem", fontWeight: 700, whiteSpace: "nowrap", cursor: "default", color: "var(--text)" }}
                        onMouseEnter={e => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setTip({
                            // Singular reads badly pluralised: "1 bets have".
                            text: betCount === 1
                              ? "1 bet has been placed on this game."
                              : `${betCount} bets have been placed on this game.`,
                            x: r.left + r.width / 2,
                            y: r.bottom + 6,
                          });
                        }}
                        onMouseLeave={() => setTip(null)}
                      >
                        {fmtBetCount(betCount)}
                      </span>
                    ) : null}
                  </div>
                  {/* Teams + scores. Spacing copied from the nfl.com scoreboard
                      card: the two rows sit flush against each other with no
                      gap, each carrying 2px of padding on its outer edge only,
                      and the logo sits 8px from the abbreviation.

                      alignItems is CENTRE here, and switching it to baseline is
                      a dead end that was tried: the abbreviation is Fugaz One at
                      0.75rem and the odds beside it Inter Tight at 0.625rem, so
                      baseline alignment does line those two up — but it also
                      changes what drives the row's height, and the whole text
                      group rides up off the logo.

                      Centring the row is therefore only half the job: it centres
                      LINE BOXES, and neither the abbreviation's caps nor the
                      odds' baseline sit at their line box's centre. Three
                      paint-only nudges finish it — ABBR_OPTICAL_SHIFT drops the
                      caps onto the logo's centre, and the odds and score follow
                      the abbreviation down. All three are derived from font
                      metrics rather than read off the screen; see the note above
                      ODDS_BASELINE_NUDGE for why that matters. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "0 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, padding: "2px 0 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <TeamLogo team={game.awayTeam} size={24} plain />
                        <span style={TEAM_ABBR}>{game.awayTeam}</span>
                      </div>
                      {(isLive || game.status === "FINAL") ? (
                        <span style={TEAM_SCORE}>{game.awayScore}</span>
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
                        <span style={TEAM_SCORE}>{game.homeScore}</span>
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

      {/* Hover popup for a card's bet count.

          position: fixed, not absolute. The scroller above is overflow: hidden
          and the tape overflowX: auto, so an absolutely positioned popup would
          be clipped to the card it belongs to — and the sentence is wider than
          CARD_W 128 on its own. Fixed escapes both, since nothing in the strip's
          ancestry sets a transform or filter that would make it a containing
          block for fixed children.

          Anchoring to a card in a moving strip is safe because hovering already
          stops the drift: `drifting` is `autoScroll && !hovering`, so the card
          cannot slide out from under the pointer while this is up.

          Opens downward, always. The strip sits at the top of the viewport with
          only the utility bar above it, so there is no room above to open into.

          translateX(-50%) centres it on the number, and the clamp keeps it on
          screen for the cards at either end of the strip, where half the popup
          would otherwise sit outside the window.

          --shadow-md is the overlay shadow the design system reserves for
          exactly this, and it still earns its place on a black fill: it is what
          separates the rectangle from the card edges behind it. pointerEvents
          none so it can never eat a click meant for the card underneath. */}
      {tip ? (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: Math.min(Math.max(tip.x, 96), (typeof window !== "undefined" ? window.innerWidth : 0) - 96),
            top: tip.y,
            transform: "translateX(-50%)",
            // Black, square, borderless. --bar-bg rather than a literal #000 so
            // the app keeps ONE black: the popup, the utility bar and the
            // footer move together if it is ever changed. A hairline border
            // would do nothing on a black fill against a white card, and the
            // house 6px radius is dropped here on purpose — this is the one
            // overlay drawn as a hard rectangle.
            background: "var(--bar-bg)",
            border: "none",
            borderRadius: 0,
            boxShadow: "var(--shadow-md)",
            padding: "6px 9px",
            fontSize: "0.68rem",
            color: "#FFFFFF",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 400,
          }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
