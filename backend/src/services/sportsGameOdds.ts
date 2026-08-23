/**
 * SportsGameOdds — the odds feed. Replaces SharpAPI entirely.
 *
 * Why the switch: SharpAPI's DK+FD tier carried 2 of our 23 StatTypes and
 * posted prop alternates as milestone strings ("Cooper Kupp 4+ Receptions")
 * with only one side priced. SGO carries 22 of 23, ships alternates as
 * structured over/under pairs, and identifies players by a stable `playerID`
 * rather than a name — which is what removes name-matching from this codebase.
 *
 * BILLING SHAPE (this drives the whole polling design)
 *
 * Requests are unlimited; the quota is 2500 *entities* per month, where one
 * entity is one event returned. So `limit=16` costs 16 no matter how many
 * markets come back, and `includeAltLines=true` is free — measured, not
 * assumed. A whole week's slate is therefore one request costing 16.
 *
 * That is why services/oddsPoller.ts exists: what we spend is a function of how
 * many games we refresh and how often, and nothing else.
 */

const BASE = "https://api.sportsgameodds.com/v2";

function key(): string {
  const k = process.env.SPORTSGAMEODDS_KEY;
  if (!k) throw new Error("SPORTSGAMEODDS_KEY is not configured");
  return k;
}

// SGO teamID -> the abbreviation our tables use (ESPN's).
// `teams.home.names.short` is not usable: it gives "LA" for the Rams.
const TEAM_ABBR: Record<string, string> = {
  ARIZONA_CARDINALS_NFL: "ARI", ATLANTA_FALCONS_NFL: "ATL", BALTIMORE_RAVENS_NFL: "BAL",
  BUFFALO_BILLS_NFL: "BUF", CAROLINA_PANTHERS_NFL: "CAR", CHICAGO_BEARS_NFL: "CHI",
  CINCINNATI_BENGALS_NFL: "CIN", CLEVELAND_BROWNS_NFL: "CLE", DALLAS_COWBOYS_NFL: "DAL",
  DENVER_BRONCOS_NFL: "DEN", DETROIT_LIONS_NFL: "DET", GREEN_BAY_PACKERS_NFL: "GB",
  HOUSTON_TEXANS_NFL: "HOU", INDIANAPOLIS_COLTS_NFL: "IND", JACKSONVILLE_JAGUARS_NFL: "JAX",
  KANSAS_CITY_CHIEFS_NFL: "KC", LAS_VEGAS_RAIDERS_NFL: "LV", LOS_ANGELES_CHARGERS_NFL: "LAC",
  LOS_ANGELES_RAMS_NFL: "LAR", MIAMI_DOLPHINS_NFL: "MIA", MINNESOTA_VIKINGS_NFL: "MIN",
  NEW_ENGLAND_PATRIOTS_NFL: "NE", NEW_ORLEANS_SAINTS_NFL: "NO", NEW_YORK_GIANTS_NFL: "NYG",
  NEW_YORK_JETS_NFL: "NYJ", PHILADELPHIA_EAGLES_NFL: "PHI", PITTSBURGH_STEELERS_NFL: "PIT",
  SAN_FRANCISCO_49ERS_NFL: "SF", SEATTLE_SEAHAWKS_NFL: "SEA", TAMPA_BAY_BUCCANEERS_NFL: "TB",
  TENNESSEE_TITANS_NFL: "TEN", WASHINGTON_COMMANDERS_NFL: "WSH",
};

/**
 * Abbreviation → full team name, e.g. "LAR" → "Los Angeles Rams".
 *
 * Derived from TEAM_ABBR's own keys rather than typed out again: the SGO ids
 * ARE the full names in shouty snake case, so inverting the map and tidying the
 * key cannot drift from it.
 *
 * ESPN's player search labels each hit with exactly this string in `subtitle`,
 * which is what lets `searchEspnPlayerId` tell two players with the same name
 * apart. `.split("_").join(" ")` rather than `replaceAll` — ES2020 target.
 */
export const TEAM_FULL_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_ABBR).map(([sgoId, abbr]) => [
    abbr,
    sgoId
      .replace(/_NFL$/, "")
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" "),
  ]),
);

