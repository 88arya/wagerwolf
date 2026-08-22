/**
 * Assertions over the pure settlement + polling logic, and a simulation of a
 * real NFL week to check the odds budget actually holds.
 *
 * No DB, no network — run it any time:  npx tsx scripts/verifySettlement.ts
 */
import { gradeOverUnder, gradeGameLine, creditFor, settleParlay } from "../src/services/grading";
import { intervalMinutesFor, isDue } from "../src/services/oddsPoller";
import { normalizeEvent } from "../src/services/sportsGameOdds";
import { calcParlayOdds, calcParlayPayout } from "../src/lib/payout";

let passed = 0;
const failures: string[] = [];

function eq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; }
  failures.push(`${label}\n     expected ${JSON.stringify(expected)}\n     actual   ${JSON.stringify(actual)}`);
}

// ── Prop grading ────────────────────────────────────────────────────────────
eq("OVER beats the line",        gradeOverUnder(7, 6.5, "OVER"),  "WIN");
eq("OVER misses the line",       gradeOverUnder(6, 6.5, "OVER"),  "LOSS");
eq("UNDER beats the line",       gradeOverUnder(6, 6.5, "UNDER"), "WIN");
eq("UNDER misses the line",      gradeOverUnder(7, 6.5, "UNDER"), "LOSS");
// The bug this whole change exists for: a whole-number line landing exactly.
eq("OVER lands on the number",   gradeOverUnder(6, 6, "OVER"),    "PUSH");
eq("UNDER lands on the number",  gradeOverUnder(6, 6, "UNDER"),   "PUSH");
eq("zero result under a 0.5",    gradeOverUnder(0, 0.5, "UNDER"), "WIN");

// ── Game lines ──────────────────────────────────────────────────────────────
eq("ML home wins",   gradeGameLine("MONEYLINE_HOME", null, 24, 17), "WIN");
eq("ML away loses",  gradeGameLine("MONEYLINE_AWAY", null, 24, 17), "LOSS");
eq("ML on a tie",    gradeGameLine("MONEYLINE_HOME", null, 20, 20), "PUSH");
eq("home covers",    gradeGameLine("SPREAD_HOME", -3, 24, 17), "WIN");
eq("home spread lands exactly", gradeGameLine("SPREAD_HOME", -7, 24, 17), "PUSH");
eq("away spread lands exactly", gradeGameLine("SPREAD_AWAY", 7, 24, 17), "PUSH");
eq("total goes over",  gradeGameLine("TOTAL_OVER", 40.5, 24, 17), "WIN");
eq("total lands on the number (over)",  gradeGameLine("TOTAL_OVER", 41, 24, 17), "PUSH");
eq("total lands on the number (under)", gradeGameLine("TOTAL_UNDER", 41, 24, 17), "PUSH");
eq("alt spread grades like its base",   gradeGameLine("ALT_SPREAD_HOME_-7", -7, 24, 17), "PUSH");
eq("alt total grades like its base",    gradeGameLine("ALT_TOTAL_OVER_38.5", 38.5, 24, 17), "WIN");
eq("unknown market is not a loss",      gradeGameLine("SOMETHING_ELSE", 1, 24, 17), null);
eq("missing line is not a loss",        gradeGameLine("SPREAD_HOME", null, 24, 17), null);

// ── Crediting ───────────────────────────────────────────────────────────────
eq("win returns stake + profit", creditFor("WIN", 1000, -110), 1000 + 909);
eq("loss returns nothing",       creditFor("LOSS", 1000, -110), 0);
eq("push returns the stake",     creditFor("PUSH", 1000, -110), 1000);

