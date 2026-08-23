/**
 * Repair every player's espnId, headshot, jersey and POSITION from ESPN.
 *
 * Idempotent — it recomputes rather than adjusting, so it is safe to re-run.
 *
 * WHY THIS EXISTS. A player's position is a guess when the row is created: the
 * odds sync infers it from the first market the player appears in
 * (POSITION_HINT in services/syncWeek.ts), which is wrong for anyone who
 * appears outside their own position — a quarterback with a rushing-yards prop
 * lands as RB. `GET /players/:id/image` now takes ESPN's answer over that guess,
 * but it only fires when the jersey is empty, so any row already backfilled
 * under the older FLEX-only rule keeps whatever the market decided.
 *
 * This replaced `backfillJersey.ts`, which skipped every player that already
 * had a jersey — precisely the rows that need the position fixing.
 *
 * Run after a bulk import, or any time positions look wrong:
 *   npx tsx scripts/backfillPlayerDetails.ts
 */
import { db } from "../src/db/db";
import { players } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { searchEspnPlayerId, getAthleteDetails, espnImageUrl } from "../src/services/espnApi";

async function main() {
  const all = await db.select().from(players);
  console.log(`${all.length} players`);

  let fixed = 0;
  let unmatched = 0;

  for (const p of all) {
    // Cached first: the name search is the fragile step, and an id already on
    // the row was either resolved before or seeded.
    const espnId = p.espnId ?? (await searchEspnPlayerId(p.name, p.team));
    if (!espnId) { console.log(`  no ESPN match: ${p.name} (${p.team})`); unmatched++; continue; }

    const details = await getAthleteDetails(espnId);

    const next = {
      espnId,
      imageUrl: espnImageUrl(espnId),
      jersey: details.jersey ?? p.jersey,
      // ESPN wins whenever it answers. Only keep the stored value if it does
      // not — see the header for why the stored one is not trustworthy.
      position: details.position ?? p.position,
    };

    if (next.espnId === p.espnId && next.jersey === p.jersey && next.position === p.position) continue;

    const changes: string[] = [];
    if (next.position !== p.position) changes.push(`${p.position} -> ${next.position}`);
    if (next.jersey !== p.jersey) changes.push(`#${p.jersey ?? "?"} -> #${next.jersey ?? "?"}`);
    if (next.espnId !== p.espnId) changes.push("espnId set");

    try {
      await db.update(players).set(next).where(eq(players.id, p.id));
    } catch (e: any) {
      // espnId is unique. A duplicate name that resolved to the same athlete
      // will collide; write everything except the id rather than failing the run.
      if (e?.cause?.code === "23505") {
        await db.update(players)
          .set({ jersey: next.jersey, position: next.position })
          .where(eq(players.id, p.id));
        changes.push("espnId taken by a duplicate row");
      } else {
        throw e;
      }
    }

    console.log(`  ${p.name} (${p.team}): ${changes.join(", ")}`);
    fixed++;
  }

  console.log(`Done. ${fixed} updated, ${unmatched} with no ESPN match.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
