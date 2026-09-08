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

/**
 * POST /support — a message from the contact form.
 *
 * UNAUTHENTICATED BY DESIGN. The form appears on the marketing footer and
 * inside /docs, and both serve signed-out visitors; gating it would leave those
 * people with no way to reach us at all, which is the opposite of the point.
 * The sender supplies their own email, which is why one flow covers both.
 *
 * `optionalAuth` fills in req.userId when a token happens to be present, so a
 * message from a signed-in user is tied to their account without them having to
 * say who they are — and without a signed-out sender being turned away.
 *
 * THE ROW IS WRITTEN BEFORE THE SEND, and the send is not allowed to fail the
 * request. A provider outage would otherwise return a 500 that reads as "your
 * message vanished" while the message is in fact safely stored. The response
 * says which of the two happened, so the client can be honest about it.
 */
router.post("/", supportLimiter, optionalAuth, async (req: any, res: any, next: any) => {
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
  } catch (err: any) {
    next(err);
    return;
  }
});

export default router;
