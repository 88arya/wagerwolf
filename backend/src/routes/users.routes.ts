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
/**
 * Where the full-tab Google flow sends the browser back to.
 *
 * Kept here rather than taken from the request alone, because the client is
 * telling the server which URL to hand Google — and an unchecked value is a
 * server that will exchange a code against any redirect_uri someone names.
 * Google's own matching makes that hard to exploit (the code is only valid for
 * the URI it was issued to), but "hard to exploit" is not a reason to accept
 * arbitrary input.
 *
 * Trust comes from FRONTEND_URL, which already lists the deployed origins for
 * CORS — so there is one list of trusted frontends rather than two that can
 * disagree. Unset in dev, where localhost is accepted instead, matching how
 * cors() is configured in index.ts.
 */
const GOOGLE_CALLBACK_PATH = "/auth/callback";

/** `null` means "not allowed"; "postmessage" is the popup flow's literal. */
function resolveRedirectUri(requested: unknown): string | null {
  // No redirectUri at all is the popup code client, which posts back to its
  // opener rather than redirecting. "postmessage" is a literal Google defines
  // for exactly that, not a placeholder.
  if (requested == null || requested === "") return "postmessage";
  if (typeof requested !== "string") return null;

  let url: URL;
  try { url = new URL(requested); } catch { return null; }
  if (url.pathname !== GOOGLE_CALLBACK_PATH || url.search || url.hash) return null;

  const origins = process.env.FRONTEND_URL?.split(",").map((o) => o.trim()).filter(Boolean);
  if (origins && origins.length > 0) {
    return origins.some((o) => o.replace(/\/$/, "") === url.origin) ? requested : null;
  }

  // Dev: no FRONTEND_URL configured, same fallback CORS takes. http is allowed
  // here and only here — a localhost callback cannot be served over https
  // without a certificate, and this branch never runs in production.
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return local && process.env.NODE_ENV !== "production" ? requested : null;
}

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
  // googleId is an identifier, not something to hand a browser. The client only
  // needs to know an account is linked, so it gets a boolean.
  const { googleId, ...rest } = user;
  return {
    ...rest,
    hasGoogle: !!googleId,
    helmetPalette: HELMET_COLOR_LIST,
    // Tenure, not seasons — the account page reads this as "Experience" and
    // states it in years. See services/experience.ts for why the two differ.
    yearsExperience: yearsSinceJoin(user.createdAt),
    nextSeasonYear: nextSeasonYear(user.createdAt),
  };
}

router.post("/auth/google", authLimiter, async (req: any, res: any) => {
  try {
    // Two ways in, both ending at the same verified ID token.
    //
    //   `credential` — an ID token straight from Google's own GSI button.
    //   `code`       — an authorization code from the JS code client, which is
    //                  what lets the frontend draw its OWN button instead of
    //                  embedding Google's unstyleable iframe. Google hands the
    //                  browser a code rather than a token in this flow, so the
    //                  exchange happens here, where the client secret can live.
    //
    // The credential path is kept because it costs nothing and is the fallback
    // if the code flow ever needs backing out.
    const { credential, code, ageConfirmed } = req.body;
    if (!credential && !code) {
      res.status(400).json({ error: "Google credential or code required" });
      return;
    }

    // Google checks that the redirect_uri in the exchange matches the one the
    // code was issued against, so this cannot be a constant any more: the
    // full-tab flow issues codes against a real callback URL. A request that
    // sends no redirectUri is the old popup flow and still gets "postmessage".
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
      // Fail loudly rather than letting Google reject the exchange with
      // something opaque: a missing secret is a deployment problem, not a
      // user's bad input.
      if (!process.env.GOOGLE_CLIENT_SECRET) {
        console.error("[auth] GOOGLE_CLIENT_SECRET is not set — the code exchange cannot run");
        res.status(500).json({ error: "Google sign-in is not configured on this server" });
        return;
      }
      // Google's own wording here is for us, not for the person signing in:
      // a rejected exchange surfaces as "invalid_grant", which means nothing to
      // a user and would be shown to them verbatim by the generic catch below.
      // The real reason is almost always a code that has already been redeemed
      // or has expired, and the fix for both is to press the button again.
      let tokens;
      try {
        ({ tokens } = await client.getToken(code));
      } catch (err: any) {
        const reason = err?.response?.data?.error ?? err?.message ?? "unknown";
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
    // Sanitised, not validated: this name came from Google, not from a person
    // typing, and a profile reading "Jo" or "Renée" must not fail sign-in over
    // a display-name rule. sanitizeDisplayName falls back to "Player".
    const displayName = sanitizeDisplayName(given_name || name);

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
      // THE AGE GATE, enforced here rather than trusted to the checkbox.
      //
      // A tick in a browser is a claim the client makes about itself, and the
      // last version of this shipped a gate that only the client enforced — so
      // it did not enforce anything. Refusing account creation is what makes
      // the box mean something: there is no way to exist in this system without
      // having answered.
      //
      // Only on the create branch. A returning user answered when they signed
      // up, and re-asking at every login would be asking a question we already
      // have on record.
      if (ageConfirmed !== true) {
        res.status(400).json({ error: `You must confirm you are ${MIN_AGE} years of age or older` });
        return;
      }
      const [created] = await db.insert(users).values({
        email: email!,
        name: name || email!,
        displayName,
        googleId,
        // The record the gate is actually worth — see services/age.ts.
        ageConfirmedAt: new Date(),
        // Whatever Google supplies, and null when it does not — family_name in
        // particular is often absent. Nothing is asked to fill the gap: the
        // real name is only rendered in the account menu, which falls back to
        // the display name, and no screen collects it any more.
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
      timeZone, dateOfBirth, ageConfirmedAt, defaultAbbreviation, defaultHelmetColor,
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
    // Defaults for per-league identity. Both clearable — null means "generate
    // one", which is what happened for every join before these existed.
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
        // Restricted to the palette rather than any hex: the colours are the 32
        // NFL teams' and a free-text field would let someone pick the page
        // background, or white, which is reserved for the ghost user.
        if (!HELMET_COLOR_LIST.includes(c)) {
          res.status(400).json({ error: "Pick a colour from the palette" }); return;
        }
        patch.defaultHelmetColor = c;
      }
    }
    // The age confirmation is not writable. It is stamped once when the account
    // is created and there is no screen that can revisit it — rejected loudly
    // rather than ignored, on the same reasoning as yearsExperience below.
    if (dateOfBirth !== undefined || ageConfirmedAt !== undefined) {
      res.status(400).json({ error: "Age confirmation is recorded at sign-up and can't be changed" }); return;
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
