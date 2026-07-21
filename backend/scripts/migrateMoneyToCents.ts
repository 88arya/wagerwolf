// ONE-TIME migration: money columns switched from whole dollars to integer cents.
// Multiplies every existing money value by 100. Run exactly once:
//   npx tsx scripts/migrateMoneyToCents.ts
// Odds (American) and lines (stat lines) are NOT money and are left untouched.
import { db } from "../src/db/db";
import { sql } from "drizzle-orm";

async function main() {
  const statements = [
    sql`UPDATE "League" SET "weeklyAllowance" = "weeklyAllowance" * 100`,
    sql`UPDATE "League" SET "maxStakePerBet" = "maxStakePerBet" * 100 WHERE "maxStakePerBet" IS NOT NULL`,
    sql`UPDATE "Membership" SET "balance" = "balance" * 100, "weeklyWinnings" = "weeklyWinnings" * 100`,
    sql`UPDATE "Matchup" SET "homeProfit" = "homeProfit" * 100 WHERE "homeProfit" IS NOT NULL`,
    sql`UPDATE "Matchup" SET "awayProfit" = "awayProfit" * 100 WHERE "awayProfit" IS NOT NULL`,
    sql`UPDATE "Pick" SET "stake" = "stake" * 100`,
    sql`UPDATE "GamePick" SET "stake" = "stake" * 100`,
    sql`UPDATE "Parlay" SET "stake" = "stake" * 100, "payout" = "payout" * 100`,
  ];

  for (const stmt of statements) {
    const res: any = await db.execute(stmt);
    console.log(`  ${(stmt as any).queryChunks ? "updated" : "updated"} — rowCount=${res.rowCount ?? "?"}`);
  }
  console.log("Money migration to cents complete.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
