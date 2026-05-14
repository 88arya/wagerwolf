const BASE = "https://api.sportsgameodds.com/v2";

const PROP_STAT_IDS = new Set([
  "passing_yards",
  "passing_touchdowns",
  "passing_completions",
  "passing_attempts",
  "passing_interceptions",
  "passing_longest",
  "rushing_yards",
  "rushing_touchdowns",
  "rushing_attempts",
  "rushing_longest",
  "receiving_yards",
  "receiving_touchdowns",
  "receiving_longest",
  "receiving_targets",
  "receptions",
  "sacks",
  "tackles_assists",
  "interceptions",
  "field_goals_made",
  "field_goal_longest",
  "kicking_points",
  "extra_points_made",
]);

function key(): string {
  const k = process.env.SPORTSGAMEODDS_API_KEY;
  if (!k) throw new Error("SPORTSGAMEODDS_API_KEY is not configured");
  return k;
}

function authHeaders() {
  return { "x-api-key": key() };
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

export interface NFLGameData {
  eventId: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  lines: RawGameLine[];
  props: RawProp[];
}

// oddID format: {statID}-{playerEntityID}-{periodID}-{betTypeID}-{sideID}
function parsePropOddId(oddId: string): { statId: string; playerEntityId: string; sideId: string } | null {
  const periods = ["game", "1h", "2h", "1q", "2q", "3q", "4q"];
  for (const period of periods) {
    const sep = `-${period}-`;
    const idx = oddId.indexOf(sep);
    if (idx === -1) continue;
    const beforePeriod = oddId.substring(0, idx);
    const afterPeriod = oddId.substring(idx + sep.length);
    const firstDash = beforePeriod.indexOf("-");
    if (firstDash === -1) continue;
    const statId = beforePeriod.substring(0, firstDash);
    const playerEntityId = beforePeriod.substring(firstDash + 1);
    const parts = afterPeriod.split("-");
    const sideId = parts[parts.length - 1];
    return { statId, playerEntityId, sideId };
  }
  return null;
}

function extractGameLines(odds: Record<string, any>, homeTeam: string, awayTeam: string): RawGameLine[] {
  const lines: RawGameLine[] = [];

  function dk(oddKey: string) {
    return odds[oddKey]?.byBookmaker?.draftkings;
  }

  const mlHome = dk("points-home-game-ml-home");
  if (mlHome?.available && mlHome.odds) {
    lines.push({ market: "MONEYLINE_HOME", label: `${homeTeam} ML`, odds: parseInt(mlHome.odds, 10), line: null });
  }

  const mlAway = dk("points-away-game-ml-away");
  if (mlAway?.available && mlAway.odds) {
    lines.push({ market: "MONEYLINE_AWAY", label: `${awayTeam} ML`, odds: parseInt(mlAway.odds, 10), line: null });
  }

  const spHome = dk("points-home-game-sp-home");
  if (spHome?.available && spHome.spread && spHome.odds) {
    const val = parseFloat(spHome.spread);
    lines.push({ market: "SPREAD_HOME", label: `${homeTeam} ${val > 0 ? "+" : ""}${val}`, odds: parseInt(spHome.odds, 10), line: val });
  }

  const spAway = dk("points-away-game-sp-away");
  if (spAway?.available && spAway.spread && spAway.odds) {
    const val = parseFloat(spAway.spread);
    lines.push({ market: "SPREAD_AWAY", label: `${awayTeam} ${val > 0 ? "+" : ""}${val}`, odds: parseInt(spAway.odds, 10), line: val });
  }

  const ouOver = dk("points-all-game-ou-over");
  if (ouOver?.available && ouOver.overUnder && ouOver.odds) {
    lines.push({ market: "TOTAL_OVER", label: `Over ${ouOver.overUnder}`, odds: parseInt(ouOver.odds, 10), line: parseFloat(ouOver.overUnder) });
  }

  const ouUnder = dk("points-all-game-ou-under");
  if (ouUnder?.available && ouUnder.overUnder && ouUnder.odds) {
    lines.push({ market: "TOTAL_UNDER", label: `Under ${ouUnder.overUnder}`, odds: parseInt(ouUnder.odds, 10), line: parseFloat(ouUnder.overUnder) });
  }

  return lines;
}

function extractPlayerProps(odds: Record<string, any>, players: Record<string, any>): RawProp[] {
  const props: RawProp[] = [];
  const seen = new Set<string>();

  for (const [oddId, oddData] of Object.entries(odds)) {
    const parsed = parsePropOddId(oddId);
    if (!parsed) continue;
    const { statId, playerEntityId, sideId } = parsed;
    if (!PROP_STAT_IDS.has(statId)) continue;
    if (sideId !== "over") continue;

    const dk = (oddData as any).byBookmaker?.draftkings;
    if (!dk?.available || !dk?.overUnder) continue;

    const dedupeKey = `${statId}-${playerEntityId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const playerName = players[playerEntityId]?.name
      ?? playerEntityId.replace(/_\d+$/, "").replace(/_/g, " ");

    props.push({ playerName, market: statId, line: parseFloat(dk.overUnder) });
  }

  return props;
}

// Single call — fetches all NFL games with lines and props in one request
export async function getNFLWeekData(): Promise<NFLGameData[]> {
  const res = await fetch(
    `${BASE}/events?leagueID=NFL&finalized=false&oddsAvailable=true&limit=50`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`SportsGameOdds API ${res.status}: ${await res.text()}`);
  const { data: events } = await res.json();

  return (events ?? []).map((e: any) => {
    const odds: Record<string, any> = e.odds ?? {};
    const players: Record<string, any> = e.players ?? {};
    const homeTeam = e.teams?.home?.names?.long ?? "";
    const awayTeam = e.teams?.away?.names?.long ?? "";

    return {
      eventId: e.eventID,
      commenceTime: e.status?.startsAt ?? "",
      homeTeam,
      awayTeam,
      lines: extractGameLines(odds, homeTeam, awayTeam),
      props: extractPlayerProps(odds, players),
    };
  });
}
