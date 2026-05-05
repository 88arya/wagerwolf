import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { email, password, name, displayName } = req.body;

  const user = await prisma.user.create({
    data: { email, password, name, displayName },
  });

  res.status(201).json(user);
});

export default router;
