import { ABBREV_LENGTH } from "./abbreviationRules";

/**
 * The first three letters of the display name, uppercased. Always exactly
 * three — see services/abbreviationRules.
 *
 * Spaces are stripped rather than treated as word boundaries: this is
 * deliberately NOT initials. "Arya Lum" is ARY, not AL, and the settings page
 * states "from your display name" as the default, so anything else would make
 * that label a lie.
 *
 * SHORT NAMES ARE PADDED, not left short. A display name is at least three
 * characters (services/displayName), but it can still yield fewer than three
 * LETTERS — "a b" is a legal name and gives AB. The first letter repeats to
 * fill, matching what components/LeagueProfileModal does when its field is left
 * blank, so the two never disagree about what "Jo" becomes.
 */
export function generateAbbreviation(displayName: string): string {
  let tag = displayName.trim().replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, ABBREV_LENGTH);
  // "P" for Player: the caller is seeding a membership and has nowhere to put
  // a complaint about a name with no letters in it.
  if (!tag) tag = "P";
  while (tag.length < ABBREV_LENGTH) tag += tag[0];
  return tag;
}
