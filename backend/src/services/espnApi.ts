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

export interface ESPNGame {
  espnId: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: Date;
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
function nflYear(date: Date): number {
  const month = date.getMonth() + 1;
  return month <= 3 ? date.getFullYear() - 1 : date.getFullYear();
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
    games.push({
      espnId: String(event.id),
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      gameDate: new Date(event.date),
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
