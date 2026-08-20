import { Router } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { db } from "../db/db";
import { eq, or } from "drizzle-orm";
import { users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { nextSeasonYear, seasonsPlayed } from "../services/experience";
import { checkDateOfBirth } from "../services/age";
import { HELMET_COLOR_LIST } from "../services/helmetColor";
import { memberships } from "../db/schema";
import { releaseSeat } from "../services/leagueSeats";
import { and } from "drizzle-orm";

const router = Router();

/**
 * The columns behind /users/me, and the shape both GET and PATCH answer with.
 *
 * Shared deliberately. They were two hand-written lists, and PATCH's was the
 * shorter one — so saving anything replaced the client's user object with a
 * partial copy, and the settings page lost the helmet palette, the Google
 * status and the derived season counts on every save. The colour swatches
 * looked broken because the save wiped the very list they render from.
 *
 * If a field is added here it appears in both, which is the point.
 */
const ME_COLUMNS = {
  id: users.id,
  displayName: users.displayName,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  timeZone: users.timeZone,
  dateOfBirth: users.dateOfBirth,
  defaultAbbreviation: users.defaultAbbreviation,
  defaultHelmetColor: users.defaultHelmetColor,
  deactivatedAt: users.deactivatedAt,
  googleId: users.googleId,
  createdAt: users.createdAt,
} as const;

type MeRow = { [K in keyof typeof ME_COLUMNS]: any };

function mePayload(user: MeRow) {
  // googleId is an identifier, not something to hand a browser. The client only
  // needs to know an account is linked, so it gets a boolean.
  const { googleId, ...rest } = user;
  return {
    ...rest,
    hasGoogle: !!googleId,
    helmetPalette: HELMET_COLOR_LIST,
    yearsExperience: seasonsPlayed(user.createdAt),
    nextSeasonYear: nextSeasonYear(user.createdAt),
  };
}

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
      // Signing in reverses a deactivation. That is the whole of "reversible":
      // no support ticket, no separate reactivate button to find. Memberships
      // are NOT restored — the seats were released and may be gone — so the
      // account comes back empty and rejoins like anyone else.
      const patch: Record<string, unknown> = {};
      if (!user.googleId) patch.googleId = googleId;
      if (user.deactivatedAt) patch.deactivatedAt = null;
      if (Object.keys(patch).length) {
        const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
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
      // dateOfBirth counts: the age gate went in after these accounts existed,
      // so anyone without one has not answered it and is sent to ask.
      needsOnboarding: !user!.firstName || !user!.lastName || !user!.dateOfBirth,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", requireAuth, async (req: any, res: any) => {
  try {
    const [user] = await db.select(ME_COLUMNS).from(users).where(eq(users.id, req.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    // Computed, never stored and never accepted from the client — see
    // services/experience.ts. Sent under the same key the client already reads
    // so nothing downstream has to know it stopped being a column.
    res.json(mePayload(user));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/me", requireAuth, async (req: any, res: any) => {
  try {
    const {
      displayName, firstName, lastName, yearsExperience, country, region,
      timeZone, dateOfBirth, defaultAbbreviation, defaultHelmetColor,
    } = req.body;
    // Experience is tenure, so there is nothing to write. Rejected loudly
    // rather than ignored: a client that thinks it just saved a value it
    // cannot save is worse off than one told plainly that it can't.
    if (yearsExperience !== undefined) {
      res.status(400).json({ error: "Experience is counted from your join date and can't be edited" }); return;
    }
    // Every field is optional on its own, but the request has to carry at least
    // one — onboarding sends the two names, the settings page sends only the
    // display name, and neither should have to send the other's fields.
    const patch: Record<string, string | number | null> = {};
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
    // Defaults for per-league identity. Both clearable — null means "generate
    // one", which is what happened for every join before these existed.
    if (defaultAbbreviation !== undefined) {
      if (!defaultAbbreviation) {
        patch.defaultAbbreviation = null;
      } else {
        const a = String(defaultAbbreviation).trim().toUpperCase();
        if (!/^[A-Z]{2,3}$/.test(a)) {
          res.status(400).json({ error: "Abbreviation must be 2 or 3 letters" }); return;
        }
        patch.defaultAbbreviation = a;
      }
    }
    if (defaultHelmetColor !== undefined) {
      if (!defaultHelmetColor) {
        patch.defaultHelmetColor = null;
      } else {
        const c = String(defaultHelmetColor).trim().toLowerCase();
        // Restricted to the palette rather than any hex: the colours are the 32
        // NFL teams' and a free-text field would let someone pick the page
        // background, or white, which is reserved for the ghost user.
        if (!HELMET_COLOR_LIST.includes(c)) {
          res.status(400).json({ error: "Pick a colour from the palette" }); return;
        }
        patch.defaultHelmetColor = c;
      }
    }
    // Age gate. Write-once: unlike country and region this is not a preference
    // that changes, and leaving it editable would turn the one field the gate
    // rests on into something a user can walk back the day after clearing it.
    // Not clearable either — there is no `null` branch here on purpose.
    if (dateOfBirth !== undefined) {
      const [existing] = await db.select({ dateOfBirth: users.dateOfBirth })
        .from(users).where(eq(users.id, req.userId)).limit(1);
      if (existing?.dateOfBirth) {
        res.status(400).json({ error: "Date of birth can't be changed. Contact support if it's wrong." }); return;
      }
      const check = checkDateOfBirth(dateOfBirth);
      if (!check.ok) { res.status(400).json({ error: check.error }); return; }
      patch.dateOfBirth = check.value;
    }
    // Country and region are gone. They were profile-only once the league
    // directory was deleted, and the only thing the app ever wanted location
    // FOR was time — which the browser answers directly, and better: deriving a
    // time zone from a country is hopeless when the US spans six of them.
    // Rejected rather than ignored, on the same reasoning as yearsExperience — a
    // client that thinks it saved something it cannot save is worse off than one
    // told plainly.
    if (country !== undefined || region !== undefined) {
      res.status(400).json({ error: "Location is no longer stored — only your time zone is" }); return;
    }
    // IANA zone name, e.g. "America/Detroit". Not a preference and not a form
    // field: the client reads it off the device and re-sends it whenever it
    // changes, so someone who travels gets local kickoff times without touching
    // a setting. Clearable, hence the `!== undefined` test.
    //
    // Validated by asking Intl to build a formatter with it rather than by
    // pattern-matching. The zone database is revised a few times a year — zones
    // are added, renamed and retired — so a regex here would be wrong the moment
    // it shipped, and would reject people in newly named zones.
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Soft, reversible deactivation.
 *
 * Sets `deactivatedAt` and stands the user's ACTIVE memberships down. Signing in
 * with Google again clears the flag — see the auth route — so there is no
 * separate reactivate endpoint and no support ticket.
 *
 * SEATS ARE RELEASED, and that is the part that is not reversible. A league of
 * ten holding a seat for someone who left cannot fill or start, which penalises
 * nine other people for one person's decision. So the seat goes back and the
 * league can move on; if the user returns, they rejoin like anyone else.
 *
 * Bets, picks and matchup history are untouched. Deleting them would rewrite
 * other people's seasons — their wins were against this user.
 */
router.post("/me/deactivate", requireAuth, async (req: any, res: any) => {
  try {
    const active = await db.query.memberships.findMany({
      where: and(eq(memberships.userId, req.userId), eq(memberships.status, "ACTIVE")),
    });

    for (const m of active) {
      await db.delete(memberships).where(eq(memberships.id, m.id));
      // Mirrors the accounting in services/joinLeague: the counter is the lock,
      // so a membership that goes away has to hand its seat back or the league
      // stays full forever.
      await releaseSeat(m.leagueId, { isPublicFill: m.isPublicFill });
    }

    // PENDING requests hold no seat, so they just go.
    await db.delete(memberships).where(and(
      eq(memberships.userId, req.userId),
      eq(memberships.status, "PENDING"),
    ));

    await db.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, req.userId));
    res.json({ ok: true, leaguesLeft: active.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
