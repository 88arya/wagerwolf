# Playbook — Claude Handoff

Fantasy sports betting app for friend groups. NFL weekly structure, player props + game lines, head-to-head matchups, playoffs, champion. Fake money, real NFL data.

---

## UI Color Palette

Only three colors are used in the UI:
- **White** — backgrounds, text on dark surfaces
- **Grey** — `var(--text-2)`, `var(--text-3)`, `var(--surface-3)`, borders, muted labels
- **Royal Blue `#2563EB`** — the single accent/feature color; used via `var(--accent)` in CSS and `const ACCENT = "#2563EB"` in components. Applied to: active states, odds numbers, underlines, selected borders, buttons. Do NOT use other blues for UI chrome — team colors are the only exception.

---

## Stack

- **Frontend**: Next.js 14 App Router, TypeScript — `frontend/`
- **Backend**: Express + Prisma, TypeScript, ES2020 target — `backend/`
- **DB**: Prisma-hosted Postgres (`prisma+postgres` protocol, local ports 51213/51214)
- **Auth**: JWT (stored in localStorage), `requireAuth` middleware on protected routes

---

## Dev startup

```bash
# Terminal 1 — start local Prisma DB (must run first)
cd backend && npx prisma dev

# Terminal 2 — backend
cd backend && npm run dev     # port 5000

# Terminal 3 — frontend
cd frontend && npm run dev    # port 3000
```

---

## Prisma rules (critical)

- **Never `prisma migrate dev`** — always use `npx prisma db push`
- Enum changes require `db push` before the backend will compile
- ES2020 target: use `.split("_").join(" ")` not `.replaceAll("_", " ")`
- Use `Partial<Record<StatType, T>>` when not all stat types need a value; always guard with `if (!value) continue` before using the lookup
- See `backend/CLAUDE.md` for full Prisma rules

---

## Architecture

### Frontend pages

| Route | Purpose |
|---|---|
| `/` | Login / signup |
| `/leagues` | List joined leagues, join/create |
| `/leagues/[leagueId]` | League home: standings, matchup, games, chat, recap |
| `/leagues/[leagueId]/bet` | Bet page: game selector, QB/rushing/receiving/defense/kicking prop tabs, game lines tab, parlay slip |
| `/leagues/[leagueId]/history` | All picks/gamepicks/parlays with outcomes |
| `/leagues/[leagueId]/leaderboard` | Full standings (W-L, balance, rank) |
| `/leagues/[leagueId]/members/[userId]` | Member profile with stats |
| `/leagues/[leagueId]/settings` | Commissioner: season config + betting limits |
| `/settings` | User: display name, avatar link |
| `/forgot-password`, `/reset-password` | Password reset flow |
| `/admin` | Admin panel: weeks, games, props, players, sync, resolve |

> **Note:** History (`/history`) and Leaderboard (`/leaderboard`) pages still exist as routes but are removed from the bottom nav. Bottom nav shows: Home, Bet, and (commissioner only) Manage.

### Backend routes

| Mount | File | Purpose |
|---|---|---|
| `/users` | users.routes.ts | Auth, profile, password reset |
| `/leagues` | leagues.routes.ts | CRUD, invite codes |
| `/leagues/:id` | memberships.routes.ts | Members, feed, matchups, recap, chat |
| `/memberships` | memberships.standalone.routes.ts | Join/leave by code |
| `/weeks` | weeks.routes.ts | Week CRUD, resolve |
| `/games` | games.routes.ts | Game CRUD |
| `/players` | players.routes.ts | Player CRUD + image lookup |
| `/props` | props.routes.ts | Prop CRUD |
| `/picks` | picks.routes.ts | Pick placement + cashout |
| `/gamelines` | gamelines.routes.ts | Game line CRUD |
| `/gamepicks` | gamepicks.routes.ts | Game pick placement + cashout |
| `/parlays` | parlays.routes.ts | Parlay placement + cashout |
| `/sync` | sync.routes.ts | SportsGameOdds odds sync + fake sync |
| `/espn` | espn.routes.ts | ESPN game sync + auto-resolve |
| `/leagues` (season) | season.routes.ts | Start season, bracket, advance rounds |
| `/admin` | admin.routes.ts | Admin-only operations |

### Key services

