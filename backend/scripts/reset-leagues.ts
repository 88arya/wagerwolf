import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_DIRECT_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  await prisma.parlayLeg.deleteMany({});
  await prisma.parlay.deleteMany({});
  await prisma.gamePick.deleteMany({});
  await prisma.pick.deleteMany({});
  await prisma.matchup.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.league.deleteMany({});
  console.log("Done — all leagues deleted");
}

main().catch(console.error).finally(() => prisma.$disconnect());
