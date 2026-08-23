import { generateAbbreviation } from "./abbreviation";
import { sanitizeDisplayName } from "./displayName";
import { pickHelmetColor } from "./helmetColor";

/**
 * The three things a member is shown as inside a league: a name, a three-letter
 * tag and a colour. **All three are always produced** — there is no path
 * through this that returns a blank.
 *
 * That guarantee is the point. Onboarding's second step is skippable, so an
 * account can reach a league with `defaultAbbreviation` and
 * `defaultHelmetColor` both null and only a Google-derived display name. The
 * league still has to render a scoreboard, a helmet and a name for them.
 *
 * Each falls back one step at a time:
 *
 *   colour  the account default if it is still free in this league, otherwise
 *           an unused one — `pickHelmetColor` owns per-league uniqueness, which
 *           is why the account-level value is a preference and not a promise.
 *   tag     the account default, else the first three letters of the display
 *           name; `generateAbbreviation` pads short ones and never returns
 *           fewer than three.
 *   name    the account display name, else "Player". `sanitizeDisplayName`
 *           supplies that floor.
 *
 * WHY THE NAME NEEDS A FLOOR AT ALL. Both callers used to write
 * `user?.displayName ?? ""`, and every read of it goes through the
 * `m.displayName || m.user.displayName` fallback — which resolves to an empty
 * string when both sides are empty. Nothing crashes; a member simply renders
 * as nothing at all, on the leaderboard, in chat and in the feed. The empty
 * string is falsy, so the fallback chain hides the problem instead of catching
 * it.
 */
export type LeagueIdentity = {
  displayName: string;
  abbreviation: string;
  helmetColor: string;
};

type IdentitySource = {
  displayName?: string | null;
  defaultAbbreviation?: string | null;
  defaultHelmetColor?: string | null;
} | null | undefined;

export async function resolveLeagueIdentity(
  leagueId: string,
  user: IdentitySource,
): Promise<LeagueIdentity> {
  const displayName = sanitizeDisplayName(user?.displayName);
  return {
    displayName,
    // Derived from the RESOLVED name, not the raw one, so the tag of an account
    // that fell through to "Player" is PLA rather than PPP.
    abbreviation: user?.defaultAbbreviation || generateAbbreviation(displayName),
    helmetColor: await pickHelmetColor(leagueId, user?.defaultHelmetColor ?? undefined),
  };
}
