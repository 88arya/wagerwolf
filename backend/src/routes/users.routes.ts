import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/", async (req: any, res: any) => {
  try {
    const { email, password, name, displayName } = req.body;
    if (!email || !password || !name || !displayName) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashed, name, displayName, isAdmin: false },
    });

    const token = jwt.sign(
      { userId: user.id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.status(201).json({ token, userId: user.id, displayName: user.displayName, isAdmin: user.isAdmin });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Email already in use" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.post("/login", async (req: any, res: any) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { res.status(401).json({ error: "Invalid email or password" }); return; }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { res.status(401).json({ error: "Invalid email or password" }); return; }

    const token = jwt.sign(
      { userId: user.id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.json({ token, userId: user.id, displayName: user.displayName, isAdmin: user.isAdmin });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", requireAuth, async (req: any, res: any) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, displayName: true, email: true, isAdmin: true },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
