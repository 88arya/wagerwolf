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

router.get("/", async (req, res) => {
  const { email } = req.query;

  const user = await prisma.user.findUnique({
    where: { email: String(email) },
  });

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(user);
});

export default router;
