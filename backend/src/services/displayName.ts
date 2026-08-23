/**
 * The display name rule, in one place.
 *
 * A display name is the only thing other players ever see, so it has to read as
 * a name: at least 3 characters, letters/digits/spaces only. The frontend drops
 * illegal characters as you type (app/settings/page.tsx), but that is a
 * courtesy, not the rule — the rule is here, because the browser is not the
 * only thing that can send a PATCH.
 *
 * TWO ENTRY POINTS, and the difference matters:
 *
 * - `validateDisplayName` REJECTS. Used on the routes a person edits through.
 *   Silently cleaning what someone typed would save a name they did not choose
 *   and never tell them.
 * - `sanitizeDisplayName` REPAIRS. Used on Google sign-up, where the name comes
 *   from the provider and nobody typed anything. Rejecting there would lock out
 *   an account whose Google profile happens to read "Jo" or "Renée", which is a
 *   sign-in failure caused by a display-name rule — the wrong place to enforce
 *   it entirely.
 */

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 32;

export const DISPLAY_NAME_ERROR =
  `Display name must be at least ${DISPLAY_NAME_MIN} characters, using letters, numbers and spaces only`;

/**
 * Fold accented letters onto their ASCII base — José → Jose, Müller → Muller.
 *
 * Runs BEFORE the character filter, and that order is the whole point: strip
 * first and "José" becomes "Jos", losing a letter of somebody's name to a rule
 * about punctuation. NFD splits the é into an e plus a combining accent, and
 * only the accent is in the Mn ("mark, nonspacing") category the filter removes.
 */
function foldAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Mn}/gu, "");
}

/** Fold accents, strip illegal characters, collapse runs of whitespace, trim. */
export function cleanDisplayName(value: string): string {
  return foldAccents(value)
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX);
}

/**
 * Accept or refuse, never repair. Returns the value to store on success so the
 * caller cannot forget to trim it.
 */
export function validateDisplayName(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: DISPLAY_NAME_ERROR };
  // Accents are folded rather than refused. Everything else on this path
  // rejects, but telling someone their own name is illegal is not the rule
  // working — and the folded form is the same name, where a rejection is a
  // dead end with no legal spelling to offer.
  const trimmed = foldAccents(value).trim();
  if (trimmed.length < DISPLAY_NAME_MIN) return { ok: false, error: DISPLAY_NAME_ERROR };
  if (trimmed.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Display name can be at most ${DISPLAY_NAME_MAX} characters` };
  }
  // Checked rather than stripped: a name that loses characters on the way in is
  // not the name that was submitted.
  if (!/^[A-Za-z0-9 ]+$/.test(trimmed)) return { ok: false, error: DISPLAY_NAME_ERROR };
  return { ok: true, value: trimmed.replace(/\s{2,}/g, " ") };
}

/**
 * Best effort, always legal. "Player" is the floor rather than an error,
 * because the caller is creating an account and has nowhere to put a complaint.
 */
export function sanitizeDisplayName(value: string | null | undefined): string {
  const cleaned = cleanDisplayName(value ?? "");
  return cleaned.length >= DISPLAY_NAME_MIN ? cleaned : "Player";
}

/* ── Real names ────────────────────────────────────────────────────────────
   First and last name, collected at onboarding. A different rule from the
   display name: no digits and no spaces, because this is one name part rather
   than a handle.

   LETTERS ONLY, as specified. Worth knowing what that excludes: hyphens and
   apostrophes, so "Anne-Marie" and "O'Brien" are refused rather than stored
   with the punctuation dropped. Accents still fold to their ASCII base, so
   "Núñez" is accepted as "Nunez" instead of being rejected outright.
   ────────────────────────────────────────────────────────────────────────── */

export const PERSON_NAME_MAX = 40;
export const PERSON_NAME_ERROR = "Use letters only";

export function cleanPersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, PERSON_NAME_MAX);
}

export function validatePersonName(
  value: unknown,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: `${label} is required` };
  const folded = value.normalize("NFD").replace(/\p{Mn}/gu, "").trim();
  if (!folded) return { ok: false, error: `${label} is required` };
  if (folded.length > PERSON_NAME_MAX) {
    return { ok: false, error: `${label} can be at most ${PERSON_NAME_MAX} characters` };
  }
  if (!/^[A-Za-z]+$/.test(folded)) return { ok: false, error: `${label}: ${PERSON_NAME_ERROR}` };
  return { ok: true, value: folded };
}
