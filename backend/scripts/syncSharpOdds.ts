import { syncOddsAllWeeks } from "../src/services/syncWeek";

async function main() {
  const r = await syncOddsAllWeeks();
  console.log(`[sharp] Done: ${r.weeks} weeks scanned, ${r.games} games matched, ${r.lines} lines, ${r.props} props`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
