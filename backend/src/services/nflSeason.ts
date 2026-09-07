/**
 * The last NFL week a league season may occupy.
 *
 * This was `const MAX_NFL_WEEK = 17` written out in four backend files and once
 * more in the frontend settings page — five copies of a number that decides
 * whether a league can be created, how many regular-season weeks it gets, and
 * whether the scheduler will resolve a week at all. Five copies of a rule is
 * four chances for them to disagree.
 *
 * **17 is a deliberate cap on a LEAGUE season, not the NFL's own length.** The
 * NFL regular season has been 18 weeks since 2021. A league that ran to 18
 * would end on the final Sunday with no slack for a resolve to be late or a
 * game to be flexed, so the last week is left out on purpose. Raising this to
 * 18 is a product decision about that slack, not a bug fix.
 */
export const MAX_NFL_WEEK = 17;
