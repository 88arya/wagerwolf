import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req: any, res: any) => {
  try {
    const { email, password, name, displayName } = req.body;
    if (!email || !password || !name || !displayName) {
      res.status(400).json({ error: "email, password, name, and displayName are required" });
      return;
    }
    const user = await prisma.user.create({
      data: { email, password, name, displayName },
    });
    res.status(201).json(user);
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Email already in use" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.get("/", async (req: any, res: any) => {
  try {
    const { email } = req.query;
    const user = await prisma.user.findUnique({ where: { email: String(email) } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
