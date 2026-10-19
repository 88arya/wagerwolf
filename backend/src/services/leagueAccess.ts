import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { memberships } from "../db/schema";

/** True when the user holds an ACTIVE membership in the league. */
export async function isLeagueMember(leagueId: string, userId: string): Promise<boolean> {
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.leagueId, leagueId),
      eq(memberships.userId, userId),
      eq(memberships.status, "ACTIVE"),
    ),
    columns: { id: true },
  });
  return !!membership;
}

// Sends 403 and returns false if the caller isn't in the league.
export async function requireLeagueMember(req: any, res: any, leagueId: string): Promise<boolean> {
  if (await isLeagueMember(leagueId, req.userId)) return true;
  res.status(403).json({ error: "Not a member" });
  return false;
}
