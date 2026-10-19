// validateDisplayName rejects (user edits). sanitizeDisplayName repairs
// (Google sign-up, where nobody typed it and we can't refuse).

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 32;

export const DISPLAY_NAME_ERROR =
  `Display name must be at least ${DISPLAY_NAME_MIN} characters, using letters, numbers and spaces only`;

// Fold before filtering so "José" becomes "Jose", not "Jos".
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

export function validateDisplayName(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: DISPLAY_NAME_ERROR };
  const trimmed = foldAccents(value).trim();
  if (trimmed.length < DISPLAY_NAME_MIN) return { ok: false, error: DISPLAY_NAME_ERROR };
  if (trimmed.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Display name can be at most ${DISPLAY_NAME_MAX} characters` };
  }
  if (!/^[A-Za-z0-9 ]+$/.test(trimmed)) return { ok: false, error: DISPLAY_NAME_ERROR };
  return { ok: true, value: trimmed.replace(/\s{2,}/g, " ") };
}

export function sanitizeDisplayName(value: string | null | undefined): string {
  const cleaned = cleanDisplayName(value ?? "");
  return cleaned.length >= DISPLAY_NAME_MIN ? cleaned : "Player";
}

export const PERSON_NAME_MAX = 40;
export const PERSON_NAME_ERROR = "Use letters only";
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
