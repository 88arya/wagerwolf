import { prisma } from "../src/db/prisma";

async function main() {
  const pl = await prisma.parlayLeg.deleteMany();
  const pa = await prisma.parlay.deleteMany();
  const gp = await prisma.gamePick.deleteMany();
  const pi = await prisma.pick.deleteMany();
  const ms = await prisma.leagueMessage.deleteMany();
  const ma = await prisma.matchup.deleteMany();
  const me = await prisma.membership.deleteMany();
  const le = await prisma.league.deleteMany();
  console.log("Deleted:", { parlayLegs: pl.count, parlays: pa.count, gamePicks: gp.count, picks: pi.count, messages: ms.count, matchups: ma.count, memberships: me.count, leagues: le.count });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
