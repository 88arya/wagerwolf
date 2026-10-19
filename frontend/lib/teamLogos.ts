const NFL_TEAMS: Array<{ names: string[]; abbr: string; color: string; altColor: string }> = [
  { names: ["arizona cardinals", "cardinals", "ari", "az"], abbr: "ari", color: "#97233F", altColor: "#FFB612" },
  { names: ["atlanta falcons", "falcons", "atl"], abbr: "atl", color: "#A71930", altColor: "#000000" },
  { names: ["baltimore ravens", "ravens", "bal"], abbr: "bal", color: "#241773", altColor: "#9E7C0C" },
  { names: ["buffalo bills", "bills", "buf"], abbr: "buf", color: "#00338D", altColor: "#C60C30" },
  { names: ["carolina panthers", "panthers", "car"], abbr: "car", color: "#0085CA", altColor: "#101820" },
  { names: ["chicago bears", "bears", "chi"], abbr: "chi", color: "#0B162A", altColor: "#C83803" },
  { names: ["cincinnati bengals", "bengals", "cin"], abbr: "cin", color: "#FB4F14", altColor: "#000000" },
  { names: ["cleveland browns", "browns", "cle"], abbr: "cle", color: "#311D00", altColor: "#FF3C00" },
  { names: ["dallas cowboys", "cowboys", "dal"], abbr: "dal", color: "#003594", altColor: "#869397" },
  { names: ["denver broncos", "broncos", "den"], abbr: "den", color: "#FB4F14", altColor: "#002244" },
  { names: ["detroit lions", "lions", "det"], abbr: "det", color: "#0076B6", altColor: "#B0B7BC" },
  { names: ["green bay packers", "packers", "gb", "gnb", "gbp", "green bay"], abbr: "gb", color: "#203731", altColor: "#FFB612" },
  { names: ["houston texans", "texans", "hou"], abbr: "hou", color: "#03202F", altColor: "#A71930" },
  { names: ["indianapolis colts", "colts", "ind"], abbr: "ind", color: "#002C5F", altColor: "#A2AAAD" },
  { names: ["jacksonville jaguars", "jaguars", "jax"], abbr: "jax", color: "#006778", altColor: "#9F792C" },
  { names: ["kansas city chiefs", "chiefs", "kc", "kan"], abbr: "kc", color: "#E31837", altColor: "#FFB81C" },
  { names: ["las vegas raiders", "raiders", "lv", "oak"], abbr: "lv", color: "#000000", altColor: "#A5ACAF" },
  { names: ["los angeles chargers", "chargers", "lac", "la chargers"], abbr: "lac", color: "#0080C6", altColor: "#FFC20E" },
  { names: ["los angeles rams", "rams", "lar", "la rams"], abbr: "lar", color: "#003594", altColor: "#FFA300" },
  { names: ["miami dolphins", "dolphins", "mia"], abbr: "mia", color: "#008E97", altColor: "#FC4C02" },
  { names: ["minnesota vikings", "vikings", "min"], abbr: "min", color: "#4F2683", altColor: "#FFC62F" },
  { names: ["new england patriots", "patriots", "ne", "nep", "new england"], abbr: "ne", color: "#002244", altColor: "#C60C30" },
  { names: ["new orleans saints", "saints", "no", "nos", "new orleans"], abbr: "no", color: "#9F8958", altColor: "#101820" },
  { names: ["new york giants", "giants", "nyg", "ny giants"], abbr: "nyg", color: "#0B2265", altColor: "#A71930" },
  { names: ["new york jets", "jets", "nyj", "ny jets"], abbr: "nyj", color: "#125740", altColor: "#000000" },
  { names: ["philadelphia eagles", "eagles", "phi"], abbr: "phi", color: "#004C54", altColor: "#A5ACAF" },
  { names: ["pittsburgh steelers", "steelers", "pit"], abbr: "pit", color: "#101820", altColor: "#FFB612" },
  { names: ["san francisco 49ers", "49ers", "sf", "sfo", "niners"], abbr: "sf", color: "#AA0000", altColor: "#B3995D" },
  { names: ["seattle seahawks", "seahawks", "sea"], abbr: "sea", color: "#002244", altColor: "#69BE28" },
  { names: ["tampa bay buccaneers", "buccaneers", "bucs", "tb"], abbr: "tb", color: "#D50A0A", altColor: "#FF7900" },
  { names: ["tennessee titans", "titans", "ten"], abbr: "ten", color: "#0C2340", altColor: "#4B92DB" },
  { names: ["washington commanders", "commanders", "wsh", "was", "washington"], abbr: "wsh", color: "#5A1414", altColor: "#FFB612" },
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

const LOGO_MATCHES_PRIMARY: Record<string, true> = {
  lar: true, // Rams mark is their primary navy - invisible on #003594
  nyg: true, // Giants "NY" is their primary navy - invisible on #0B2265
  nyj: true, // Jets mark is their primary green - invisible on #125740
};

export function getTeamBannerColor(teamName: string): string {
  if (!teamName) return "#1a1a2e";
  const lower = teamName.toLowerCase().trim();
  const team = NFL_TEAMS.find((t) => t.names.some((n) => lower === n || lower.endsWith(n) || lower.startsWith(n)));
  if (!team) return "#1a1a2e";
  return LOGO_MATCHES_PRIMARY[team.abbr] ? team.altColor : team.color;
}

export function getAllTeams() {
  return NFL_TEAMS.map((t) => ({
    name: t.names[0].replace(/\b\w/g, (c) => c.toUpperCase()),
    abbr: t.abbr,
    color: t.color,
    altColor: t.altColor,
    logoUrl: `${LOGO_BASE}/${t.abbr}.png`,
  }));
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
