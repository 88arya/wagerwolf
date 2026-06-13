import { db } from "../src/db/db";
import { parlayLegs, parlays, gamePicks, picks, matchups, memberships, leagues } from "../src/db/schema";

async function main() {
  await db.delete(parlayLegs);
  await db.delete(parlays);
  await db.delete(gamePicks);
  await db.delete(picks);
  await db.delete(matchups);
  await db.delete(memberships);
  await db.delete(leagues);
  console.log("Done — all leagues deleted");
}

main().catch(console.error).finally(() => process.exit(0));
