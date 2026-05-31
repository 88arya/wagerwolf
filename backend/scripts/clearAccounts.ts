import { prisma } from "../src/db/prisma";

async function main() {
  await prisma.passwordResetToken.deleteMany({});
  await prisma.parlayLeg.deleteMany({});
  await prisma.parlay.deleteMany({});
  await prisma.gamePick.deleteMany({});
  await prisma.pick.deleteMany({});
  await prisma.leagueMessage.deleteMany({});
  await prisma.matchup.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.league.deleteMany({});
  await prisma.user.deleteMany({});
  const users = await prisma.user.count();
  const leagues = await prisma.league.count();
  console.log(`Done. Users: ${users}, Leagues: ${leagues}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
