/**
 * The age gate.
 *
 * Wagerwolf plays with fake money, so no statutory gambling age applies to it
 * anywhere. This gate exists for three other reasons, and it is worth being
 * clear which: app store review and ad networks both ask; the product
 * deliberately looks and reads like a sportsbook, which `app/responsible-
 * gaming` says in its own header and which is enough to pull someone with a
 * gambling problem; and "we never checked" is a bad answer to a parent.
 *
 * ONE GLOBAL NUMBER, deliberately. 18 is the floor across most of the country
 * list in `lib/geo.ts` — UK, Australia, Ireland — and clears the app stores'
 * simulated-gambling threshold. It is not 19 (Ontario and most of Canada, but
 * not Alberta, Manitoba or Quebec) and not 21 (US real-money sportsbooks),
 * because picking either would fit one jurisdiction and misfit the rest.
 *
 * It is NOT driven off `User.country`/`region`. Those are self-reported,
 * optional, and editable in My Account at any time, so a per-jurisdiction gate
 * built on them would be more code enforcing nothing extra.
 *
 * WHAT THIS IS WORTH: it is self-attested and unverified. Anyone willing to
 * type a false date gets through, and no amount of client validation changes
 * that. What it buys is that the question was asked and the answer recorded —
 * which is the whole of what a self-attested gate ever buys. Do not mistake it
 * for verification.
 */

export const MIN_AGE = 18;

/** ISO calendar day, "YYYY-MM-DD". The shape the `date` column stores. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whole years elapsed between two calendar days.
 *
 * Done on the date parts rather than by dividing a millisecond difference:
 * years are not a fixed number of milliseconds, and the naive version is wrong
 * for anyone whose span crosses the wrong number of leap days. Subtract the
 * years, then take one back if the birthday has not come round yet this year.
 */
export function ageOn(dateOfBirth: string, on: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  // UTC throughout, so the server's own zone can never change the answer.
  let age = on.getUTCFullYear() - y;
  const monthDiff = on.getUTCMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < d)) age -= 1;
  return age;
}

export type DobCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Validate a client-supplied birthdate and decide whether it clears the gate.
 *
 * Returns the normalised string on success so the caller writes exactly what
 * was checked, rather than re-deriving it and risking a mismatch.
 */
export function checkDateOfBirth(input: unknown, now: Date = new Date()): DobCheck {
  if (typeof input !== "string" || !ISO_DAY.test(input.trim())) {
    return { ok: false, error: "Date of birth must be a calendar date" };
  }
  const value = input.trim();

  // Reject dates the calendar does not have — "2001-02-30" matches the regex.
  // Round-tripping through UTC catches the rollover Date does silently.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "That date doesn't exist" };
  }

  if (parsed.getTime() > now.getTime()) {
    return { ok: false, error: "Date of birth can't be in the future" };
  }

  const age = ageOn(value, now);

  // A sanity ceiling. Not about age at all — it catches the year typed wrong,
  // which is the single most common way this field goes in bad.
  if (age > 120) {
    return { ok: false, error: "Please check the year" };
  }

  if (age < MIN_AGE) {
    return { ok: false, error: `You must be ${MIN_AGE} or over to use Wagerwolf` };
  }

  return { ok: true, value };
}
