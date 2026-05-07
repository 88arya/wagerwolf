import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req: any, res: any) => {
  try {
    const { name, weeklyAllowance } = req.body;
    if (!name || !weeklyAllowance || Number(weeklyAllowance) <= 0) {
      res.status(400).json({ error: "Name and a positive weekly allowance are required" });
      return;
    }
    const league = await prisma.league.create({
      data: { name, weeklyAllowance: Number(weeklyAllowance) },
    });
    res.status(201).json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    res.json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
