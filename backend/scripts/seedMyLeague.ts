import { db } from "../src/db/db";
import { eq } from "drizzle-orm";
import { users, leagues, memberships, weeks } from "../src/db/schema";
import { pickHelmetColor } from "../src/services/helmetColor";
import { generateAbbreviation } from "../src/services/abbreviation";
import { generateLeagueName } from "../src/services/leagueName";
import { startLeagueSeason } from "../src/services/startSeason";

const MY_EMAIL = "aryalum1121@gmail.com";

const BOT_NAMES = [
  "Jordan Blake", "Casey Rivers", "Morgan Steele", "Riley Hayes",
  "Avery Cole", "Quinn Parker", "Reese Monroe", "Skyler Finch", "Drew Ellison",
];

async function main() {
  const me = await db.query.users.findFirst({ where: eq(users.email, MY_EMAIL) });
  if (!me) throw new Error(`No user found with email ${MY_EMAIL} — register through the app first`);

  const botUsers: { id: string; displayName: string }[] = [];
  for (let i = 0; i < BOT_NAMES.length; i++) {
    const displayName = BOT_NAMES[i];
    const email = `bot${i + 1}@fanmark.dev`;
    let bot = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!bot) {
      [bot] = await db.insert(users).values({
        email, password: "", name: displayName, displayName,
      }).returning();
      console.log(`Created bot user: ${displayName}`);
    }
    botUsers.push({ id: bot.id, displayName: bot.displayName });
  }

  const firstUnresolved = await db.query.weeks.findFirst({ where: eq(weeks.resolved, false) });
  const startWeek = firstUnresolved?.number ?? 1;

  let inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (await db.query.leagues.findFirst({ where: eq(leagues.inviteCode, inviteCode) })) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  const [league] = await db.insert(leagues).values({
    name: generateLeagueName(),
    weeklyAllowance: 30000, // $300 in cents
    inviteCode,
    creatorId: me.id,
    isPublic: false,
    maxPlayers: 10,
    startWeek,
  }).returning();
  console.log(`Created league: ${league.name} (${league.id}), invite code ${league.inviteCode}`);

  const allMembers = [{ id: me.id, displayName: me.displayName }, ...botUsers];
  for (const member of allMembers) {
    const helmetColor = await pickHelmetColor(league.id);
    const abbreviation = generateAbbreviation(member.displayName);
    await db.insert(memberships).values({
      userId: member.id,
      leagueId: league.id,
      balance: 0,
      status: "ACTIVE",
      helmetColor,
      abbreviation,
      displayName: member.displayName,
    });
    console.log(`Added member: ${member.displayName} (${helmetColor}, ${abbreviation})`);
  }

  const result = await startLeagueSeason(league.id);
  console.log(`Season started: ${result.weeks} regular season weeks scheduled`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
