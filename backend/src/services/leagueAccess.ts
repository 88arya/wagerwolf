/**
 * "Is this caller allowed to read this league?" in one place.
 *
 * `requireAuth` only proves somebody holds a valid token. It says nothing about
 * whether they are in the league whose id they put in the URL, and league ids
 * are handed out freely — they are in every league URL a member ever pastes.
 * Several read routes checked the token and stopped there, so any signed-in
 * user could read any league's standings and schedule by guessing nothing at
 * all.
 *
 * `/feed` and `/chat` already carried this check inline. This is that same
 * check, named, so the next route added gets it by writing one line.
 */
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

/**
 * Guard for a route body. Answers 403 and returns false when the caller is not
 * a member, so a handler reads:
 *
 *     if (!(await requireLeagueMember(req, res, leagueId))) return;
 *
 * The message is deliberately the same "Not a member" the inline checks already
 * used — telling a stranger a league exists is itself a small leak, and 403
 * rather than 404 keeps that answer identical for a real and a made-up id.
 */
export async function requireLeagueMember(req: any, res: any, leagueId: string): Promise<boolean> {
  if (await isLeagueMember(leagueId, req.userId)) return true;
  res.status(403).json({ error: "Not a member" });
  return false;
}
