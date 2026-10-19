import { generateAbbreviation } from "./abbreviation";
import { sanitizeDisplayName } from "./displayName";
import { pickHelmetColor } from "./helmetColor";

// Name, tag and colour for a new membership. Always returns all three,
// falling back from account defaults to generated values.
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
    abbreviation: user?.defaultAbbreviation || generateAbbreviation(displayName),
    helmetColor: await pickHelmetColor(leagueId, user?.defaultHelmetColor ?? undefined),
  };
}
