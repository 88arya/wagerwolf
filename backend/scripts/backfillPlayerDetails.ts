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
    const espnId = p.espnId ?? (await searchEspnPlayerId(p.name, p.team));
    if (!espnId) { console.log(`  no ESPN match: ${p.name} (${p.team})`); unmatched++; continue; }

    const details = await getAthleteDetails(espnId);

    const next = {
      espnId,
      imageUrl: espnImageUrl(espnId),
      jersey: details.jersey ?? p.jersey,
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
