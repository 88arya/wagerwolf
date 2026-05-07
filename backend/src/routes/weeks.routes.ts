import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { number, startDate, endDate } = req.body;

  const week = await prisma.week.create({
    data: { number, startDate: new Date(startDate), endDate: new Date(endDate) },
  });

  // Distribute weekly allowance to every member in every league
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
});

router.get("/", async (req, res) => {
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
});

router.get("/:id", async (req, res) => {
  const week = await prisma.week.findUnique({
    where: { id: req.params.id },
    include: {
      games: {
        include: { props: { include: { player: true } } },
      },
    },
  });

  if (!week) {
    res.status(404).json({ error: "Week not found" });
    return;
  }

  res.json(week);
});

// POST /weeks/:id/resolve
// Body: { results: [{ propId: string, result: number }, ...] }
router.post("/:id/resolve", async (req, res) => {
  const { id: weekId } = req.params;
  const { results } = req.body as { results: { propId: string; result: number }[] };

  const week = await prisma.week.findUnique({ where: { id: weekId } });

  if (!week) {
    res.status(404).json({ error: "Week not found" });
    return;
  }

  if (week.resolved) {
    res.status(400).json({ error: "Week already resolved" });
    return;
  }

  // 1. Save result on each prop
  for (const { propId, result } of results) {
    await prisma.prop.update({ where: { id: propId }, data: { result } });
  }

  // 2. Load all pending picks for this week
  const picks = await prisma.pick.findMany({
    where: {
      outcome: "PENDING",
      prop: { game: { weekId } },
    },
    include: { prop: true },
  }) as any[];

  // 3. Evaluate each pick and update membership balance
  for (const pick of picks) {
    const { result } = pick.prop;

    if (result === null) continue;

    const won =
      (pick.direction === "OVER" && result > pick.prop.line) ||
      (pick.direction === "UNDER" && result < pick.prop.line);

    const outcome = won ? "WIN" : "LOSS";
    const balanceDelta = won ? pick.stake : -pick.stake;

    await prisma.pick.update({ where: { id: pick.id }, data: { outcome } });

    await prisma.membership.updateMany({
      where: { userId: pick.userId, leagueId: pick.leagueId },
      data: { balance: { increment: balanceDelta } },
    });
  }

  // 4. Mark week resolved
  await prisma.week.update({ where: { id: weekId }, data: { resolved: true } });

  res.json({ message: "Week resolved", weekId });
});

export default router;