/**
 * SGO statID -> our StatType. 22 of our 23 are covered; RECEIVING_TARGETS has
 * no SGO market and is the only one that can never populate.
 *
 * Cached here on purpose: the /markets endpoint that lists these bills like any
 * other call (one pull cost 35 entities), so it must never run at runtime.
 */
const STAT_MAP: Record<string, string> = {
  passing_yards: "PASSING_YARDS",
  passing_touchdowns: "PASSING_TOUCHDOWNS",
  passing_completions: "PASSING_COMPLETIONS",
  passing_attempts: "PASSING_ATTEMPTS",
  passing_interceptions: "PASSING_INTERCEPTIONS",
  passing_longestCompletion: "PASSING_LONGEST",
  rushing_yards: "RUSHING_YARDS",
  rushing_touchdowns: "RUSHING_TOUCHDOWNS",
  rushing_attempts: "RUSHING_ATTEMPTS",
  rushing_longestRush: "RUSHING_LONGEST",
  receiving_yards: "RECEIVING_YARDS",
  receiving_touchdowns: "RECEIVING_TOUCHDOWNS",
  receiving_longestReception: "RECEIVING_LONGEST",
  receiving_receptions: "RECEPTIONS",
  defense_sacks: "SACKS",
  defense_combinedTackles: "TACKLES_ASSISTS",
  defense_interceptions: "DEFENSIVE_INTERCEPTIONS",
  fieldGoals_made: "FIELD_GOALS_MADE",
  fieldGoals_longestMade: "FIELD_GOAL_LONGEST",
  kicking_totalPoints: "KICKING_POINTS",
  extraPoints_kicksMade: "EXTRA_POINTS_MADE",
  // touchdowns: "TOUCHDOWNS" — REMOVED, deliberately. The feed does carry a
  // real player-touchdowns market (statID `touchdowns`, mostly `-yn-` anytime
  // scorer at 0.5 plus the odd `-ou-` 2+), so this is a product decision, not a
  // data one. Two reasons it went:
  //
  //   · The book posts no ladder for anytime TD, so the bet page fabricated one
  //     — synthetic lines AND synthetic prices — which is the exact thing fake
  //     data was ripped out of this codebase for.
  //   · It was the only market that introduced players the feed says nothing
  //     else about: no position, no jersey, no way to resolve a headshot. All
  //     18 such rows in the database existed solely because of it.
  //
  // Nothing needs purging by hand. `applyEvent` retires markets the feed stops
  // returning: rows with no bets on them are deleted, rows with bets are
  // flagged `available: false` and still settle. The StatType stays in the enum
  // so already-settled bets keep resolving.
};

/**
 * Which book to quote, in order of preference.
 *
 * FanDuel then DraftKings — the two the board has always used — then the rest
 * SGO carries. The tail matters: markets exist on an event long before every
 * book opens them, and defensive/kicking props in particular tend to be posted
 * by someone other than FD/DK first. Stopping at two meant those markets came
 * back with an empty `byBookmaker` and were silently skipped, so the Defensive
 * and Kicking tabs could never appear.
 *
 * Reading further down the list costs nothing — billing is per event, not per
 * book — and one price per market is picked, never mixed within a market.
 */
const BOOK_PRIORITY = [
  "fanduel", "draftkings", "betmgm", "caesars", "espnbet",
  "williamhill", "unibet", "bovada", "pointsbet",
];

export interface AltRung { line: number; over: number; under: number }

export interface SGOProp {
  sgoPlayerId: string;
  playerName: string;
  team: string;          // our abbreviation
  statType: string;
  line: number;
  odds: number;
  ladder: AltRung[];
  oddID: string;         // the OVER side — what settlement reads `score` from
}

export interface SGOLine {
  market: string;
  label: string;
  odds: number;
  line: number | null;
  oddID: string | null;
}

export interface SGOEvent {
  eventID: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
  finalized: boolean;
  homeScore: number | null;
  awayScore: number | null;
  lines: SGOLine[];
  props: SGOProp[];
  /** oddID -> graded value, present once a game has been played. */
  scores: Record<string, number>;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
}

