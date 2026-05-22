import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

async function sendResetEmail(email: string, name: string, resetUrl: string) {
  if (!process.env.SMTP_HOST) {
    console.log(`\n[DEV] Password reset for ${email}:\n${resetUrl}\n`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to: email,
    subject: "Reset your Playbook password",
    html: `<p>Hi ${name},</p><p><a href="${resetUrl}">Click here</a> to reset your Playbook password. Link expires in 1 hour.</p>`,
  });
}

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
      data: { email, password: hashed, name, displayName },
    });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.status(201).json({ token, userId: user.id, displayName: user.displayName });
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
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

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

router.post("/forgot-password", async (req: any, res: any) => {
  const OK = { message: "If that email exists, a reset link has been sent" };
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: "Email is required" }); return; }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { res.json(OK); return; }

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    await sendResetEmail(user.email, user.displayName, resetUrl);

    res.json(OK);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/reset-password", async (req: any, res: any) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) { res.status(400).json({ error: "Token and password are required" }); return; }
    if (password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: "Invalid or expired reset link" }); return;
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { password: hashed } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
    ]);

    res.json({ message: "Password reset successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
