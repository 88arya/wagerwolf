const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

const NFL_TEAM_ABBRS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE",
  "DAL","DEN","DET","GB","HOU","IND","JAX","KC",
  "LAC","LAR","LV","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WSH",
];

export async function buildEspnRosterMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const abbr of NFL_TEAM_ABBRS) {
    try {
      const res = await fetch(`${SITE}/teams/${abbr}/roster`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const group of data.athletes ?? []) {
        for (const athlete of group.items ?? []) {
          if (athlete.id && athlete.displayName) {
            map.set(
              (athlete.displayName as string).toLowerCase(),
              `https://a.espncdn.com/i/headshots/nfl/players/full/${athlete.id}.png`
            );
          }
        }
      }
    } catch { /* skip on error */ }
  }
  return map;
}

export interface ESPNGame {
  espnId: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: Date;
}

export interface PlayerGameStats {
  passingYards: number;
  rushingYards: number;
  receivingYards: number;
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
          stats.set(name, { passingYards: 0, rushingYards: 0, receivingYards: 0, receptions: 0, touchdowns: 0, team });
        }
        const s = stats.get(name)!;

        if (catName === "passing") {
          s.passingYards += get("passingYards");
          s.touchdowns += get("passingTouchdowns");
        } else if (catName === "rushing") {
          s.rushingYards += get("rushingYards");
          s.touchdowns += get("rushingTouchdowns");
        } else if (catName === "receiving") {
          s.receivingYards += get("receivingYards");
          s.receptions += get("receptions");
          s.touchdowns += get("receivingTouchdowns");
        }
      }
    }
  }

  return stats;
}
