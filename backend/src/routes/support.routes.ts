import { Router } from "express";
import { db } from "../db/db";
import { supportMessages } from "../db/schema";
import { eq } from "drizzle-orm";
import { supportLimiter } from "../middleware/rateLimit";
import { optionalAuth } from "../middleware/auth";
import { deliverSupportMessage } from "../services/supportMail";
import { isSupportTopic } from "../lib/supportTopics";

const router = Router();

/** Deliberately loose. The point is to catch a typo, not to police an address. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 4000;

// Unauthenticated so signed-out visitors can reach support. The row is saved
// before sending, and a failed send doesn't fail the request.
router.post("/", supportLimiter, optionalAuth, async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    const body = String(req.body?.message ?? "").trim();
    const topic = isSupportTopic(req.body?.topic) ? req.body.topic : "contact";

    if (!EMAIL.test(email)) {
      res.status(400).json({ error: "Enter an email address we can reply to" });
      return;
    }
    if (!body) {
      res.status(400).json({ error: "Enter a message" });
      return;
    }
    if (body.length > MAX_BODY) {
      res.status(400).json({ error: `Message must be under ${MAX_BODY} characters` });
      return;
    }

    const userId = req.userId ?? null;
    const [row] = await db
      .insert(supportMessages)
      .values({ userId, email, topic, body })
      .returning({ id: supportMessages.id });

    const delivered = await deliverSupportMessage({ email, topic, body, userId });
    if (delivered) {
      await db
        .update(supportMessages)
        .set({ deliveredAt: new Date() })
        .where(eq(supportMessages.id, row.id));
    }

    res.status(201).json({ delivered });
  } catch (err) {
    next(err);
    return;
  }
});

export default router;
