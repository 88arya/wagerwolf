const BASE = "https://api.sharpapi.io/api/v1";

// Tier limits: DraftKings + FanDuel only, 12 requests/min rolling window
const BOOKS = "draftkings,fanduel";
const PAGE_DELAY_MS = 5500;
const MAX_PAGES = 40;
const MAX_RATE_RETRIES = 3;

// Book priority when both post the same market — FanDuel first, DraftKings fallback
const BOOK_RANK: Record<string, number> = { fanduel: 0, draftkings: 1 };

const GAME_LINE_MARKETS = ["moneyline", "point_spread", "total_points"];

// The 8 StatTypes SharpAPI's catalog covers; kicking + defensive INT markets
// don't exist in their system at all and stay on fakeSync
const PROP_MARKET_TO_KEY: Record<string, string> = {
  player_passing_yards: "passing_yards",
  player_passing_touchdowns: "passing_touchdowns",
  player_rushing_yards: "rushing_yards",
  player_receiving_yards: "receiving_yards",
  player_receptions: "receptions",
  player_touchdowns: "touchdowns",
  player_sacks: "sacks",
  player_tackles: "tackles_assists",
};

function key(): string {
  const k = process.env.SHARPAPI_KEY;
  if (!k) throw new Error("SHARPAPI_KEY is not configured");
  return k;
}

export interface RawProp {
  playerName: string;
  market: string;
  line: number;
  odds: number;
}

export interface RawGameLine {
  market: string;   // MONEYLINE_* | SPREAD_* | TOTAL_* | ALT_SPREAD_* | ALT_TOTAL_*
  label: string;
  odds: number;     // American
  line: number | null;
}

export interface NFLGameData {
  eventId: string;
  commenceTime: string;
  homeTeam: string;  // abbreviation (KC, BUF…) — matches DB
  awayTeam: string;
  lines: RawGameLine[];
  props: RawProp[];
}

interface SharpTeam {
  id?: string;
  name?: string;
  abbreviation?: string;
}

interface SharpRow {
  sportsbook: string;
  event_id: string;
  market_type: string;
  selection: string;
  selection_type?: string;
  odds_american: number;
  line?: number | null;
  event_start_time: string;
  player_name?: string;
  is_alternate_line?: boolean;
  is_main_line?: boolean;
  is_player_prop?: boolean;
  home?: SharpTeam;
  away?: SharpTeam;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// SharpAPI team abbreviations that differ from ESPN's (our DB standard)
const ABBR_FIX: Record<string, string> = { WAS: "WSH", LVR: "LV", JAC: "JAX", ARZ: "ARI" };

function teamAbbr(t: SharpTeam | undefined): string {
  const a = (t?.abbreviation ?? "").toUpperCase();
  return ABBR_FIX[a] ?? a;
}

function norm(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function sideOf(row: SharpRow): "home" | "away" | null {
  const st = (row.selection_type ?? "").toLowerCase();
  if (st === "home" || st === "away") return st;
  const sel = norm(row.selection);
  if (!sel) return null;
  for (const side of ["home", "away"] as const) {
    const t = row[side];
    if (!t) continue;
    if (norm(t.id) === sel || norm(t.name) === sel || norm(t.abbreviation) === sel) return side;
  }
  return null;
}

function overUnderOf(row: SharpRow): "OVER" | "UNDER" | null {
  const st = (row.selection_type ?? "").toLowerCase();
  if (st === "over") return "OVER";
  if (st === "under") return "UNDER";
  const sel = (row.selection ?? "").toLowerCase();
  if (sel.startsWith("over")) return "OVER";
  if (sel.startsWith("under")) return "UNDER";
  return null;
}

async function fetchAllRows(markets: string[]): Promise<SharpRow[]> {
  const rows: SharpRow[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      sport: "football",
      league: "nfl",
      sportsbook: BOOKS,
      market: markets.join(","),
      limit: "200",
    });
    if (cursor) params.set("cursor", cursor);

    let body: any;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE}/odds?${params.toString()}`, {
        headers: { "X-API-Key": key() },
      });
      body = await res.json().catch(() => ({}));
      if (res.status === 429 || body?.error?.code === "rate_limited") {
        if (attempt >= MAX_RATE_RETRIES) throw new Error("SharpAPI rate limited, retries exhausted");
        const waitSec = body?.error?.retryAfter ?? 60;
        console.log(`[sharpapi] Rate limited, waiting ${waitSec}s`);
        await sleep(waitSec * 1000 + 500);
        continue;
      }
      if (!res.ok) throw new Error(`SharpAPI ${res.status}: ${JSON.stringify(body)}`);
      break;
    }

    rows.push(...(body.data ?? []));
    const pg = body.pagination;
    if (!pg?.has_more || !pg?.next_cursor) break;
    cursor = pg.next_cursor;
    await sleep(PAGE_DELAY_MS);
  }

  return rows;
}

// The same matchup appears under multiple event ids (_b0/_b2/_b3 suffixes)
// depending on which book fed it — strip the suffix to merge them
function canonicalEventId(eventId: string): string {
  return eventId.replace(/_b\d+$/, "");
}

function fmtSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n}`;
}

