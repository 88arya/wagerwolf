/**
 * Shared by the generator and by every route that accepts a typed abbreviation,
 * so "exactly three letters" is stated once.
 *
 * THREE, not two-or-three. The tag is rendered on helmets and scoreboards
 * beside everybody else's, and a two-letter one reads as a different kind of
 * thing next to a column of three — so the account-level default now matches
 * what components/LeagueProfileModal has always required of the per-league one.
 *
 * Letters only. Display names may contain digits, but the tag is a monogram
 * rather than a name: digits are dropped on the way through
 * `generateAbbreviation` rather than carried into it.
 */
export const ABBREV_LENGTH = 3;

export const ABBREV_ERROR = `Abbreviation must be exactly ${ABBREV_LENGTH} letters`;

const ABBREV_RE = new RegExp(`^[A-Z]{${ABBREV_LENGTH}}$`);

/** Accept or refuse. Returns the uppercased value to store on success. */
export function validateAbbreviation(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: ABBREV_ERROR };
  const a = value.trim().toUpperCase();
  if (!ABBREV_RE.test(a)) return { ok: false, error: ABBREV_ERROR };
  return { ok: true, value: a };
}
