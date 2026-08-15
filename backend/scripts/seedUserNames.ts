/**
 * Backfills firstName / lastName on accounts that predate onboarding.
 *
 * Run with: npx tsx scripts/seedUserNames.ts
 *
 * Idempotent — re-running only rewrites the same values. Accounts not listed
 * here keep their null names and will be sent through onboarding on next login.
 */
import "dotenv/config";
import { db } from "../src/db/db";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema";

const SEEDS: { email: string; firstName: string; lastName: string }[] = [
  { email: "aryalum1121@gmail.com", firstName: "Arya", lastName: "Lum" },
];

async function main() {
  for (const { email, firstName, lastName } of SEEDS) {
    const [updated] = await db
      .update(users)
      .set({ firstName, lastName })
      .where(eq(users.email, email))
      .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName });

    if (!updated) {
      console.log(`skip  ${email} — no such user`);
      continue;
    }
    console.log(`seed  ${updated.email} -> ${updated.firstName} ${updated.lastName}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
