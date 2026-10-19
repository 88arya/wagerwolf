import { Router } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { db } from "../db/db";
import { eq, or } from "drizzle-orm";
import { users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { nextSeasonYear, yearsSinceJoin } from "../services/experience";
import { MIN_AGE } from "../services/age";
import { sanitizeDisplayName, validateDisplayName, validatePersonName } from "../services/displayName";
import { validateAbbreviation } from "../services/abbreviationRules";
import { HELMET_COLOR_LIST } from "../services/helmetColor";
import { memberships, picks, gamePicks, parlays, parlayLegs, leagueMessages } from "../db/schema";
import { releaseSeat } from "../services/leagueSeats";
import { and, inArray } from "drizzle-orm";

const router = Router();

const GOOGLE_CALLBACK_PATH = "/auth/callback";

/** `null` means "not allowed"; "postmessage" is the popup flow's literal. */
// Only redirect URIs on FRONTEND_URL (the CORS list) are accepted; localhost in dev.
function resolveRedirectUri(requested: unknown): string | null {
  // No redirectUri means the popup flow; "postmessage" is Google's literal for it.
  if (requested == null || requested === "") return "postmessage";
  if (typeof requested !== "string") return null;

  let url: URL;
  try { url = new URL(requested); } catch { return null; }
  if (url.pathname !== GOOGLE_CALLBACK_PATH || url.search || url.hash) return null;

  const origins = process.env.FRONTEND_URL?.split(",").map((o) => o.trim()).filter(Boolean);
  if (origins && origins.length > 0) {
    return origins.some((o) => o.replace(/\/$/, "") === url.origin) ? requested : null;
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return local && process.env.NODE_ENV !== "production" ? requested : null;
}

// GET and PATCH /me return the same shape.
const ME_COLUMNS = {
  id: users.id,
  displayName: users.displayName,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  timeZone: users.timeZone,
  ageConfirmedAt: users.ageConfirmedAt,
  defaultAbbreviation: users.defaultAbbreviation,
  defaultHelmetColor: users.defaultHelmetColor,
  deactivatedAt: users.deactivatedAt,
  googleId: users.googleId,
  createdAt: users.createdAt,
} as const;

type MeRow = { [K in keyof typeof ME_COLUMNS]: any };

function mePayload(user: MeRow) {
  const { googleId, ...rest } = user;
  return {
    ...rest,
    hasGoogle: !!googleId,
    helmetPalette: HELMET_COLOR_LIST,
    yearsExperience: yearsSinceJoin(user.createdAt),
    nextSeasonYear: nextSeasonYear(user.createdAt),
  };
}

router.post("/auth/google", authLimiter, async (req, res, next) => {
  try {
    // Either an ID token from Google's button, or an auth code from our own button
    // (exchanged here, where the client secret is).
    const { credential, code, ageConfirmed } = req.body;
    if (!credential && !code) {
      res.status(400).json({ error: "Google credential or code required" });
      return;
    }

    const redirectUri = resolveRedirectUri(req.body.redirectUri);
    if (!redirectUri) {
      res.status(400).json({ error: "Unrecognised redirect URI" });
      return;
    }

    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );

    let idToken: string | undefined = credential;
    if (!idToken) {
      if (!process.env.GOOGLE_CLIENT_SECRET) {
        console.error("[auth] GOOGLE_CLIENT_SECRET is not set — the code exchange cannot run");
        res.status(500).json({ error: "Google sign-in is not configured on this server" });
        return;
      }
      let tokens;
      try {
        ({ tokens } = await client.getToken(code));
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        const reason = e?.response?.data?.error ?? e?.message ?? "unknown";
        console.error("[auth] Google code exchange failed:", reason);
        // 400, not 500: the server is fine, the code was not.
        res.status(400).json({ error: "That sign-in attempt expired. Please try again." });
        return;
      }
      idToken = tokens.id_token ?? undefined;
      if (!idToken) { res.status(400).json({ error: "Google returned no ID token" }); return; }
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) { res.status(400).json({ error: "Invalid Google token" }); return; }

    const { sub: googleId, email, name, given_name, family_name } = payload;
    // From Google, so repair rather than reject.
    const displayName = sanitizeDisplayName(given_name || name);

    let user = await db.query.users.findFirst({
      where: or(eq(users.googleId, googleId!), eq(users.email, email!)),
    });

    if (user) {
      const patch: Record<string, unknown> = {};
      if (!user.googleId) patch.googleId = googleId;
      if (user.deactivatedAt) patch.deactivatedAt = null;
      if (Object.keys(patch).length) {
        const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
        user = updated;
      }
    } else {
      // Age gate is enforced here on account creation, not trusted to the client.
      if (ageConfirmed !== true) {
        res.status(400).json({ error: `You must confirm you are ${MIN_AGE} years of age or older` });
        return;
      }
      const [created] = await db.insert(users).values({
        email: email!,
        name: name || email!,
        displayName,
        googleId,
        // The record the gate is actually worth - see services/age.ts.
        ageConfirmedAt: new Date(),
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
    });
  } catch (err) {
    next(err); return;
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [user] = await db.select(ME_COLUMNS).from(users).where(eq(users.id, req.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(mePayload(user));
  } catch (err) {
    next(err); return;
  }
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const {
      displayName, firstName, lastName, yearsExperience, country, region,
      timeZone, dateOfBirth, ageConfirmedAt, defaultAbbreviation, defaultHelmetColor,
    } = req.body;
    // Derived from createdAt, so reject rather than silently ignore.
    if (yearsExperience !== undefined) {
      res.status(400).json({ error: "Experience is counted from your join date and can't be edited" }); return;
    }
    const patch: Record<string, string | number | null> = {};
    if (displayName !== undefined) {
      const checked = validateDisplayName(displayName);
      if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
      patch.displayName = checked.value;
    }
    if (firstName !== undefined) {
      const checked = validatePersonName(firstName, "First name");
      if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
      patch.firstName = checked.value;
    }
    if (lastName !== undefined) {
      const checked = validatePersonName(lastName, "Last name");
      if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
      patch.lastName = checked.value;
    }
    if (defaultAbbreviation !== undefined) {
      if (!defaultAbbreviation) {
        patch.defaultAbbreviation = null;
      } else {
        const checked = validateAbbreviation(defaultAbbreviation);
        if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
        patch.defaultAbbreviation = checked.value;
      }
    }
    if (defaultHelmetColor !== undefined) {
      if (!defaultHelmetColor) {
        patch.defaultHelmetColor = null;
      } else {
        const c = String(defaultHelmetColor).trim().toLowerCase();
        // Palette only; white is reserved for the ghost user.
        if (!HELMET_COLOR_LIST.includes(c)) {
          res.status(400).json({ error: "Pick a colour from the palette" }); return;
        }
        patch.defaultHelmetColor = c;
      }
    }
    if (dateOfBirth !== undefined || ageConfirmedAt !== undefined) {
      res.status(400).json({ error: "Age confirmation is recorded at sign-up and can't be changed" }); return;
    }
    if (country !== undefined || region !== undefined) {
      res.status(400).json({ error: "Location is no longer stored — only your time zone is" }); return;
    }
    // Validated with Intl rather than a regex, since the zone list changes.
    if (timeZone !== undefined) {
      if (!timeZone) {
        patch.timeZone = null;
      } else {
        const tz = String(timeZone).trim();
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
        } catch {
          res.status(400).json({ error: "Unrecognised time zone" }); return;
        }
        patch.timeZone = tz;
      }
    }

    if (!Object.keys(patch).length) { res.status(400).json({ error: "Nothing to update" }); return; }

    const [user] = await db.update(users)
      .set(patch)
      .where(eq(users.id, req.userId))
      .returning(ME_COLUMNS);
    res.json(mePayload(user));
  } catch (err) {
    next(err); return;
  }
});

// Reversible: signing in again clears it. Seats are released so leagues can
// fill; bets and matchups are kept since they're part of other players' seasons.
router.post("/me/deactivate", requireAuth, async (req, res, next) => {
  try {
    const active = await db.query.memberships.findMany({
      where: and(eq(memberships.userId, req.userId), eq(memberships.status, "ACTIVE")),
    });

    for (const m of active) {
      await db.delete(memberships).where(eq(memberships.id, m.id));
      await releaseSeat(m.leagueId, { isPublicFill: m.isPublicFill });
    }

    // PENDING requests hold no seat, so they just go.
    await db.delete(memberships).where(and(
      eq(memberships.userId, req.userId),
      eq(memberships.status, "PENDING"),
    ));

    await db.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, req.userId));
    res.json({ ok: true, leaguesLeft: active.length });
  } catch (err) {
    next(err); return;
  }
});

