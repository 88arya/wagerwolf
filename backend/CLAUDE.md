# Backend Rules for Claude

## Prisma

### Schema changes
- **Never use `prisma migrate dev`** — this project uses `npx prisma db push` only (no migration history)
- After any schema change (adding fields, changing enums, adding models): run `npx prisma db push` from the `backend/` directory
- Enum changes (e.g. adding a `StatType` value) require `db push` before the backend will compile — TypeScript will error until then

### Prisma connection
- DB runs via `prisma+postgres` protocol on local ports 51213/51214
- Start the DB with `npx prisma dev` from `backend/` before starting the backend server
- The backend will fail to connect if the Prisma local DB is not running

### TypeScript compatibility
- Target is ES2020 — `String.prototype.replaceAll` is NOT available
- Use `.split("_").join(" ")` instead of `.replaceAll("_", " ")`
- This applies anywhere StatType or similar underscore-delimited strings are formatted for display

### StatType enum
- The `StatType` enum is exhaustive — all 22 values must be handled in any `switch` or `Partial<Record<StatType, ...>>` map
- Use `Partial<Record<StatType, T>>` when not all stat types need a mapping (e.g. ESPN stat field names)
- Always add a guard (`if (!value) continue`) before using a potentially-undefined lookup from a Partial record

### Seeding
- Startup seed runs in `app.listen` callback in `src/index.ts`
- Seed is idempotent: checks for presence of new stat types before re-seeding existing weeks
- Seed must iterate ALL unresolved weeks, not just the first — leagues have a `startWeek` field that controls which weeks are visible
- `seedFakePropsForWeek(weekId)` is in `src/services/fakeSync.ts`
- Team names in DB are abbreviations (KC, BUF, BAL, PHI, etc.) — FAKE_PLAYERS and FAKE_GAMES must use these, not full names

### Player / ESPN images
- Player images come from ESPN CDN: `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`
- ESPN CDN blocks requests that include a `Referer` header from non-ESPN origins
- All `<img>` tags rendering ESPN URLs must have `referrerPolicy="no-referrer"`
- This is already set in `frontend/components/PlayerAvatar.tsx`