- `backend/src/services/fakeSync.ts` — generates fake prop lines for real players; `seedFakePropsForWeek(weekId)` is the main export
- `backend/src/services/startupSeed.ts` — runs on startup via `app.listen`; seeds all unresolved weeks that are missing new stat types
- `backend/src/services/espnApi.ts` — ESPN box score + game schedule fetching
- `backend/src/services/oddsApi.ts` — SportsGameOdds API integration
- `backend/src/services/abbreviation.ts` — `generateAbbreviation(displayName)`: initials for multi-word names, first 3 chars for single-word; called on all 4 join paths
- `backend/src/services/leagueName.ts` — `generateLeagueName()`: random real NFL location + random real NFL nickname + year + "League"; used by all `ensureOpenPublicLeague` calls and admin league creation

---

## Data model (key relationships)

```
League → Membership (users in league, with balance)
       → Matchup (weekly head-to-head)
       → Pick / GamePick / Parlay (bets scoped to league)
       → LeagueMessage (chat)

Week → Game → Prop → Pick / ParlayLeg
            → GameLine → GamePick / ParlayLeg

Player → Prop
```

### Per-league identity (Membership fields)
- `helmetColor` — unique hex color per league, auto-assigned on join via `pickHelmetColor()`
- `displayName` — per-league display name (falls back to `User.displayName` if empty)
- `abbreviation` — 2–3 uppercase letters, auto-generated on join via `generateAbbreviation()`
- All leaderboard/feed/chat/matchup endpoints use `m.displayName || m.user.displayName` fallback pattern

### StatType enum (22 values)
`PASSING_YARDS`, `PASSING_TOUCHDOWNS`, `PASSING_COMPLETIONS`, `PASSING_ATTEMPTS`, `PASSING_INTERCEPTIONS`, `PASSING_LONGEST`, `RUSHING_YARDS`, `RUSHING_TOUCHDOWNS`, `RUSHING_ATTEMPTS`, `RUSHING_LONGEST`, `RECEIVING_YARDS`, `RECEIVING_TOUCHDOWNS`, `RECEIVING_LONGEST`, `RECEIVING_TARGETS`, `RECEPTIONS`, `SACKS`, `TACKLES_ASSISTS`, `DEFENSIVE_INTERCEPTIONS`, `FIELD_GOALS_MADE`, `FIELD_GOAL_LONGEST`, `KICKING_POINTS`, `EXTRA_POINTS_MADE`, `TOUCHDOWNS`

### League.startWeek
Controls which weeks are visible to the league. The weeks API filters to `weekNumber >= startWeek`. Seed must populate ALL unresolved weeks, not just week 1.

### Game.status
`SCHEDULED` | `LIVE` | `FINAL` | `CANCELLED` — currently only SCHEDULED and FINAL are set (no live polling yet)

### Bet locking
Bets are locked server-side when `game.gameDate <= now`. `Week.locked` is a separate manual admin toggle used as a fallback.

---

## Fake data / seeding

Real players from ESPN (with ESPN headshots) + fake prop lines. No live odds API hit needed.

- `fakeSync.ts` has `FAKE_PLAYERS` (QB/RB/WR/TE/DE/LB/K), prop templates per position, `seedFakePropsForWeek(weekId)`
- Team names in DB are **abbreviations** (KC, BUF, BAL, PHI…) — FAKE_PLAYERS must match
- Startup seed: runs every boot, idempotent, detects missing new stat types and re-seeds

### ESPN images
- URL: `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`
- ESPN CDN blocks requests with a `Referer` header — all `<img>` tags must have `referrerPolicy="no-referrer"`
- Already set in `frontend/components/PlayerAvatar.tsx`

---

## Production data flow (what's manual today, target: automated)

1. Admin syncs ESPN games for the week (`POST /espn/games/:weekId`)
2. Admin syncs odds from SportsGameOdds (`POST /sync/week/:weekId`) — or fake sync for dev
3. Games kick off → bets auto-lock (server-side gameDate check)
4. Admin triggers auto-resolve after Monday Night Game (`POST /espn/resolve/:weekId`)
   - Fetches ESPN box scores, evaluates all props + game lines, credits/debits balances, resolves matchups, marks week resolved

---

## What's built vs what's missing