// ── Parlays ─────────────────────────────────────────────────────────────────
{
  const stake = 1000;
  const legs = [{ outcome: "WIN", odds: -110 }, { outcome: "WIN", odds: 150 }];
  const expectedOdds = calcParlayOdds([-110, 150]);
  eq("all legs win", settleParlay(legs, stake),
     { outcome: "WIN", totalOdds: expectedOdds, payout: calcParlayPayout(stake, expectedOdds) });

  eq("one leg loses kills it",
     settleParlay([{ outcome: "WIN", odds: -110 }, { outcome: "LOSS", odds: 150 }], stake),
     { outcome: "LOSS", totalOdds: null, payout: 0 });

  eq("a pending leg holds the ticket",
     settleParlay([{ outcome: "WIN", odds: -110 }, { outcome: "PENDING", odds: 150 }], stake),
     null);

  // A pushed leg is dropped and the parlay re-priced on the survivors — it
  // neither loses the ticket nor pays as though the leg had won.
  const survivorOdds = calcParlayOdds([-110, 150]);
  eq("a pushed leg is removed and the rest re-priced",
     settleParlay(
       [{ outcome: "WIN", odds: -110 }, { outcome: "PUSH", odds: -200 }, { outcome: "WIN", odds: 150 }],
       stake,
     ),
     { outcome: "WIN", totalOdds: survivorOdds, payout: calcParlayPayout(stake, survivorOdds) });

  // Void rule: refund only while the ticket is still alive.
  eq("void leg refunds when nothing has lost",
     settleParlay([{ outcome: "WIN", odds: -110 }, { outcome: "VOID", odds: 150 }], stake),
     { outcome: "VOID", totalOdds: null, payout: stake });

  eq("void leg refunds even with legs still in progress",
     settleParlay([{ outcome: "PENDING", odds: -110 }, { outcome: "VOID", odds: 150 }], stake),
     { outcome: "VOID", totalOdds: null, payout: stake });

  eq("a lost leg blocks the void refund",
     settleParlay([{ outcome: "LOSS", odds: -110 }, { outcome: "VOID", odds: 150 }], stake),
     { outcome: "LOSS", totalOdds: null, payout: 0 });

  eq("lost leg blocks the refund regardless of leg order",
     settleParlay([{ outcome: "VOID", odds: 150 }, { outcome: "LOSS", odds: -110 }], stake),
     { outcome: "LOSS", totalOdds: null, payout: 0 });

  eq("every leg pushing refunds the stake",
     settleParlay([{ outcome: "PUSH", odds: -110 }, { outcome: "PUSH", odds: 150 }], stake),
     { outcome: "VOID", totalOdds: null, payout: stake });

  // A pushed leg must never pay more than the same parlay without it.
  const withPush = settleParlay(
    [{ outcome: "WIN", odds: -110 }, { outcome: "PUSH", odds: -200 }], stake)!;
  const soloWin = settleParlay([{ outcome: "WIN", odds: -110 }], stake)!;
  eq("push does not inflate the payout", withPush.payout, soloWin.payout);
}

// ── Poller tiers ────────────────────────────────────────────────────────────
eq("inside 6h -> hourly",        intervalMinutesFor(3), 60);
eq("6h boundary is hourly",      intervalMinutesFor(6), 60);
eq("6-24h -> 2-hourly",          intervalMinutesFor(12), 120);
eq("24-72h -> 6-hourly",         intervalMinutesFor(48), 360);
eq("beyond 72h -> daily",        intervalMinutesFor(100), 1440);

{
  const now = new Date("2026-09-10T12:00:00Z");
  const soon = new Date("2026-09-10T15:00:00Z");   // 3h out -> hourly
  eq("never polled is due", isDue({ gameDate: soon, oddsPolledAt: null }, now), true);
  eq("polled 90m ago, hourly tier -> due",
     isDue({ gameDate: soon, oddsPolledAt: new Date("2026-09-10T10:30:00Z") }, now), true);
  eq("polled 30m ago, hourly tier -> not due",
     isDue({ gameDate: soon, oddsPolledAt: new Date("2026-09-10T11:30:00Z") }, now), false);
  eq("kicked off -> never due",
     isDue({ gameDate: new Date("2026-09-10T11:00:00Z"), oddsPolledAt: null }, now), false);
}