/** First book in priority order that actually quoted this market. */
function pickBook(odd: any): { book: string; q: any } | null {
  const bb = odd?.byBookmaker ?? {};
  for (const b of BOOK_PRIORITY) {
    if (bb[b] && bb[b].available !== false && num(bb[b].odds) != null) return { book: b, q: bb[b] };
  }
  return null;
}

/**
 * Every line a book quoted for one side, as `line -> american odds`.
 * `field` is "overUnder" for totals/props and "spread" for spreads.
 */
function rungsOf(odd: any, book: string, field: "overUnder" | "spread"): Map<number, number> {
  const out = new Map<number, number>();
  const q = odd?.byBookmaker?.[book];
  if (!q) return out;
  const mainLine = num(q[field]);
  const mainOdds = num(q.odds);
  if (mainLine != null && mainOdds != null) out.set(mainLine, mainOdds);
  for (const alt of q.altLines ?? []) {
    if (alt.available === false) continue;
    const l = num(alt[field]);
    const o = num(alt.odds);
    if (l != null && o != null) out.set(l, o);
  }
  return out;
}

function impliedProb(american: number): number {
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100);
}

// Floored at -5000: the far end of a long ladder implies a ~99% shot, and the
// exact price for that is digits of noise nobody bets.
const MAX_FAVOURITE_ODDS = -5000;

function fromImpliedProb(p: number): number {
  const c = Math.min(0.9999, Math.max(0.0001, p));
  const odds = c >= 0.5 ? -Math.round((c / (1 - c)) * 100) : Math.round(((1 - c) / c) * 100);
  return odds < MAX_FAVOURITE_ODDS ? MAX_FAVOURITE_ODDS : odds;
}

/**
 * Pair the two sides of a market into a ladder.
 *
 * Game lines carry `altLines` on both sides, so their rungs pair up directly.
 * **Player props do not** — FanDuel posts alternates only on the OVER side, and
 * the UNDER oddID carries just its main price. Requiring both sides therefore
 * collapsed every prop ladder to a single rung, which the `>= 2` guard then
 * discarded entirely: 136 props, zero ladders.
 *
 * So where the book prices only one side, the other is derived by holding the
 * book's own overround — measured at the main line, where both sides do exist —
 * constant across the ladder. That reproduces the real main-line price exactly
 * and stays inside the book's own pricing everywhere else.
 */
function buildLadder(overOdd: any, underOdd: any, book: string, field: "overUnder" | "spread"): AltRung[] {
  const overs = rungsOf(overOdd, book, field);
  const unders = rungsOf(underOdd, book, field);

  const mainLine = num(overOdd?.byBookmaker?.[book]?.[field]);
  let overround: number | null = null;
  if (mainLine != null) {
    const o = overs.get(mainLine);
    const u = unders.get(mainLine);
    if (o != null && u != null) overround = impliedProb(o) + impliedProb(u);
  }

  const out: AltRung[] = [];
  for (const [line, over] of overs) {
    let under = unders.get(line);
    if (under == null && overround != null) {
      under = fromImpliedProb(overround - impliedProb(over));
    }
    if (under == null) continue;
    out.push({ line, over, under });
  }
  return out.sort((a, b) => a.line - b.line);
}

function parseOddID(id: string) {
  const [statID, statEntityID, periodID, betTypeID, sideID] = id.split("-");
  return { statID, statEntityID, periodID, betTypeID, sideID };
}

function fmtSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n}`;
}

function buildGameLines(odds: Record<string, any>, home: string, away: string): SGOLine[] {
  const out: SGOLine[] = [];
  const get = (id: string) => odds[id];

  // Moneyline
  for (const [side, team] of [["home", home], ["away", away]] as const) {
    const id = `points-${side}-game-ml-${side}`;
    const b = pickBook(get(id));
    if (!b) continue;
    out.push({
      market: side === "home" ? "MONEYLINE_HOME" : "MONEYLINE_AWAY",
      label: `${team} ML`, odds: num(b.q.odds)!, line: null, oddID: id,
    });
  }

  // Spread — both sides from the same book so the pair mirrors
  const spHomeId = "points-home-game-sp-home", spAwayId = "points-away-game-sp-away";
  const spBook = pickBook(get(spHomeId));
  if (spBook) {
    const hq = get(spHomeId)?.byBookmaker?.[spBook.book];
    const aq = get(spAwayId)?.byBookmaker?.[spBook.book];
    const hLine = num(hq?.spread), aLine = num(aq?.spread);
    if (hLine != null && aLine != null && num(hq?.odds) != null && num(aq?.odds) != null) {
      out.push({ market: "SPREAD_HOME", label: `${home} ${fmtSigned(hLine)}`, odds: num(hq.odds)!, line: hLine, oddID: spHomeId });
      out.push({ market: "SPREAD_AWAY", label: `${away} ${fmtSigned(aLine)}`, odds: num(aq.odds)!, line: aLine, oddID: spAwayId });
      for (const r of buildLadder(get(spHomeId), get(spAwayId), spBook.book, "spread")) {
        if (r.line === hLine) continue;
        out.push({ market: `ALT_SPREAD_HOME_${r.line}`, label: `${home} ${fmtSigned(r.line)}`, odds: r.over, line: r.line, oddID: null });
        out.push({ market: `ALT_SPREAD_AWAY_${-r.line}`, label: `${away} ${fmtSigned(-r.line)}`, odds: r.under, line: -r.line, oddID: null });
      }
    }
  }

  // Game total — statEntityID "all". "points-away-game-ou-over" is that team's
  // team-total, a different market; writing it here would mislabel it.
  const ouOverId = "points-all-game-ou-over", ouUnderId = "points-all-game-ou-under";
  const ouBook = pickBook(get(ouOverId));
  if (ouBook) {
    const oq = get(ouOverId)?.byBookmaker?.[ouBook.book];
    const uq = get(ouUnderId)?.byBookmaker?.[ouBook.book];
    const line = num(oq?.overUnder);
    if (line != null && num(oq?.odds) != null && num(uq?.odds) != null && num(uq?.overUnder) === line) {
      out.push({ market: "TOTAL_OVER", label: `Over ${line}`, odds: num(oq.odds)!, line, oddID: ouOverId });
      out.push({ market: "TOTAL_UNDER", label: `Under ${line}`, odds: num(uq.odds)!, line, oddID: ouUnderId });
      for (const r of buildLadder(get(ouOverId), get(ouUnderId), ouBook.book, "overUnder")) {
        if (r.line === line) continue;
        out.push({ market: `ALT_TOTAL_OVER_${r.line}`, label: `Over ${r.line}`, odds: r.over, line: r.line, oddID: null });
        out.push({ market: `ALT_TOTAL_UNDER_${r.line}`, label: `Under ${r.line}`, odds: r.under, line: r.line, oddID: null });
      }
    }
  }

  return out;
}

function buildProps(odds: Record<string, any>, players: Record<string, any>, home: string, away: string): SGOProp[] {
  const out: SGOProp[] = [];
  const seen = new Set<string>();

  for (const [id, odd] of Object.entries(odds)) {
    const { statID, statEntityID, periodID, betTypeID, sideID } = parseOddID(id);
    if (periodID !== "game") continue;
    const statType = STAT_MAP[statID];
    if (!statType) continue;

    // "over" for over/under markets; "yes" for anytime-style yes/no markets,
    // which are the same bet as Over 0.5.
    const isOU = betTypeID === "ou" && sideID === "over";
    const isYN = betTypeID === "yn" && sideID === "yes";
    if (!isOU && !isYN) continue;

    const player = players?.[statEntityID];
    if (!player?.name) continue;
    const team = TEAM_ABBR[player.teamID ?? ""];
    if (team !== home && team !== away) continue;

    // One prop per player+stat. An over/under market is richer than a yes/no
    // one (it carries a ladder), so it wins when the book posts both.
    const dedupe = `${statEntityID}:${statType}`;
    if (seen.has(dedupe)) continue;

    const oppId = odd.opposingOddID ?? id.replace(/-(over|yes)$/, sideID === "over" ? "-under" : "-no");
    const oppOdd = odds[oppId];
    const b = pickBook(odd);
    if (!b) continue;
    const oppQ = oppOdd?.byBookmaker?.[b.book];

    let line: number | null;
    let ladder: AltRung[];
    if (isOU) {
      line = num(b.q.overUnder);
      ladder = buildLadder(odd, oppOdd, b.book, "overUnder");
    } else {
      // yes/no: a single rung at 0.5 with both sides priced.
      line = 0.5;
      const yes = num(b.q.odds), no = num(oppQ?.odds);
      ladder = yes != null && no != null ? [{ line: 0.5, over: yes, under: no }] : [];
    }
    const odds_ = num(b.q.odds);
    if (line == null || odds_ == null) continue;

    seen.add(dedupe);
    out.push({
      sgoPlayerId: statEntityID,
      playerName: player.name,
      team,
      statType,
      line,
      odds: odds_,
      // A single rung is just the main line restated — no alternates to offer.
      ladder: ladder.length >= 2 ? ladder : [],
      oddID: id,
    });
  }

  return out;
}

/** Exported for tests: turns one raw SGO event into our shape. */
export function normalizeEvent(ev: any): SGOEvent | null {
  const home = TEAM_ABBR[ev?.teams?.home?.teamID ?? ""];
  const away = TEAM_ABBR[ev?.teams?.away?.teamID ?? ""];
  if (!home || !away) return null;   // futures / non-NFL pseudo-events

  const odds = ev.odds ?? {};
  const scores: Record<string, number> = {};
  for (const [id, o] of Object.entries<any>(odds)) {
    if (typeof o?.score === "number") scores[id] = o.score;
  }

  return {
    eventID: ev.eventID,
    startsAt: ev.status?.startsAt,
    homeTeam: home,
    awayTeam: away,
    finalized: !!(ev.status?.finalized ?? ev.status?.completed),
    homeScore: num(ev.results?.game?.home?.points),
    awayScore: num(ev.results?.game?.away?.points),
    lines: buildGameLines(odds, home, away),
    props: buildProps(odds, ev.players ?? {}, home, away),
    scores,
  };
}

async function request(path: string): Promise<any[]> {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-api-key": key() } });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`SportsGameOdds ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.data ?? [];
}

