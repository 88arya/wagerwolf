// Season named by its kickoff year; Jan/Feb belong to the previous year.
// Sept 1 UTC is the boundary so server and client always agree.
export function seasonYear(at: Date): number {
  const year = at.getUTCFullYear();
  // getUTCMonth is 0-indexed, so 8 is September.
  return at.getUTCMonth() >= 8 ? year : year - 1;
}

// Seasons started since the account was created, counting the current one.
export function seasonsPlayed(createdAt: Date | string, now: Date = new Date()): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;

  const createdSeason = seasonYear(created);
  const inSeasonAtSignup = created.getUTCMonth() >= 8 || created.getUTCMonth() <= 1;
  const firstSeason = inSeasonAtSignup ? createdSeason : createdSeason + 1;

  const currentSeason = seasonYear(now);
  return Math.max(0, currentSeason - firstSeason + 1);
}

export function nextSeasonYear(createdAt: Date | string, now: Date = new Date()): number {
  const played = seasonsPlayed(createdAt, now);
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const inSeasonAtSignup = created.getUTCMonth() >= 8 || created.getUTCMonth() <= 1;
  const firstSeason = inSeasonAtSignup ? seasonYear(created) : seasonYear(created) + 1;
  return firstSeason + played;
}

// Whole years since signup (UTC). Shown as "Experience".
export function yearsSinceJoin(createdAt: Date | string, now: Date = new Date()): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;

  let years = now.getUTCFullYear() - created.getUTCFullYear();
  const month = now.getUTCMonth() - created.getUTCMonth();
  // The anniversary has not come round yet this calendar year.
  if (month < 0 || (month === 0 && now.getUTCDate() < created.getUTCDate())) years -= 1;
  return Math.max(0, years);
}