router.get("/me/export", requireAuth, async (req, res, next) => {
  try {
    const [user] = await db.select(ME_COLUMNS).from(users).where(eq(users.id, req.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [membershipRows, pickRows, gamePickRows, parlayRows, messageRows] = await Promise.all([
      db.select().from(memberships).where(eq(memberships.userId, req.userId)),
      db.select().from(picks).where(eq(picks.userId, req.userId)),
      db.select().from(gamePicks).where(eq(gamePicks.userId, req.userId)),
      db.select().from(parlays).where(eq(parlays.userId, req.userId)),
      db.select().from(leagueMessages).where(eq(leagueMessages.userId, req.userId)),
    ]);

    const parlayIds = parlayRows.map((p) => p.id);
    const legRows = parlayIds.length
      ? await db.select().from(parlayLegs).where(inArray(parlayLegs.parlayId, parlayIds))
      : [];

    const { googleId, ...safeUser } = user as any;
    res.setHeader("Content-Disposition", 'attachment; filename="wagerwolf-export.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      account: { ...safeUser, hasGoogle: !!googleId },
      memberships: membershipRows,
      picks: pickRows,
      gamePicks: gamePickRows,
      parlays: parlayRows.map((p) => ({
        ...p,
        legs: legRows.filter((l) => l.parlayId === p.id),
      })),
      messages: messageRows,
    });
  } catch (err) {
    next(err); return;
  }
});

// Permanent. Requires { confirm: "DELETE" }. Other players' matchup rows stay.
router.delete("/me", requireAuth, async (req, res, next) => {
  try {
    if (req.body?.confirm !== "DELETE") {
      res.status(400).json({ error: 'Send { "confirm": "DELETE" } to delete this account' });
      return;
    }

    const active = await db.query.memberships.findMany({
      where: and(eq(memberships.userId, req.userId), eq(memberships.status, "ACTIVE")),
    });

    await db.delete(memberships).where(eq(memberships.userId, req.userId));
    for (const m of active) {
      await releaseSeat(m.leagueId, { isPublicFill: m.isPublicFill });
    }

    // No FK cascade on legs, so delete them first.
    const ownParlays = await db.select({ id: parlays.id }).from(parlays).where(eq(parlays.userId, req.userId));
    const ownParlayIds = ownParlays.map((p) => p.id);
    if (ownParlayIds.length) {
      await db.delete(parlayLegs).where(inArray(parlayLegs.parlayId, ownParlayIds));
    }

    await Promise.all([
      db.delete(picks).where(eq(picks.userId, req.userId)),
      db.delete(gamePicks).where(eq(gamePicks.userId, req.userId)),
      db.delete(parlays).where(eq(parlays.userId, req.userId)),
      db.delete(leagueMessages).where(eq(leagueMessages.userId, req.userId)),
    ]);

    await db.delete(users).where(eq(users.id, req.userId));
    res.json({ ok: true, leaguesLeft: active.length });
  } catch (err) {
    next(err); return;
  }
});

export default router;