interface Slot {
  rank: number;
  line: RawGameLine;
}

interface PropSlot {
  rank: number;
  prop: RawProp;
}

interface MainRow {
  market_type: string;
  side: "home" | "away" | null;
  dir: "OVER" | "UNDER" | null;
  line: number | null;
  odds: number;
  rank: number;
  srcId: string; // full event_id incl. _bN suffix — one feed snapshot
}

// Pick main lines so both sides of a market come from the same book+feed
// snapshot — mixing snapshots produces non-mirrored spread/total pairs
function pickMainLines(mainRows: MainRow[], home: string, away: string): RawGameLine[] {
  const groups = new Map<string, MainRow[]>();
  for (const r of mainRows) {
    const gk = `${r.rank}|${r.srcId}`;
    const g = groups.get(gk);
    if (g) g.push(r); else groups.set(gk, [r]);
  }
  const ordered = [...groups.values()].sort((a, b) => (a[0].rank - b[0].rank) || (b.length - a.length));

  const out: RawGameLine[] = [];

  const mlGroup = ordered.find((g) => g.some((r) => r.market_type === "moneyline" && r.side === "home") && g.some((r) => r.market_type === "moneyline" && r.side === "away"))
    ?? ordered.find((g) => g.some((r) => r.market_type === "moneyline"));
  if (mlGroup) {
    for (const side of ["home", "away"] as const) {
      const r = mlGroup.find((x) => x.market_type === "moneyline" && x.side === side);
      if (r) out.push({ market: side === "home" ? "MONEYLINE_HOME" : "MONEYLINE_AWAY", label: `${side === "home" ? home : away} ML`, odds: r.odds, line: null });
    }
  }

  for (const g of ordered) {
    const h = g.find((r) => r.market_type === "point_spread" && r.side === "home" && r.line != null);
    const a = g.find((r) => r.market_type === "point_spread" && r.side === "away" && r.line != null);
    if (!h || !a || h.line !== -(a.line as number)) continue;
    out.push({ market: "SPREAD_HOME", label: `${home} ${fmtSigned(h.line!)}`, odds: h.odds, line: h.line });
    out.push({ market: "SPREAD_AWAY", label: `${away} ${fmtSigned(a.line!)}`, odds: a.odds, line: a.line });
    break;
  }

  for (const g of ordered) {
    const o = g.find((r) => r.market_type === "total_points" && r.dir === "OVER" && r.line != null);
    const u = g.find((r) => r.market_type === "total_points" && r.dir === "UNDER" && r.line != null);
    if (!o || !u || o.line !== u.line) continue;
    out.push({ market: "TOTAL_OVER", label: `Over ${o.line}`, odds: o.odds, line: o.line });
    out.push({ market: "TOTAL_UNDER", label: `Under ${u.line}`, odds: u.odds, line: u.line });
    break;
  }

  return out;
}

