# Wagerwolf — frontend

Next.js 16 App Router, TypeScript. The marketing site and the signed-in app are
one project; there is no separate landing build.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000, Turbopack
```

The backend must be running on port 5000 — see `../backend`. `NEXT_PUBLIC_API_URL`
in `.env.local` points at it.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server (Turbopack) |
| `npm run build` | production build; emits `.next/standalone` for the container |
| `npm run lint` | eslint — a **blocking** CI gate, currently green |
| `npm run icons` | regenerate `lib/icons.ts` — see below |

## Two things that are not obvious

**Icons are generated, never imported from an icon set at runtime.** Add a name
to `ICONS` in `scripts/build-icons.mjs`, run `npm run icons`, import the new
export from `lib/icons.ts`. Importing `@iconify-json/*` directly would ship all
1,884 icons to use one. See that script's header.

**`NEXT_PUBLIC_*` are compiled into the client bundle at build time**, so the
Docker image is environment-specific and cannot be re-pointed at another
environment by changing container env. See `Dockerfile`.

Conventions, design tokens and the reasoning behind both live in the repo root's
`CLAUDE.md`.
