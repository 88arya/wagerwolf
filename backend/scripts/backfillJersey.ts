import { db } from "../src/db/db";
import { players } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { searchEspnPlayerId, getAthleteJersey, espnImageUrl } from "../src/services/espnApi";

async function main() {
  const all = await db.select().from(players);
  console.log(`Found ${all.length} players`);

  let updated = 0;
  for (const p of all) {
    if (p.jersey) continue;

    let espnId = p.espnId;
    if (!espnId) espnId = await searchEspnPlayerId(p.name);
    if (!espnId) { console.log(`  no ESPN match: ${p.name}`); continue; }

    const jersey = await getAthleteJersey(espnId);
    try {
      await db.update(players)
        .set({ espnId, imageUrl: espnImageUrl(espnId), jersey: jersey ?? null })
        .where(eq(players.id, p.id));
    } catch (e: any) {
      if (e?.cause?.code === "23505") {
        // espnId already claimed by a duplicate-name fake roster entry — jersey has no uniqueness constraint
        await db.update(players).set({ jersey: jersey ?? null }).where(eq(players.id, p.id));
      } else {
        throw e;
      }
    }

    console.log(`  ${p.name} (${p.team} ${p.position}) -> #${jersey ?? "?"}`);
    if (jersey) updated++;
  }
  console.log(`Done. Jersey numbers set for ${updated} players.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
