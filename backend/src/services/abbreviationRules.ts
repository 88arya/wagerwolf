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
