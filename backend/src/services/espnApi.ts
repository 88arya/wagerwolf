const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

export function espnImageUrl(espnId: string): string {
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;
}

// Search ESPN by player name to get their permanent athlete ID
export async function searchEspnPlayerId(name: string): Promise<string | null> {
  try {
    const url = `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&sport=football&limit=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
    });
    if (!res.ok) { console.error(`ESPN search ${res.status} for "${name}"`); return null; }
    const data = await res.json();
    const nameLower = name.toLowerCase();
    for (const result of data.results ?? []) {
      for (const content of result.contents ?? []) {
        // contents[] items ARE the athlete objects directly (not content.data[])
        if (content.displayName?.toLowerCase() === nameLower) {
          // UID format: "s:20~l:28~a:3116406" — numeric part after "a:" is the ESPN athlete ID
          const fromUid = (content.uid as string | undefined)
            ?.split("~").find((p: string) => p.startsWith("a:"))?.slice(2);
          if (fromUid) return fromUid;
          // fallback: extract ID from the headshot URL
          const imageHref = content.image?.default as string | undefined;
          const fromImage = imageHref?.match(/\/(\d+)\.png/)?.[1];
          if (fromImage) return fromImage;
        }
      }
    }
    console.error(`ESPN search: no match found for "${name}"`);
    return null;
  } catch (e) {
    console.error(`ESPN search error for "${name}":`, e);
    return null;
  }
}

// Jersey number lives on the "core" ESPN API, not the "site" API used elsewhere in this file
const CORE = "https://sports.core.api.espn.com/v3/sports/football/nfl";

export async function getAthleteJersey(espnId: string): Promise<string | null> {
  try {
    const res = await fetch(`${CORE}/athletes/${espnId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.jersey ?? null;
  } catch (e) {
    console.error(`ESPN jersey lookup error for athlete ${espnId}:`, e);
    return null;
  }
}

export interface ESPNGame {
  espnId: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: Date;
  homeScore: number | null;
  awayScore: number | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINAL" | "CANCELLED";
  statusDetail: string;
  /** venue.indoor — stable, present on every game regardless of kickoff distance. */
  indoor: boolean | null;
  /** Overall W-L(-T) from competitors[].records where type === "total", e.g.
   *  "5-3". Comes back on the same scoreboard call as everything else, so it
   *  costs no extra request. Null when ESPN has not published a record yet. */
  homeRecord: string | null;
  awayRecord: string | null;
  /** weather.displayValue, e.g. "Mostly cloudy w/ t-storms". ESPN only populates
   *  weather inside 10 days of kickoff — AccuWeather's forecast horizon, and a
   *  sharp boundary, not a fuzzy one — so this is null for anything further
   *  ahead. It is also dropped again once the game goes FINAL, so whatever is
   *  stored at kickoff is the last value ESPN will ever hand back. */
  weather: string | null;
  /** weather.temperature, °F. Both fields live on the same optional `weather`
   *  object, so this is null exactly when `weather` is — never one without the
   *  other. Present for indoor venues too (it's the city forecast, not the
   *  stadium), which is why the UI gates on `indoor === false`, not on this. */
  weatherTemp: number | null;
}

export interface PlayerGameStats {
  passingYards: number;
  passingTouchdowns: number;
  passingCompletions: number;
  passingAttempts: number;
  rushingYards: number;
  rushingTouchdowns: number;
  rushingAttempts: number;
  receivingYards: number;
  receivingTouchdowns: number;
  receptions: number;
  touchdowns: number;
  team: string;
}

// NFL seasons span two calendar years — Jan/Feb/Mar belong to the previous season
export function nflYear(date: Date): number {
  const month = date.getMonth() + 1;
  return month <= 3 ? date.getFullYear() - 1 : date.getFullYear();
}

export async function getNFLWeekDates(weekNumber: number, year: number): Promise<{ startDate: Date; endDate: Date } | null> {
  const url = `${SITE}/scoreboard?dates=${year}&seasontype=2&week=${weekNumber}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const events: any[] = data.events ?? [];
  if (!events.length) return null;
  const times = events.map((e: any) => new Date(e.date).getTime());
  const startDate = new Date(Math.min(...times));
  const endDate = new Date(Math.max(...times));
  endDate.setHours(endDate.getHours() + 18); // buffer after last kickoff
  return { startDate, endDate };
}

export async function getNFLWeekGames(weekStartDate: Date, weekNumber: number): Promise<ESPNGame[]> {
  const year = nflYear(weekStartDate);
  const url = `${SITE}/scoreboard?dates=${year}&seasontype=2&week=${weekNumber}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  const data = await res.json();

  const games: ESPNGame[] = [];
  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c: any) => c.homeAway === "home");
    const away = comp.competitors?.find((c: any) => c.homeAway === "away");
    if (!home || !away) continue;

    const statusName: string = event.status?.type?.name ?? "";
    const completed: boolean = event.status?.type?.completed ?? false;
    let status: ESPNGame["status"] = "SCHEDULED";
    if (completed || statusName === "STATUS_FINAL") status = "FINAL";
    else if (statusName === "STATUS_IN_PROGRESS") status = "IN_PROGRESS";
    else if (statusName === "STATUS_CANCELLED" || statusName === "STATUS_POSTPONED") status = "CANCELLED";

    // Guard on NaN, not truthiness: a shutout comes back as "0", and `0 || null`
    // would record it as "no score" rather than zero — which then feeds spread
    // and total resolution.
    const parseScore = (raw: unknown): number | null => {
      if (raw == null) return null;
      const n = parseInt(String(raw), 10);
      return Number.isNaN(n) ? null : n;
    };
    const homeScore = parseScore(home.score);
    const awayScore = parseScore(away.score);
    const statusDetail: string = event.status?.type?.shortDetail ?? "";

    // ESPN ships three records per competitor (overall / home / road). Match on
    // type === "total" rather than taking [0]: the order is not contractual,
    // and "Home"/"Road" would otherwise silently render as the overall record.
    const overallRecord = (c: any): string | null =>
      c.records?.find((r: any) => r.type === "total")?.summary ?? null;
    const homeRecord = overallRecord(home);
    const awayRecord = overallRecord(away);

    const indoor: boolean | null = typeof comp.venue?.indoor === "boolean" ? comp.venue.indoor : null;
    const weather: string | null = event.weather?.displayValue ?? null;
    const weatherTemp: number | null = typeof event.weather?.temperature === "number"
      ? event.weather.temperature
      : null;

    games.push({
      espnId: String(event.id),
      homeTeam: home.team.abbreviation,
      awayTeam: away.team.abbreviation,
      gameDate: new Date(event.date),
      homeScore,
      awayScore,
      status,
      statusDetail,
      indoor,
      weather,
      weatherTemp,
      homeRecord,
      awayRecord,
    });
  }
  return games;
}

