# Decisions log

Product requirements: *Loamy Product & Engineering Build Specification v1.0*.
Architecture: *Loamy Technical Architecture & Build Handoff v1.2*. Where they conflict, the spec governs product
requirements and the approved architecture governs implementation.

## Owner decisions (3 November 2026)

| Decision | Outcome | Where it lives in code |
|---|---|---|
| Sign-up timing | After the plan preview. Visitors personalise and preview without an account. | `/grow/*` is public in `src/lib/routes.ts`; `growing_plans.anonymous_session_id` |
| Subscription prices | Quarterly ₦15,000; Annual ₦50,000. Renewal copy: "Renews until you cancel." | Seeded in `subscription_plans` (`src/db/seed.ts`); pricing UI must list active plans, never hard-code |
| Payment provider | Paystack | `payment_provider` enum; adapter arrives in Phase 2 |
| Suppliers | Loamy owns all supplies. No supplier table. | Guarded by `tests/schema.test.ts` |
| Shop pricing | Customers pay the admin-listed price. AI drafts copy, never prices. | Price on `product_variants.price_minor` |
| Delivery | Arranged after the order is placed. Checkout charges items only. | `orders.delivery_fee_minor` nullable; `fulfilment_status = awaiting_delivery_arrangement`; `delivery_zones` is admin reference only |
| Promo codes | Approved | `promo_codes`, `promo_redemptions` |
| Account required to order | No guest checkout. Shoppers sign in and give a phone number and delivery address before ordering. Browsing and the cart stay open. | `orders.user_id` NOT NULL; `/checkout` is signed-in only |
| Reminders at launch | In-app only. WhatsApp integration (E13) leaves the MVP. | `notifications` table; WhatsApp tables unused |
| Visual direction | Light warm-grey canvas, white cards, characterful black feature cards (Loamy brand skill) | `src/app/globals.css`, `tailwind.config.ts`, `src/components/ui` |
| Logo | Hand-a wordmark v1 approved | `Wordmark` component, `public/icons/*` |

## Engineering decisions

### Drizzle ORM instead of Prisma (owner-approved, 3 Nov 2026)
The handoff proposed Prisma. Prisma's CLI downloads native engine binaries at run time, which the build sandbox
could not reach, so migrations could not be generated or tested. Drizzle is TypeScript-only, generates plain SQL
migrations, and runs the same on Supabase Postgres. Migrations were generated, applied to Postgres 16 and seeded
twice (idempotent) before handoff. CI repeats this on every push.

### Supabase Auth through a thin server layer
Identity comes from `supabase.auth.getUser()` on the server (never `getSession()` alone). The first sign-in creates
the app-side `users` row plus terms/privacy consent records. Middleware only does optimistic redirects; every
private page re-checks on the server (`requireUser`, `requireEntitlement`, `requireAdmin`).

### Entitlements, not plan names
Access checks ask "does this user have entitlement X now?" (`src/server/entitlements.ts`). Plans map to an
entitlement set (`full_access` today), so new plan types can unlock different features without schema changes.

### Money
Integer kobo everywhere (`*_minor` columns). `formatNaira()` for display only.

### Self-hosted font
Inter is served from the `@fontsource-variable/inter` package rather than Google Fonts at build time, so builds
work offline and no third-party font request is made from users' devices.

### Offline
The service worker caches the app shell and an offline page only. It never caches private pages, payments or
entitlement-sensitive responses.

### Supabase keys and row-level security (3 Nov 2026)
The project uses Supabase's publishable/secret keys and asymmetric JWT signing. Middleware verifies sessions with
`getClaims()` (JWKS), server code with `getUser()`. All `public` tables have RLS enabled with no policies, so the
Data API exposes nothing to the publishable key; the app's own server is the only path to data. Migration
`0001_enable_rls.sql` and the `db:check-rls` CI step enforce this.