/**
 * Fetch specific events by ID. Costs one entity per event returned, so callers
 * must decide *which* games are worth refreshing before calling — see
 * services/oddsPoller.ts.
 */
export async function fetchEventsByID(eventIDs: string[]): Promise<SGOEvent[]> {
  if (eventIDs.length === 0) return [];
  const out: SGOEvent[] = [];
  // Chunked so one oversized query string can't fail the whole round.
  for (let i = 0; i < eventIDs.length; i += 20) {
    const chunk = eventIDs.slice(i, i + 20);
    const raw = await request(
      `/events?eventIDs=${chunk.join(",")}&includeAltLines=true&limit=${chunk.length}`
    );
    for (const ev of raw) {
      const n = normalizeEvent(ev);
      if (n) out.push(n);
    }
  }
  return out;
}

/** Fetch a date range — used to discover a week's events and their eventIDs. */
export async function fetchEventsByDate(startsAfter: Date, startsBefore: Date, limit: number): Promise<SGOEvent[]> {
  const p = new URLSearchParams({
    leagueID: "NFL",
    startsAfter: startsAfter.toISOString().slice(0, 10),
    startsBefore: startsBefore.toISOString().slice(0, 10),
    includeAltLines: "true",
    limit: String(limit),
  });
  const raw = await request(`/events?${p}`);
  return raw.map(normalizeEvent).filter((e): e is SGOEvent => e !== null);
}

/** Entities consumed this month, for logging and guard rails. */
export async function fetchUsage(): Promise<{ used: number; max: number }> {
  const res = await fetch(`${BASE}/account/usage`, { headers: { "x-api-key": key() } });
  const body: any = await res.json().catch(() => ({}));
  const m = body?.data?.rateLimits?.["per-month"] ?? {};
  return { used: Number(m["current-entities"] ?? 0), max: Number(m["max-entities"] ?? 0) };
}

export { STAT_MAP, TEAM_ABBR };
