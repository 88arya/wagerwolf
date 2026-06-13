import { db } from "../src/db/db";
import { parlayLegs, parlays, gamePicks, picks, leagueMessages, matchups, memberships, leagues } from "../src/db/schema";

async function main() {
  await db.delete(parlayLegs);
  await db.delete(parlays);
  await db.delete(gamePicks);
  await db.delete(picks);
  await db.delete(leagueMessages);
  await db.delete(matchups);
  await db.delete(memberships);
  const deleted = await db.delete(leagues).returning();
  console.log("Deleted:", { leagues: deleted.length });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
