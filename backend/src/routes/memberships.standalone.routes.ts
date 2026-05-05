import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.get("/", async (req, res) => {
  const { userId } = req.query;

  const memberships = await prisma.membership.findMany({
    where: userId ? { userId: String(userId) } : undefined,
    include: { league: true },
  });

  res.json(memberships);
});

export default router;
