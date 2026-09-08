/**
 * Asserts the /home/pulse ledger against a hand-built week, inside a
 * transaction that always rolls back.
 *
 * The volume half is easy to eyeball against real data. The ledger half is not:
 * its attribution rules (a winning parlay pays every entity on it in full; a
 * losing one charges only the entities whose own leg missed) have no way to
 * show themselves wrong on a screen — a number is simply a bit off and nobody
 * knows. So they get a fixture with a known answer.
 *
 * Run: npx tsx scripts/pulsecheck.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/db";
import { weeks, games, players, props, gameLines, picks, parlays, parlayLegs } from "../src/db/schema";
import { ledgerForWeek, homePulse } from "../src/services/homePulse";

const id = (s: string) => `pulsecheck-${s}`;

// Week 999 never collides with a real NFL week, and the whole transaction is
// rolled back regardless.
const WEEK = 999;

type Expect = { key: string; bets: number; wagered: number; profit: number; lost: number };

function check(name: string, rows: any[], expected: Expect[]): boolean {
  const got = rows.map((r) => ({
    key: r.key, bets: r.bets, wagered: r.wagered, profit: r.profit, lost: r.lost,
  }));
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log("  expected", JSON.stringify(expected));
    console.log("  got     ", JSON.stringify(got));
  }
  return ok;
}

async function main() {
  let passed = 0;
  let failed = 0;

  try {
    await db.transaction(async (tx: any) => {
      await tx.insert(weeks).values({
        id: id("week"), number: WEEK,
        startDate: new Date("2020-01-01"), endDate: new Date("2020-01-08"),
        resolved: true,
      });
      await tx.insert(games).values({
        id: id("game"), weekId: id("week"),
        homeTeam: "HOM", awayTeam: "AWY", gameDate: new Date("2020-01-05"), status: "FINAL",
      });
      await tx.insert(players).values([
        { id: id("p1"), name: "Pulse One", team: "HOM", position: "WR" },
        { id: id("p2"), name: "Pulse Two", team: "AWY", position: "RB" },
      ]);
      await tx.insert(props).values([
        { id: id("pr1"), gameId: id("game"), playerId: id("p1"), statType: "RECEIVING_YARDS", line: 50, odds: -110 },
        { id: id("pr2"), gameId: id("game"), playerId: id("p2"), statType: "RUSHING_YARDS", line: 40, odds: -110 },
      ]);
      await tx.insert(gameLines).values({
        id: id("gl"), gameId: id("game"), market: "MONEYLINE_HOME", label: "HOM ML", odds: -150,
      });

      const bet = { userId: id("u"), leagueId: id("l") };

      // 1. Single on P1, +100, WIN  -> P1 profit 1000
      // 2. Single on P2, -200, LOSS -> P2 lost 500
      await tx.insert(picks).values([
        { id: id("pick1"), ...bet, propId: id("pr1"), direction: "OVER", stake: 1000, odds: 100, outcome: "WIN" },
        { id: id("pick2"), ...bet, propId: id("pr2"), direction: "UNDER", stake: 500, odds: -200, outcome: "LOSS" },
      ]);

      await tx.insert(parlays).values([
        // A: WON. Profit 600 credited to P1 AND to HOM, in full, to both.
        { id: id("parA"), ...bet, stake: 200, totalOdds: 300, payout: 800, outcome: "WIN" },
        // B: LOST on P2's leg. P1's leg hit, so P1 is charged nothing.
        { id: id("parB"), ...bet, stake: 300, totalOdds: 250, payout: 1050, outcome: "LOSS" },
        // C: LOST, both legs on P1 — one hit, one missed. Charged once, not twice.
        { id: id("parC"), ...bet, stake: 400, totalOdds: 200, payout: 1200, outcome: "LOSS" },
      ]);
      await tx.insert(parlayLegs).values([
        { id: id("legA1"), parlayId: id("parA"), propId: id("pr1"), direction: "OVER", odds: 100, outcome: "WIN" },
        { id: id("legA2"), parlayId: id("parA"), gameLineId: id("gl"), odds: -150, outcome: "WIN" },
        { id: id("legB1"), parlayId: id("parB"), propId: id("pr1"), direction: "OVER", odds: 100, outcome: "WIN" },
        { id: id("legB2"), parlayId: id("parB"), propId: id("pr2"), direction: "OVER", odds: 100, outcome: "LOSS" },
        { id: id("legC1"), parlayId: id("parC"), propId: id("pr1"), direction: "OVER", odds: 100, outcome: "WIN" },
        { id: id("legC2"), parlayId: id("parC"), propId: id("pr1"), direction: "UNDER", odds: -120, outcome: "LOSS" },
      ]);

      const led = await ledgerForWeek(tx, id("week"), 5);

      // P1: profit 1000 (single) + 600 (parlay A) = 1600.
      //     lost 400 (parlay C only, counted once).
      //     4 tickets, 1000+200+300+400 = 1900 staked.
      // P2: lost 500 (single) + 300 (parlay B) = 800 across 2 tickets.
      const results = [
        check("players by profit", led.playersProfit, [
          { key: id("p1"), bets: 4, wagered: 1900, profit: 1600, lost: 400 },
        ]),
        check("players by loss", led.playersLost, [
          { key: id("p2"), bets: 2, wagered: 800, profit: 0, lost: 800 },
          { key: id("p1"), bets: 4, wagered: 1900, profit: 1600, lost: 400 },
        ]),
        // HOM's only team bet is parlay A's moneyline leg, which won.
        check("teams that came through", led.teamsHit, [
          { key: "HOM", bets: 1, wagered: 200, profit: 600, lost: 0 },
        ]),
        check("teams that fell short", led.teamsMiss, []),
      ];
      passed = results.filter(Boolean).length;
      failed = results.length - passed;

      // Always roll back — this fixture must never reach a real database.
      throw new Error("__rollback__");
    });
  } catch (err: any) {
    if (err?.message !== "__rollback__") throw err;
  }

  // Single flight: two callers arriving together must share one query, not race
  // two. The cache holds the in-flight promise, so both await the same object —
  // with a value cache they would each build their own and these would differ.
  const [a, b] = await Promise.all([homePulse(5), homePulse(5)]);
  const sameFlight = a === b;
  console.log(`${sameFlight ? "PASS" : "FAIL"}  concurrent callers share one query`);
  if (sameFlight) passed += 1; else failed += 1;

  const leaked: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM "Week" WHERE number = ${WEEK}`);
  const n = (Array.isArray(leaked) ? leaked : leaked.rows)[0]?.n ?? 0;
  console.log(`${n === 0 ? "PASS" : "FAIL"}  rollback left nothing behind`);
  if (n !== 0) failed += 1; else passed += 1;

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
