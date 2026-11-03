# Loamy

**Grow a little joy.** An AI-powered home gardening, learning and commerce PWA for urban households, starting in Lagos.

This repository holds the **Phase 0 foundation**: repo and CI, the full v1.2 database schema with migrations,
Supabase authentication, the Loamy design system, and the public app shell. Product features arrive phase by phase
(see the build backlog).

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router) + React 19 + TypeScript, installable PWA |
| Styling | Tailwind CSS mapped to Loamy design tokens |
| Database | PostgreSQL (Supabase) via Drizzle ORM, SQL migrations in `drizzle/` |
| Auth | Supabase Auth (email + password, reset by email) |
| Validation | Zod |
| Tests | Vitest |
| Payments | Paystack (Phase 2) |

See `docs/DECISIONS.md` for why, including the switch from Prisma to Drizzle.

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in Supabase URL, anon key and database URLs
npm run db:migrate                # apply migrations (uses DIRECT_URL)
npm run db:seed                   # categories, plans (₦15,000 / ₦50,000) and marked sample content
npm run dev                       # http://localhost:3000
```

Without Supabase keys the public pages still run; sign-in pages show a clear "not set up" message.

For a throwaway local database: `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`, then use
`postgresql://postgres:postgres@localhost:5432/postgres` for both URLs.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run check` | Typecheck, lint and unit tests |
| `npm run db:generate` | Generate a new SQL migration after changing `src/db/schema` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed reference data (idempotent). Samples are skipped in production unless `SEED_SAMPLES=1` |
| `npm run db:studio` | Browse the database |

## Project layout

```
src/
  app/
    (app)/            Discover, plants, Shop, My Garden, Profile — with the floating nav
    (auth)/           Login, register, forgot/reset password + server actions
    auth/callback/    Email link handler
    grow/[slug]/      Personalisation + preview (public; Phase 2)
    offline/          PWA offline page
    manifest.ts       PWA manifest
  components/
    ui/               Design system: Wordmark, Button, Tag, IconTile, QuickAction, HeroCard, PhotoCard, Field…
    floating-nav.tsx
  db/
    schema/           Drizzle schema split by domain (identity, plants, gardens, ai, billing, shop, engagement)
    client.ts         Lazy, server-only DB client
    migrate.ts, seed.ts
  lib/                env, routes (access map), money, Supabase clients
  server/             auth (requireUser / requireEntitlement / requireAdmin), entitlements, catalogue queries
  middleware.ts       Session refresh + optimistic redirects
drizzle/              Generated SQL migrations (commit these)
tests/                Unit tests (routes, entitlements, money, schema rules)
docs/DECISIONS.md     Owner and engineering decisions
```

## Rules this codebase enforces

- Discovery, plant profiles, plan preview and the shop never need an account.
- Subscriber features are checked on the server from entitlements, never from client state.
- Money is integer kobo. Customers pay the admin-listed price. AI never sets prices.
- Unpublished plant content is never shown publicly or used by AI.
- Sample plants/products are flagged `is_sample` and must not ship to production.
- No deploys, paid infrastructure or live payments without owner approval.

## Supabase setup (when approved)

1. Create a project (free tier is enough for development) in a region close to Lagos.
2. Auth → URL configuration: add `http://localhost:3000/auth/callback` and your preview/staging URLs.
3. Copy the project URL and anon key into `.env.local`; copy the pooled and direct connection strings into
   `DATABASE_URL` and `DIRECT_URL`.
4. Run `npm run db:migrate && npm run db:seed`.
