import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { number, startDate, endDate } = req.body;
    if (!number || !startDate || !endDate) {
      res.status(400).json({ error: "number, startDate, and endDate are required" });
      return;
    }

    const week = await prisma.week.create({
      data: { number: Number(number), startDate: new Date(startDate), endDate: new Date(endDate) },
    });

    const leagues = await prisma.league.findMany({ include: { memberships: true } });
    for (const league of leagues) {
      for (const membership of league.memberships) {
        await prisma.membership.update({
          where: { id: membership.id },
          data: { balance: { increment: league.weeklyAllowance } },
        });
      }
    }

    res.status(201).json(week);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { current } = req.query;

    if (current === "true") {
      const week = await prisma.week.findFirst({
        where: { resolved: false },
        orderBy: { number: "desc" },
        include: { games: { include: { props: { include: { player: true } } } } },
      });
      res.json(week ? [week] : []);
      return;
    }

    const weeks = await prisma.week.findMany({
      orderBy: { number: "desc" },
      include: { games: { include: { props: { include: { player: true } } } } },
    });
    res.json(weeks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const week = await prisma.week.findUnique({
      where: { id: req.params.id },
      include: { games: { include: { props: { include: { player: true } } } } },
    });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    res.json(week);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/lock", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const week = await prisma.week.findUnique({ where: { id: req.params.id } });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }

    const updated = await prisma.week.update({
      where: { id: req.params.id },
      data: { locked: !week.locked },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/resolve", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { id: weekId } = req.params;
    const { results } = req.body as { results: { propId: string; result: number }[] };

    const week = await prisma.week.findUnique({ where: { id: weekId } });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }

    for (const { propId, result } of results) {
      await prisma.prop.update({ where: { id: propId }, data: { result } });
    }

    const picks = await prisma.pick.findMany({
      where: { outcome: "PENDING", prop: { game: { weekId } } },
      include: { prop: true },
    }) as any[];

    for (const pick of picks) {
      const { result } = pick.prop;
      if (result === null) continue;

      const won =
        (pick.direction === "OVER" && result > pick.prop.line) ||
        (pick.direction === "UNDER" && result < pick.prop.line);

      const outcome = won ? "WIN" : "LOSS";

      await prisma.pick.update({ where: { id: pick.id }, data: { outcome } });

      if (won) {
        // stake was already deducted at bet time — return stake + equal profit
        await prisma.membership.updateMany({
          where: { userId: pick.userId, leagueId: pick.leagueId },
          data: { balance: { increment: pick.stake * 2 } },
        });
      }
    }

    // floor any negative balances at 0
    await prisma.membership.updateMany({
      where: { balance: { lt: 0 } },
      data: { balance: 0 },
    });

    await prisma.week.update({ where: { id: weekId }, data: { resolved: true, locked: true } });
    res.json({ message: "Week resolved", weekId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
