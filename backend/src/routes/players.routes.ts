import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { name, team, position } = req.body;

  const player = await prisma.player.create({
    data: { name, team, position },
  });

  res.status(201).json(player);
});

router.get("/", async (req, res) => {
  const players = await prisma.player.findMany();
  res.json(players);
});

export default router;