### Built
- Auth (signup/login/forgot password/reset password)
- Leagues (create, invite code, join, commissioner controls)
- Season structure (regular season schedule, playoffs, consolation bracket, champion)
- Betting: props (22 stat types), game lines (ML/spread/total), parlays
- Bet limits (max stake, max bets/week, max parlay legs)
- Parlay slip (DraftKings-style, conflict detection, compound odds)
- Parlay conflict guardrails: blocks same-market opposite sides AND cross-market conflicts (ML_HOME + SPREAD_AWAY) at both click time and submission time; `SlipLeg` carries `gameId` for game-scoped conflict detection
- Feed (members see each other's bets after kickoff, `feedVisibility` setting)
- Member profile page with stats
- Weekly recap (shown on league home when week resolved)
- Leaderboard, history, cashout
- Admin panel (full control)
- Auto-resolve via ESPN
- Display name / avatar settings
- Chat (LeagueMessage) — sliding drawer panel on league home, polls every 5s when open, bubble UI (own messages right/blue, others left/grey)
- Per-league identity: helmet color + display name + abbreviation on `Membership`; single edit modal on league home user card; all join paths auto-generate abbreviation
- Public league names generated via `generateLeagueName()` — random real NFL location + nickname + year + "League"
- League home redesigned: 3-col grid (`270px 1fr 270px`), user identity card (col 1 top), league banner with gear icon bottom-right (commissioner only), Recent Activity placeholder (center row 2), Power Rankings scatter plot (center row 3)
- Power Rankings: SVG axes + HTML overlay of `HelmetAvatar` components; x-axis numbered by standing, y-axis fixed ±5; positions inset from edges via `xPad`
- Light mode UI (no dark mode; accent is royal blue `#2563EB`)
- Bet page nav shows Balance + Bets this week as stat boxes (no back button); week boxes show League Week N of X and NFL Week N of 18
- Bet page prop UI: one card per market (stat type), players as rows inside; 3 scrollable alt-line boxes per player with ‹/› arrows; hover splits box into U/O buttons; selected box shows direction+line and clicking it removes from slip (no re-split on hover); OVER+UNDER on same prop is blocked at addToSlip, toggleBlockInSlip, and submitParlay
- `PlayerAvatar` renders as square box (borderRadius 6, surface-3 bg) with 1.5× zoomed image; team logo badge bottom-right corner
- Bet page game lines section in selected-game view matches the same 3-col 2-row OddsBlock grid as the game cards on the list view
- Bet page tab bar (Game Lines / Passing / Rushing / etc.) has ‹/› arrow buttons for left-right scroll; overflow hidden on the inner div, arrows call `scrollBy`; clicking a tab auto-scrolls it fully into view via `getBoundingClientRect`
- LeagueNav: persistent across `/leagues/[leagueId]/*` via `layout.tsx`; Home/Bet/My Bets centered, league dropdown + profile on right; active tab has 4px blue bottom border only (no blue text, no hover background); nav has bottom box-shadow
- League home: NFL game strip cards are clickable → navigate to `/leagues/[leagueId]/bet?gameId=[id]`; all name-displaying elements use `overflow: hidden + textOverflow: ellipsis + whiteSpace: nowrap` with `minWidth: 0` on flex/grid containers to prevent card width distortion
- Settings modal on league home: opened via gear icon on banner (commissioner only); gear button has no hover effect
- `backend/scripts/seedWeek1.ts` — one-off seed for week 1 (BUF@MIA, LAR@SF, GB@DET) with fake props/lines; run with `npx tsx scripts/seedWeek1.ts` from `backend/`
- `startupSeed.ts` re-seeds a week if it has no alt game lines (market starts with `ALT_`), not just if new stat types are missing

### Missing — deployment blockers
1. **Deployment** — not hosted anywhere; needs Vercel (frontend) + Railway/Render (backend) + prod Postgres URL
2. **Automated crons** — odds sync, auto-resolve, week locking are all manual admin clicks
3. **NFL 2025 weeks** — DB has weeks 1 seeded (BUF/MIA, LAR/SF, GB/DET); need all 18 with correct 2025 dates
4. **Live game status** — no polling during game hours; scores only appear after resolve runs

### Missing — ship with season
- Prop hit rates (historical over/under % per player+stat)
- Live scores on game cards
- Commissioner balance adjustment tool
- Email/push notifications
- Round robins

---

## Commit style

Max 8 words, no punctuation, no fluff. Group only similar changes together.

Examples: `fix espn image referrer policy`, `expand stat types fake sync all markets`

**Never add `Co-Authored-By: Claude` or any self-attribution to commit messages.**
