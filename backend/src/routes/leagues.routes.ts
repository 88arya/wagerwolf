import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { name, startingBalance, weeklyAllowance } = req.body;

  const league = await prisma.league.create({
    data: { name, startingBalance, weeklyAllowance },
  });

  res.status(201).json(league);
});

router.get("/:id", async (req, res) => {
  const league = await prisma.league.findUnique({ where: { id: req.params.id } });
  if (!league) { res.status(404).json({ error: "League not found" }); return; }
  res.json(league);
});

export default router;
