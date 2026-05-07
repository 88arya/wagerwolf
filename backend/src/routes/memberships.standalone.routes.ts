import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.get("/", async (req: any, res: any) => {
  try {
    const { userId } = req.query;

    const memberships = await prisma.membership.findMany({
      where: userId ? { userId: String(userId) } : undefined,
      include: { league: true },
    });

    res.json(memberships);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
