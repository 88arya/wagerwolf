const NFL_TEAMS: Array<{ names: string[]; abbr: string }> = [
  { names: ["arizona cardinals", "cardinals", "ari", "az"], abbr: "ari" },
  { names: ["atlanta falcons", "falcons", "atl"], abbr: "atl" },
  { names: ["baltimore ravens", "ravens", "bal"], abbr: "bal" },
  { names: ["buffalo bills", "bills", "buf"], abbr: "buf" },
  { names: ["carolina panthers", "panthers", "car"], abbr: "car" },
  { names: ["chicago bears", "bears", "chi"], abbr: "chi" },
  { names: ["cincinnati bengals", "bengals", "cin"], abbr: "cin" },
  { names: ["cleveland browns", "browns", "cle"], abbr: "cle" },
  { names: ["dallas cowboys", "cowboys", "dal"], abbr: "dal" },
  { names: ["denver broncos", "broncos", "den"], abbr: "den" },
  { names: ["detroit lions", "lions", "det"], abbr: "det" },
  { names: ["green bay packers", "packers", "gb", "gnb", "gbp", "green bay"], abbr: "gb" },
  { names: ["houston texans", "texans", "hou"], abbr: "hou" },
  { names: ["indianapolis colts", "colts", "ind"], abbr: "ind" },
  { names: ["jacksonville jaguars", "jaguars", "jax"], abbr: "jax" },
  { names: ["kansas city chiefs", "chiefs", "kc", "kan"], abbr: "kc" },
  { names: ["las vegas raiders", "raiders", "lv", "oak"], abbr: "lv" },
  { names: ["los angeles chargers", "chargers", "lac", "la chargers"], abbr: "lac" },
  { names: ["los angeles rams", "rams", "lar", "la rams"], abbr: "lar" },
  { names: ["miami dolphins", "dolphins", "mia"], abbr: "mia" },
  { names: ["minnesota vikings", "vikings", "min"], abbr: "min" },
  { names: ["new england patriots", "patriots", "ne", "nep", "new england"], abbr: "ne" },
  { names: ["new orleans saints", "saints", "no", "nos", "new orleans"], abbr: "no" },
  { names: ["new york giants", "giants", "nyg", "ny giants"], abbr: "nyg" },
  { names: ["new york jets", "jets", "nyj", "ny jets"], abbr: "nyj" },
  { names: ["philadelphia eagles", "eagles", "phi"], abbr: "phi" },
  { names: ["pittsburgh steelers", "steelers", "pit"], abbr: "pit" },
  { names: ["san francisco 49ers", "49ers", "sf", "sfo", "niners"], abbr: "sf" },
  { names: ["seattle seahawks", "seahawks", "sea"], abbr: "sea" },
  { names: ["tampa bay buccaneers", "buccaneers", "bucs", "tb"], abbr: "tb" },
  { names: ["tennessee titans", "titans", "ten"], abbr: "ten" },
  { names: ["washington commanders", "commanders", "wsh", "was", "washington"], abbr: "wsh" },
];

const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500";

export function getTeamFullName(teamName: string): string {
  if (!teamName) return teamName;
  const lower = teamName.toLowerCase().trim();
  const team = NFL_TEAMS.find((t) =>
    t.names.some((n) => lower === n || lower.endsWith(n) || lower.startsWith(n))
  );
  if (!team) return teamName;
  return team.names[0].replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getTeamDisplayName(teamName: string): string {
  if (!teamName) return teamName;
  const lower = teamName.toLowerCase().trim();
  const team = NFL_TEAMS.find((t) =>
    t.names.some((n) => lower === n || lower.endsWith(n) || lower.startsWith(n))
  );
  if (!team) return teamName.toUpperCase();
  const nickname = team.names[1];
  return `${teamName.toUpperCase()} ${nickname.charAt(0).toUpperCase()}${nickname.slice(1)}`;
}

export function getTeamLogoUrl(teamName: string): string | null {
  if (!teamName) return null;
  const lower = teamName.toLowerCase().trim();
  const team = NFL_TEAMS.find((t) =>
    t.names.some((n) => lower === n || lower.endsWith(n) || lower.startsWith(n))
  );
  if (!team) return null;
  return `${LOGO_BASE}/${team.abbr}.png`;
}
