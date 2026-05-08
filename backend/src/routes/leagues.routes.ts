import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { name, weeklyAllowance, startWeek, regularSeasonWeeks, playoffWeeks, playoffSize } = req.body;
    if (!name || !weeklyAllowance || Number(weeklyAllowance) <= 0) {
      res.status(400).json({ error: "Name and a positive weekly allowance are required" });
      return;
    }
    const sw = Number(startWeek ?? 1);
    const rsw = Number(regularSeasonWeeks ?? 13);
    const pw = Number(playoffWeeks ?? 3);
    if (sw + rsw + pw - 1 > 18) {
      res.status(400).json({ error: `Season exceeds 18 NFL weeks (start ${sw} + ${rsw} reg + ${pw} playoff = ${sw + rsw + pw - 1})` });
      return;
    }

    let inviteCode = generateInviteCode();
    while (await prisma.league.findUnique({ where: { inviteCode } })) {
      inviteCode = generateInviteCode();
    }

    const league = await prisma.league.create({
      data: {
        name,
        weeklyAllowance: Number(weeklyAllowance),
        inviteCode,
        creatorId: req.userId,
        startWeek: sw,
        regularSeasonWeeks: rsw,
        playoffWeeks: pw,
        ...(playoffSize != null && { playoffSize: Number(playoffSize) }),
      },
    });

    res.status(201).json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/by-code/:code", requireAuth, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({
      where: { inviteCode: req.params.code.toUpperCase() },
    });
    if (!league) { res.status(404).json({ error: "Invalid invite code" }); return; }
    res.json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    res.json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