// One fetch covers the whole league: game lines + all covered prop markets
export async function getNFLWeekData(): Promise<NFLGameData[]> {
  const markets = [...GAME_LINE_MARKETS, ...Object.keys(PROP_MARKET_TO_KEY)];
  const rows = await fetchAllRows(markets);

  const events = new Map<string, {
    commenceTime: string;
    homeTeam: string;
    awayTeam: string;
    mainRows: MainRow[];
    altSlots: Map<string, Slot>;
    propSlots: Map<string, PropSlot>;
  }>();

  for (const row of rows) {
    const home = teamAbbr(row.home);
    const away = teamAbbr(row.away);
    // Futures/pseudo-events ("NFL Specials", player-award markets) have no matchup
    if (!home || !away) continue;
    if (typeof row.odds_american !== "number") continue;

    const eventId = canonicalEventId(row.event_id);
    let ev = events.get(eventId);
    if (!ev) {
      ev = {
        commenceTime: row.event_start_time,
        homeTeam: home,
        awayTeam: away,
        mainRows: [],
        altSlots: new Map(),
        propSlots: new Map(),
      };
      events.set(eventId, ev);
    }

    const rank = BOOK_RANK[row.sportsbook] ?? 9;
    const odds = Math.round(row.odds_american);

    if (row.is_player_prop) {
      const marketKey = PROP_MARKET_TO_KEY[row.market_type];
      if (!marketKey || !row.player_name || row.line == null) continue;
      if (overUnderOf(row) !== "OVER") continue;
      const slotKey = `${row.player_name}:${marketKey}`;
      const existing = ev.propSlots.get(slotKey);
      if (!existing || rank < existing.rank) {
        ev.propSlots.set(slotKey, { rank, prop: { playerName: row.player_name, market: marketKey, line: row.line, odds } });
      }
      continue;
    }

    if (row.market_type === "moneyline") {
      const side = sideOf(row);
      if (!side || row.is_alternate_line) continue;
      ev.mainRows.push({ market_type: "moneyline", side, dir: null, line: null, odds, rank, srcId: row.event_id });
    } else if (row.market_type === "point_spread") {
      const side = sideOf(row);
      if (!side || row.line == null) continue;
      if (row.is_alternate_line) {
        const market = `ALT_SPREAD_${side.toUpperCase()}_${row.line}`;
        const label = `${side === "home" ? home : away} ${fmtSigned(row.line)}`;
        const existing = ev.altSlots.get(market);
        if (!existing || rank < existing.rank) {
          ev.altSlots.set(market, { rank, line: { market, label, odds, line: row.line } });
        }
      } else {
        ev.mainRows.push({ market_type: "point_spread", side, dir: null, line: row.line, odds, rank, srcId: row.event_id });
      }
    } else if (row.market_type === "total_points") {
      const dir = overUnderOf(row);
      if (!dir || row.line == null) continue;
      if (row.is_alternate_line) {
        const market = `ALT_TOTAL_${dir}_${row.line}`;
        const label = `${dir === "OVER" ? "Over" : "Under"} ${row.line}`;
        const existing = ev.altSlots.get(market);
        if (!existing || rank < existing.rank) {
          ev.altSlots.set(market, { rank, line: { market, label, odds, line: row.line } });
        }
      } else {
        ev.mainRows.push({ market_type: "total_points", side: null, dir, line: row.line, odds, rank, srcId: row.event_id });
      }
    }
  }

  const result: NFLGameData[] = [];
  for (const [eventId, ev] of events) {
    const lines = [
      ...pickMainLines(ev.mainRows, ev.homeTeam, ev.awayTeam),
      ...[...ev.altSlots.values()].map((s) => s.line),
    ];
    if (lines.length === 0 && ev.propSlots.size === 0) continue;
    result.push({
      eventId,
      commenceTime: ev.commenceTime,
      homeTeam: ev.homeTeam,
      awayTeam: ev.awayTeam,
      lines,
      props: [...ev.propSlots.values()].map((s) => s.prop),
    });
  }
  return result;
}
