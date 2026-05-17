const LOCATIONS = [
  "Arizona", "Atlanta", "Baltimore", "Buffalo", "Carolina",
  "Chicago", "Cincinnati", "Cleveland", "Dallas", "Denver",
  "Detroit", "Green Bay", "Houston", "Indianapolis", "Jacksonville",
  "Kansas City", "Las Vegas", "Los Angeles", "Miami", "Minnesota",
  "New England", "New Orleans", "New York", "Philadelphia", "Pittsburgh",
  "San Francisco", "Seattle", "Tampa Bay", "Tennessee", "Washington",
];

const NICKNAMES = [
  "Cardinals", "Falcons", "Ravens", "Bills", "Panthers",
  "Bears", "Bengals", "Browns", "Cowboys", "Broncos",
  "Lions", "Packers", "Texans", "Colts", "Jaguars",
  "Chiefs", "Raiders", "Chargers", "Rams", "Dolphins",
  "Vikings", "Patriots", "Saints", "Giants", "Jets",
  "Eagles", "Steelers", "49ers", "Seahawks", "Buccaneers",
  "Titans", "Commanders",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateLeagueName(): string {
  const year = new Date().getFullYear();
  return `${pick(LOCATIONS)} ${pick(NICKNAMES)} ${year} League`;
}
