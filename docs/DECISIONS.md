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

## 2026-11-03 — Launch catalogue
- All 16 proposed launch plants approved by the owner. Seeded as drafts; each needs expert review before publishing (LMY-34).
- First shop items: 7-piece mini garden tool set and 1-gallon nursery pots (pack of 10), 10 in stock each. Seeded as drafts with no price.
- The database refuses to publish a product variant without an admin-set price (`product_variants_published_price_check`).
- Supplier listing photos are not used in the shop. Loamy uses its own product photos.

## 2026-11-03 — Plant library workflow
- Six sections per plant. Each goes draft → waiting for review → approved, or back with the expert's notes.
- Editing approved text starts a new version; customers keep seeing the approved one until the new one is approved.
- A plant goes live only when all six sections are approved and it has at least one source.
- Roles: content_admin writes and publishes; plant_expert approves; super_admin can do both.
- AI drafting is off until ANTHROPIC_API_KEY is set. It never overwrites approved text or text waiting for review, and drafts mentioning prices or medical claims are flagged for the reviewer.
- Every change is written to audit_logs.

## 2026-11-03 — Shop admin
- commerce_admin (or super_admin) sets names, descriptions, prices (typed in naira, stored in kobo), stock and photos.
- An item goes live only with a price, a description and at least one photo. Live items can't lose their price or last photo.
- Photos live in the public Supabase Storage bucket `product-images` (JPG, PNG or WebP, up to 5 MB). Uploads go through the server with the secret key; browsers can only read.
- Stock can't go below what's held in open orders. Every change is audit-logged.

## 2026-11-03 — AI drafting provider
- Owner chose DeepSeek for plant-content drafts (DEEPSEEK_API_KEY; default model deepseek-v4-pro, override with AI_DRAFT_MODEL).
- Anthropic stays supported as a fallback. Expert review rules are unchanged: AI drafts are never published without approval.
- Update: DeepSeek account had no credit, so Gemini (free tier, GEMINI_API_KEY, model gemini-flash-latest) was added and is preferred when its key is set. AI_PROVIDER can force a choice.

## 2026-11-03 — Product photo quality
- Photos must be near-square (4:5 to 5:4) and at least 1200 × 1200 pixels; 1600 × 1600 is recommended. Over 6000 pixels is refused.
- JPG, PNG or WebP up to 10 MB. Checked in the browser for instant feedback and again on the server from the real pixels (camera rotation respected).
