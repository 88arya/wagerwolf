import { Router } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { db } from "../db/db";
import { eq, or } from "drizzle-orm";
import { users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/auth/google", authLimiter, async (req: any, res: any) => {
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

    const { sub: googleId, email, name, given_name, family_name } = payload;
    const displayName = (given_name || name || "Player").slice(0, 20);

    let user = await db.query.users.findFirst({
      where: or(eq(users.googleId, googleId!), eq(users.email, email!)),
    });

    if (user) {
      if (!user.googleId) {
        const [updated] = await db.update(users).set({ googleId }).where(eq(users.id, user.id)).returning();
        user = updated;
      }
    } else {
      const [created] = await db.insert(users).values({
        email: email!,
        name: name || email!,
        displayName,
        googleId,
        // Seeded from Google where it supplies them, so onboarding arrives
        // pre-filled rather than blank. Google does not always return
        // family_name, hence the null — which keeps the onboarding gate closed
        // until the user confirms both.
        firstName: given_name || null,
        lastName: family_name || null,
      }).returning();
      user = created;
    }

    const token = jwt.sign({ userId: user!.id }, process.env.JWT_SECRET!, { expiresIn: "30d" });
    res.json({
      token,
      userId: user!.id,
      displayName: user!.displayName,
      firstName: user!.firstName,
      lastName: user!.lastName,
      // The client routes to onboarding on this rather than deciding for itself.
      needsOnboarding: !user!.firstName || !user!.lastName,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", requireAuth, async (req: any, res: any) => {
  try {
    const [user] = await db.select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    }).from(users).where(eq(users.id, req.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/me", requireAuth, async (req: any, res: any) => {
  try {
    const { displayName, firstName, lastName } = req.body;
    // Every field is optional on its own, but the request has to carry at least
    // one — onboarding sends the two names, the settings page sends only the
    // display name, and neither should have to send the other's fields.
    const patch: Record<string, string> = {};
    if (displayName !== undefined) {
      if (!displayName?.trim()) { res.status(400).json({ error: "Display name is required" }); return; }
      patch.displayName = displayName.trim();
    }
    if (firstName !== undefined) {
      if (!firstName?.trim()) { res.status(400).json({ error: "First name is required" }); return; }
      patch.firstName = firstName.trim();
    }
    if (lastName !== undefined) {
      if (!lastName?.trim()) { res.status(400).json({ error: "Last name is required" }); return; }
      patch.lastName = lastName.trim();
    }
    if (!Object.keys(patch).length) { res.status(400).json({ error: "Nothing to update" }); return; }

    const [user] = await db.update(users)
      .set(patch)
      .where(eq(users.id, req.userId))
      .returning({ id: users.id, displayName: users.displayName, email: users.email, firstName: users.firstName, lastName: users.lastName });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
