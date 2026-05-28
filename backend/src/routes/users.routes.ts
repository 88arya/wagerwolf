import { Router } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/auth/google", async (req: any, res: any) => {
  try {
    const { credential } = req.body;
    if (!credential) { res.status(400).json({ error: "Google credential required" }); return; }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) { res.status(400).json({ error: "Invalid Google token" }); return; }

    const { sub: googleId, email, name, given_name } = payload;
    const displayName = (given_name || name || "Player").slice(0, 20);

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId } });
      }
    } else {
      user = await prisma.user.create({
        data: { email: email!, name: name || email!, displayName, googleId },
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: "30d" });
    res.json({ token, userId: user.id, displayName: user.displayName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", requireAuth, async (req: any, res: any) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, displayName: true, email: true },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/me", requireAuth, async (req: any, res: any) => {
  try {
    const { displayName } = req.body;
    if (!displayName?.trim()) { res.status(400).json({ error: "Display name is required" }); return; }
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { displayName: displayName.trim() },
      select: { id: true, displayName: true, email: true },
    });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