export async function getGameStats(espnId: string): Promise<Map<string, PlayerGameStats>> {
  const url = `${SITE}/summary?event=${espnId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN summary ${res.status}`);
  const data = await res.json();

  const stats = new Map<string, PlayerGameStats>();

  for (const teamData of data.boxscore?.players ?? []) {
    const team: string = teamData.team?.abbreviation ?? "";

    for (const category of teamData.statistics ?? []) {
      const catName: string = category.name;
      const keys: string[] = category.keys ?? [];

      const idx = (key: string) => keys.indexOf(key);

      for (const entry of category.athletes ?? []) {
        const name: string = entry.athlete?.displayName;
        if (!name) continue;
        const vals: string[] = entry.stats ?? [];
        const get = (key: string) => parseFloat(vals[idx(key)] ?? "0") || 0;

        if (!stats.has(name)) {
          stats.set(name, {
            passingYards: 0, passingTouchdowns: 0, passingCompletions: 0, passingAttempts: 0,
            rushingYards: 0, rushingTouchdowns: 0, rushingAttempts: 0,
            receivingYards: 0, receivingTouchdowns: 0, receptions: 0, touchdowns: 0, team,
          });
        }
        const s = stats.get(name)!;

        if (catName === "passing") {
          s.passingYards += get("passingYards");
          s.passingTouchdowns += get("passingTouchdowns");
          s.passingCompletions += get("completions");
          s.passingAttempts += get("attempts");
          s.touchdowns += get("passingTouchdowns");
        } else if (catName === "rushing") {
          s.rushingYards += get("rushingYards");
          s.rushingTouchdowns += get("rushingTouchdowns");
          s.rushingAttempts += get("carries");
          s.touchdowns += get("rushingTouchdowns");
        } else if (catName === "receiving") {
          s.receivingYards += get("receivingYards");
          s.receivingTouchdowns += get("receivingTouchdowns");
          s.receptions += get("receptions");
          s.touchdowns += get("receivingTouchdowns");
        }
      }
    }
  }

  return stats;
}
