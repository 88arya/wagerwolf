import { prisma } from "../db/prisma";

const HELMET_COLORS = [
  "#2563EB", "#1d4ed8", "#1e40af", "#3b82f6", "#60a5fa",
  "#0891b2", "#0e7490", "#06b6d4",
  "#dc2626", "#b91c1c", "#ef4444",
  "#e11d48", "#9f1239", "#be185d", "#ec4899",
  "#7c3aed", "#6d28d9", "#a855f7",
  "#16a34a", "#15803d", "#059669", "#065f46",
  "#ea580c", "#c2410c",
  "#d97706", "#b45309", "#f59e0b",
  "#0f172a", "#1e293b", "#374151", "#78716c",
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
