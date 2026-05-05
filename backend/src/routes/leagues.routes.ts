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

export default router;
