import { prisma } from "../db/prisma";

const HELMET_COLORS = [
  "#fca5a5", "#f87171", "#dc2626", "#7f1d1d",
  "#fdba74", "#fb923c", "#ea580c", "#7c2d12",
  "#fde68a", "#fbbf24", "#d97706", "#92400e",
  "#86efac", "#4ade80", "#16a34a", "#14532d",
  "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a",
  "#c4b5fd", "#a78bfa", "#7c3aed", "#4c1d95",
  "#f9a8d4", "#f472b6", "#db2777", "#831843",
];

export async function pickHelmetColor(leagueId: string): Promise<string> {
  console.log("[helmetColor] called for leagueId:", leagueId);
  try {
    const taken = await prisma.membership.findMany({
      where: { leagueId, status: { in: ["ACTIVE", "PENDING"] } },
      select: { helmetColor: true },
    });
    const takenSet = new Set(taken.map((m: any) => m.helmetColor));
    const available = HELMET_COLORS.filter(c => !takenSet.has(c));
    const pool = available.length > 0 ? available : HELMET_COLORS;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    console.log("[helmetColor] taken:", [...takenSet], "picked:", picked);
    return picked;
  } catch (err) {
    console.error("[helmetColor] failed, using random fallback:", err);
    return HELMET_COLORS[Math.floor(Math.random() * HELMET_COLORS.length)];
  }
}
