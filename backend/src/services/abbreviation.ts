import { ABBREV_LENGTH } from "./abbreviationRules";

// First three letters of the display name (not initials), padded by repeating
// the first letter.
export function generateAbbreviation(displayName: string): string {
  let tag = displayName.trim().replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, ABBREV_LENGTH);
  if (!tag) tag = "P";
  while (tag.length < ABBREV_LENGTH) tag += tag[0];
  return tag;
}
