import { prisma } from "../src/db/prisma";

async function main() {
  const weeks = await prisma.week.findMany({
    orderBy: { number: "asc" },
    include: { games: { select: { homeTeam: true, _count: { select: { props: true } } } } }
  });
  for (const w of weeks) {
    const totalProps = w.games.reduce((s: number, g: any) => s + g._count.props, 0);
    const sample = w.games[0]?.homeTeam ?? "-";
    console.log(`Week ${String(w.number).padStart(2)}: games=${w.games.length} props=${totalProps} sample=${sample}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