// ── Feed parsing ────────────────────────────────────────────────────────────
// Defensive and kicking props cannot be checked against live data: no book in
// the feed prices them for NFL right now, on any game. A synthetic event proves
// the mapping is wired, so the Defensive and Kicking tabs will populate on their
// own the moment a book opens those markets.
{
  const ou = (stat: string, player: string, side: string, odds: string, line: string, alts: any[] = []) =>
    [`${stat}-${player}-game-ou-${side}`, {
      opposingOddID: `${stat}-${player}-game-ou-${side === "over" ? "under" : "over"}`,
      byBookmaker: { betmgm: { odds, overUnder: line, available: true, altLines: alts } },
    }];

  const ev = normalizeEvent({
    eventID: "synthetic_1",
    status: { startsAt: "2026-09-13T17:00:00Z", finalized: false },
    teams: { home: { teamID: "SEATTLE_SEAHAWKS_NFL" }, away: { teamID: "NEW_ENGLAND_PATRIOTS_NFL" } },
    players: {
      RUSHER_1_NFL: { name: "Test Rusher", teamID: "SEATTLE_SEAHAWKS_NFL" },
      KICKER_1_NFL: { name: "Test Kicker", teamID: "SEATTLE_SEAHAWKS_NFL" },
    },
    odds: Object.fromEntries([
      ou("defense_sacks", "RUSHER_1_NFL", "over", "+140", "0.5", [{ odds: "+400", overUnder: "1.5" }]),
      ou("defense_sacks", "RUSHER_1_NFL", "under", "-180", "0.5"),
      ou("fieldGoals_made", "KICKER_1_NFL", "over", "-120", "1.5", [{ odds: "+250", overUnder: "2.5" }]),
      ou("fieldGoals_made", "KICKER_1_NFL", "under", "-105", "1.5"),
    ]),
  });

  eq("synthetic event parses", ev !== null, true);
  const sacks = ev!.props.find((p) => p.statType === "SACKS");
  const fgs   = ev!.props.find((p) => p.statType === "FIELD_GOALS_MADE");
  eq("defense_sacks maps to SACKS",             sacks?.line, 0.5);
  eq("SACKS keeps the book price",              sacks?.odds, 140);
  eq("SACKS builds a ladder",                   sacks?.ladder.length, 2);
  eq("fieldGoals_made maps to FIELD_GOALS_MADE", fgs?.line, 1.5);
  eq("kicking prop resolves its team",          fgs?.team, "SEA");
  // A book outside the FD/DK pair must still be read, or these markets vanish.
  eq("non-FD/DK book is used",                  sacks?.oddID, "defense_sacks-RUSHER_1_NFL-game-ou-over");
  // The under of an alt rung is derived from the main line's overround.
  const rung = sacks?.ladder.find((r) => r.line === 1.5);
  eq("alt rung has both sides priced", typeof rung?.under, "number");
}

// ── Budget simulation over a real, staggered NFL week ───────────────────────
// Kickoffs in UTC. Week rolls over Tuesday 11:00 UTC (the resolve cron).
const WEEK_START = new Date("2026-09-08T11:00:00Z");
const KICKOFFS: Array<[string, string]> = [
  ["TNF",        "2026-09-11T00:15:00Z"],
  ...Array.from({ length: 9 }, (_, i) => [`Sun early ${i + 1}`, "2026-09-13T17:00:00Z"] as [string, string]),
  ...Array.from({ length: 3 }, (_, i) => [`Sun late ${i + 1}`, "2026-09-13T20:25:00Z"] as [string, string]),
  ["SNF",        "2026-09-14T00:20:00Z"],
  ["MNF 1",      "2026-09-15T00:15:00Z"],
  ["MNF 2",      "2026-09-15T00:15:00Z"],
];

const polls = new Map<string, number>();
const lastPolled = new Map<string, Date | null>(KICKOFFS.map(([n]) => [n, null]));
const TICK_MS = 30 * 60 * 1000;
const simEnd = new Date("2026-09-15T04:00:00Z");

for (let t = WEEK_START.getTime(); t <= simEnd.getTime(); t += TICK_MS) {
  const now = new Date(t);
  for (const [name, kickoff] of KICKOFFS) {
    const game = { gameDate: new Date(kickoff), oddsPolledAt: lastPolled.get(name)! };
    if (!isDue(game, now)) continue;
    polls.set(name, (polls.get(name) ?? 0) + 1);
    lastPolled.set(name, now);
  }
}

const perGame = [...polls.values()];
const weekTotal = perGame.reduce((a, b) => a + b, 0);
const maxGame = Math.max(...perGame);

console.log("\n── Budget simulation: one real NFL week (16 games, staggered) ──");
for (const [name] of KICKOFFS) {
  if (name.includes("early 2") || name.includes("early 3")) continue;   // keep output short
  console.log(`   ${name.padEnd(14)} ${String(polls.get(name)).padStart(3)} refreshes`);
}
console.log(`   ${"".padEnd(14)} ${"---".padStart(3)}`);
console.log(`   week total     ${weekTotal} entities  (worst game: ${maxGame})`);

const DISCOVERY = 16, SETTLEMENT = 16;
for (const weeksInMonth of [4, 5]) {
  const total = (weekTotal + DISCOVERY + SETTLEMENT) * weeksInMonth;
  const pct = Math.round((total / 2500) * 100);
  const verdict = total <= 2500 ? "OK" : "OVER BUDGET";
  console.log(`   ${weeksInMonth}-week month: ${total} / 2500  (${pct}%)  ${verdict}`);
  if (total > 2500) failures.push(`budget blown in a ${weeksInMonth}-week month: ${total} > 2500`);
  else passed++;
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} — ${passed} checks passed, ${failures.length} failed`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
