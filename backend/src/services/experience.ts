/**
 * How long an account has been around, in two different units.
 *
 * `yearsSinceJoin` is TENURE — whole calendar years since the account was
 * created, which is what the account page shows as "Experience". `seasonsPlayed`
 * is NFL SEASONS, a different count for a different question, kept because the
 * season a user is on is a real thing the app knows and may want to say.
 *
 * They disagree, and deliberately so. An account created in October 2024 has
 * played two seasons by August 2026 but has only been here for one year and ten
 * months. The page says "1 year" because that is what "experience" was asked to
 * mean: a year on the anniversary, not a season at kickoff.
 *
 * Both are **derived from `User.createdAt` — never stored, never accepted from
 * a client**. It was briefly a self-reported `yearsExperience` column, and a
 * number a user can type is a number a user can lie about.
 *
 * It no longer gates anything. League access is a two-way choice between a
 * beginner and a pro league (services/leagueLevel.ts), not a tenure check —
 * on a young platform every account is a rookie, so gating on this would have
 * made the harder tier unreachable for everyone. It stays because "seasons
 * played" is a real thing to show someone about their own account.
 */

/**
 * The NFL season a moment belongs to, named by the calendar year it kicks off
 * in. A season runs September → February, so January and February belong to
 * the *previous* year's season.
 *
 * September 1 rather than the real kickoff (the first Thursday after Labor
 * Day) because the exact date moves by up to a week each year and nothing here
 * is decided by that week — a boundary that is stable and explainable beats
 * one that is precise.
 *
 * UTC throughout: the server and the client must agree on which season it is,
 * and a local-time boundary would put them in different seasons for a few
 * hours every September.
 */
export function seasonYear(at: Date): number {
  const year = at.getUTCFullYear();
  // getUTCMonth is 0-indexed, so 8 is September.
  return at.getUTCMonth() >= 8 ? year : year - 1;
}

/**
 * Seasons this account has taken part in, counting the one currently under way.
 *
 * The rule is "how many seasons have started since you got here":
 *
 *   · created *during* a season (Sept–Feb) → that season is your first
 *   · created in the offseason (Mar–Aug)   → the next one is your first
 *   · a season only counts once it has actually kicked off
 *
 * So an account created in June 2026 is on 0 until September 2026, and one
 * created in October 2024 is on 2 by August 2026 (the 2024 and 2025 seasons).
 * Never negative — an account created moments ago sits at 0, not −1.
 */
export function seasonsPlayed(createdAt: Date | string, now: Date = new Date()): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;

  const createdSeason = seasonYear(created);
  // In the offseason, seasonYear points at the season that has already
  // finished, so the first season this account can play is the next one.
  const inSeasonAtSignup = created.getUTCMonth() >= 8 || created.getUTCMonth() <= 1;
  const firstSeason = inSeasonAtSignup ? createdSeason : createdSeason + 1;

  const currentSeason = seasonYear(now);
  return Math.max(0, currentSeason - firstSeason + 1);
}

/**
 * The season this account's next one will be, named by its kickoff year.
 *
 * A year rather than a date on purpose: the September 1 boundary is an
 * approximation of a kickoff that actually moves by up to a week, so quoting a
 * date to a user promises a precision this does not have. "The 2026–27 season"
 * is both what the UI should say and what is actually true.
 */
export function nextSeasonYear(createdAt: Date | string, now: Date = new Date()): number {
  const played = seasonsPlayed(createdAt, now);
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const inSeasonAtSignup = created.getUTCMonth() >= 8 || created.getUTCMonth() <= 1;
  const firstSeason = inSeasonAtSignup ? seasonYear(created) : seasonYear(created) + 1;
  return firstSeason + played;
}

/**
 * Whole years since the account was created. 0 until the first anniversary,
 * 1 on the day it lands, and one more every year after.
 *
 * This is what the account page means by "Experience". It counts anniversaries
 * rather than seasons, so it never gets ahead of the calendar the way
 * `seasonsPlayed` does — an account two weeks old reads 0 years even if a
 * season kicked off in between.
 *
 * UTC throughout, matching seasonYear above: the anniversary should not land on
 * a different date for the server than for the user.
 *
 * A 29 February account rolls over on 1 March in common years, which is the
 * conventional answer and the one that never skips a year.
 */
export function yearsSinceJoin(createdAt: Date | string, now: Date = new Date()): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;

  let years = now.getUTCFullYear() - created.getUTCFullYear();
  const month = now.getUTCMonth() - created.getUTCMonth();
  // The anniversary has not come round yet this calendar year.
  if (month < 0 || (month === 0 && now.getUTCDate() < created.getUTCDate())) years -= 1;
  return Math.max(0, years);
}

/** 2026 → "2026–27". An NFL season spans two calendar years, so it is named by both. */
export function seasonLabel(year: number): string {
  return `${year}\u2013${String(year + 1).slice(-2)}`;
}
