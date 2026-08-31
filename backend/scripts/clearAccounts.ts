import { db } from "../src/db/db";
import { parlayLegs, parlays, gamePicks, picks, leagueMessages, matchups, memberships, leagues, users } from "../src/db/schema";
import { count } from "drizzle-orm";

async function main() {
  await db.delete(parlayLegs);
  await db.delete(parlays);
  await db.delete(gamePicks);
  await db.delete(picks);
  await db.delete(leagueMessages);
  await db.delete(matchups);
  await db.delete(memberships);
  await db.delete(leagues);
  await db.delete(users);
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  const [{ value: leagueCount }] = await db.select({ value: count() }).from(leagues);
  console.log(`Done. Users: ${userCount}, Leagues: ${leagueCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
