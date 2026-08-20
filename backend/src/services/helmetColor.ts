import { db } from "../db/db";
import { eq } from "drizzle-orm";
import { memberships } from "../db/schema";

// All 32 NFL teams' primary + alternate colors (ESPN), deduped
const HELMET_COLORS = [
  // Red
  "#d50a0a", "#e31837", "#c60c30", "#c9243f", "#bd1c36", "#c41230", "#a71930", "#a40227", "#aa0000", "#5a1414",
  // Orange
  "#ff3c00", "#fb4f14", "#fc4c02", "#e64100",
  // Brown
  "#472a08",
  // Yellow / Gold
  "#ffd100", "#ffc20e", "#ffc62f", "#ffb612", "#d7a22a", "#b3995d", "#d3bc8d",
  // Green
  "#69be28", "#115740", "#204e32",
  // Teal
  "#008e97", "#007487", "#06424d",
  // Blue
  "#4495d2", "#0085ca", "#0080c6", "#0076b6", "#003594", "#00338d", "#003b75", "#003c7f", "#002a5c", "#0a2343", "#0b1c3a", "#00143f", "#001532",
  // Purple
  "#4f2683", "#29126f",
  // Grey / Silver
  "#bbbbbb", "#b0b7bc", "#a5acaf", "#3e3a35",
  // Black
  "#000000",
  // (white is reserved for the ghost user)
];

/** The palette, for callers that need to validate a colour against it. */
export const HELMET_COLOR_LIST: readonly string[] = HELMET_COLORS;

/**
 * A colour for a new membership, unique within the league where possible.
 *
 * `preferred` is the user's default from My Account. It is honoured only if
 * nobody in this league already has it — uniqueness wins, because two identical
 * helmets in one league is a bug the user cannot fix, whereas a default that
 * quietly lost is a mild disappointment. Falls through to the old random pick.
 */
export async function pickHelmetColor(leagueId: string, preferred?: string | null): Promise<string> {
  try {
    const taken = await db.query.memberships.findMany({
      where: eq(memberships.leagueId, leagueId),
    });
    const takenSet = new Set(taken.map((m) => m.helmetColor));
    if (preferred && HELMET_COLORS.includes(preferred) && !takenSet.has(preferred)) return preferred;
    const available = HELMET_COLORS.filter(c => !takenSet.has(c));
    const pool = available.length > 0 ? available : HELMET_COLORS;
    return pool[Math.floor(Math.random() * pool.length)];
  } catch (err) {
    console.error("[helmetColor] failed, using random fallback:", err);
    return HELMET_COLORS[Math.floor(Math.random() * HELMET_COLORS.length)];
  }
}
