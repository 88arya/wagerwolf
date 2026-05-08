const BASE = "https://api.the-odds-api.com/v4";

const PROP_MARKETS = [
  "player_pass_yds",
  "player_pass_tds",
  "player_rush_yds",
  "player_reception_yds",
  "player_receptions",
].join(",");

const LINE_MARKETS = "h2h,spreads,totals";

function key(): string {
  const k = process.env.ODDS_API_KEY;
  if (!k) throw new Error("ODDS_API_KEY is not configured");
  return k;
}

// Convert decimal odds from API to American
function toAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

export interface RawProp {
  playerName: string;
  market: string;
  line: number;
}

export interface RawGameLine {
  market: string;   // MONEYLINE_HOME | MONEYLINE_AWAY | SPREAD_HOME | SPREAD_AWAY | TOTAL_OVER | TOTAL_UNDER
  label: string;
  odds: number;     // American
  line: number | null;
}

export async function getNFLEvents(): Promise<OddsEvent[]> {
  const res = await fetch(
    `${BASE}/sports/americanfootball_nfl/events?apiKey=${key()}`
  );
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getPlayerProps(eventId: string): Promise<RawProp[]> {
  const res = await fetch(
    `${BASE}/sports/americanfootball_nfl/events/${eventId}/odds` +
      `?apiKey=${key()}&regions=us&markets=${PROP_MARKETS}&oddsFormat=decimal&bookmakers=draftkings`
  );
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const props: RawProp[] = [];
  const bookmaker = data.bookmakers?.[0];
  if (!bookmaker) return props;

  for (const market of bookmaker.markets ?? []) {
    const seen = new Map<string, number>();
    for (const outcome of market.outcomes ?? []) {
      if (outcome.name === "Over" && outcome.point != null) {
        seen.set(outcome.description, outcome.point);
      }
    }
    for (const [playerName, line] of seen) {
      props.push({ playerName, market: market.key, line });
    }
  }

  return props;
}

export async function getGameLines(eventId: string, homeTeam: string, awayTeam: string): Promise<RawGameLine[]> {
  const res = await fetch(
    `${BASE}/sports/americanfootball_nfl/events/${eventId}/odds` +
      `?apiKey=${key()}&regions=us&markets=${LINE_MARKETS}&oddsFormat=decimal&bookmakers=draftkings`
  );
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const lines: RawGameLine[] = [];
  const bookmaker = data.bookmakers?.[0];
  if (!bookmaker) return lines;

  for (const market of bookmaker.markets ?? []) {
    if (market.key === "h2h") {
      for (const outcome of market.outcomes ?? []) {
        const isHome = outcome.name === homeTeam;
        lines.push({
          market: isHome ? "MONEYLINE_HOME" : "MONEYLINE_AWAY",
          label: `${outcome.name} ML`,
          odds: toAmerican(outcome.price),
          line: null,
        });
      }
    } else if (market.key === "spreads") {
      for (const outcome of market.outcomes ?? []) {
        const isHome = outcome.name === homeTeam;
        lines.push({
          market: isHome ? "SPREAD_HOME" : "SPREAD_AWAY",
          label: `${outcome.name} ${outcome.point > 0 ? "+" : ""}${outcome.point}`,
          odds: toAmerican(outcome.price),
          line: outcome.point,
        });
      }
    } else if (market.key === "totals") {
      for (const outcome of market.outcomes ?? []) {
        const isOver = outcome.name === "Over";
        lines.push({
          market: isOver ? "TOTAL_OVER" : "TOTAL_UNDER",
          label: `${outcome.name} ${outcome.point}`,
          odds: toAmerican(outcome.price),
          line: outcome.point,
        });
      }
    }
  }

  return lines;
}
