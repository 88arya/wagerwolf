const BASE = "https://api.the-odds-api.com/v4";

const MARKETS = [
  "player_pass_yds",
  "player_pass_tds",
  "player_rush_yds",
  "player_reception_yds",
  "player_receptions",
].join(",");

function key(): string {
  const k = process.env.ODDS_API_KEY;
  if (!k) throw new Error("ODDS_API_KEY is not configured");
  return k;
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
      `?apiKey=${key()}&regions=us&markets=${MARKETS}&oddsFormat=decimal&bookmakers=draftkings`
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
