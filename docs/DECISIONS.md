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

## 2026-11-03 — "Can I grow this here?" and plan preview
- Five questions for every plant (space, sun, how you'll grow it, watering, experience). "In the ground" is only offered for a compound.
- The verdict (yes / yes with tweaks / not a good match) is rule-based, never AI. Rules come from each plant's needs (sun, container, water, indoor, climbs) and live in plant_suitability_rules. The launch needs are a starting point for the expert to check.
- Visitors see the preview with no account. Plans made before sign-up are remembered in a functional cookie (loamy_plans) and attached to the account on the subscribe page.
- When a plant isn't a match, we suggest up to three published plants that suit the same answers.

## 2026-11-03 — Memberships with Paystack (test mode)
- Quarterly and Annual memberships use Paystack plans (created automatically to match our prices; recreated if a price changes).
- Membership switches on only after the server re-verifies the payment with Paystack (exact amount, currency and reference). The browser redirect is never trusted. Replays are ignored.
- Renewals, subscription codes and cancellations arrive by webhook (signature-checked, each event handled once). Webhooks need a public URL, so they start working once the app is deployed.
- Cancelling stops renewal at Paystack; access continues until the end of the paid period, plus 3 days' grace on late renewals.
- Live keys and real charges need the owner's go-ahead.

## 2026-11-03 — Cart, checkout and orders
- Visitors can fill a cart; it moves into their account when they sign in. Checkout needs an account plus a Nigerian mobile number and a Lagos address (saved for next time).
- Prices and stock are re-read and locked at checkout. Placing an order holds the stock for 30 minutes while the shopper pays; unpaid holds are released. A payment that arrives after the hold still counts and is flagged for a stock check.
- Customers pay for items only (promo codes applied server-side). Paystack is re-verified on the server before an order counts as paid; replays are ignored.
- Admin: Orders screen (call the customer, set status, agreed delivery fee, date and notes; every change logged) and Promo codes screen. Promo codes apply to the shop now; membership promos later.

## 2026-11-03 — Hosting
- Marketing landing page on loamy.farm; the PWA on app.loamy.farm. Both on the owner's Namecheap shared hosting (cPanel).
- The app runs on Namecheap's "Setup Node.js App" (Passenger) with Node 22.23.4, from a Next.js standalone bundle in ~/loamy-app/app with deploy/app.js as the startup file.
- GitHub Actions builds and sends each version over SSH (port 21098) after CI passes, swapping folders so the live app is never half-updated. Secrets live only in ~/loamy-app/.env on the server (sent with scripts/push-env.sh), never in Git.
- Database, auth and photos stay on Supabase.

## 2026-11-03 — My Garden and care routines
- Each plant has a care routine: repeating tasks (type, title, instructions, every N days, starting N days after planting). AI can draft them; only expert-approved tasks reach members. Approved tasks can't be edited, only retired and replaced, so members' schedules stay stable.
- Publishing a plant now also needs at least one approved care task.
- Members add a plan to their garden (first garden created from their answers). Tasks are worked out each day in Lagos time; missed occurrences fold into one task rather than piling up. Done logs an activity; Skip doesn't.
- Paying for a membership puts the plan they just unlocked straight into their garden.
- Members record care, milestones, harvests and growth stage; finishing a plant keeps its history.
- Update (owner): AI-drafted plant sections go straight to "waiting for review" — no manual send per section. "Send all for review" on the plant library (and per plant) sends any remaining drafts in one go. Hand-written edits still save as drafts until sent.
- Update (owner): super admins can "Approve all" for one plant (every section and care task waiting for review), after ticking a box to confirm they've read it. Logged as a bulk approval. Plant experts still approve one by one.

## 2026-11-03 — Photos
- Plant photos: uploaded in the admin (at least 1200 px on the shorter side, 3:4 to 3:2), public bucket `plant-images`. The first is the cover on Discover, the plant page and garden cards.
- Members' photos: private bucket `garden-photos`, stored under each member's own folder, shown only to them through signed links that expire after an hour. Their latest photo replaces the catalogue photo on their garden card.
- No storage access rules exist for browsers; only the server (secret key) reads or writes files.

## 2026-11-03 — Ask Loamy
- Members ask questions in general or about a plant in their garden. Answers are grounded in approved plant sections and care routines (drafts excluded) plus the member's records (age, stage, space, sun, watering, recent care, tasks due).
- Ask Loamy never claims to see or diagnose a plant (enforced in the prompt and softened after), makes no medical claims, names no prices, brands or chemicals, and suggests the Loamy team for anything serious.
- Uses the same AI provider as drafting (DeepSeek/Gemini). 30 questions per member per Lagos day to keep costs predictable.
- Members rate answers (helpful or not) and can send a conversation to the Loamy team; requests land in Admin → Help for support admins, plant experts and super admins. Replies happen by phone or email for now.
- Message text is stored for the member and support only; analytics get event names and context type, never text.

## 2026-11-03 — Getting ready, and journey fixes (owner review)
- New garden plants start as "Getting ready": no planting date and no care tasks. A short "What you'll need" list (plant material, the right pot size, potting mix, support for climbers) plus any shop items the admin linked to that plant. One button, "I've planted it" (seedling/cutting or seeds, and the day), starts the care plan from that day.
- No extra question was added to "Can I grow this here?" (keep the flow short).
- Admin → Shop items → "Good for these plants" links products (e.g. seedlings, starter packs) to plants; they show with an Add button on the plan preview and in Getting ready.
- Opening the app (and logging in without a destination) takes members to My Garden; visitors to Discover. The installed app starts at "/".
- My Garden for free accounts shows their saved plans; for lapsed members it says their garden is saved and offers renewal.
- "Ready to plant" no longer lists plants already growing. Profile rows go to real pages only. A plan made before sign-up is claimed via the sign-up link even if email is confirmed in another browser.
- Privacy choice is now a slim strip at the top of the page, in the normal flow, so it never covers buttons or the nav.
- The plant library shows each draft plant's launch checklist (sections, care routine, source, photo) and "Ready to publish".

## 2026-11-03 — Seedlings and starter packs
- Owner will sell seedlings and starter packs, starting small. First: one "Herb starter pack" (seedling of scent leaf, sweet basil or mint + medium pot + potting mix), a draft with no price, linked to those three herbs so it shows in their "What you'll need".
- The five sample shop items (made-up prices) are archived in the live database so they can never reach customers.
- Plant photos: minimum lowered to 1,000 px on the shorter side (2:3 to 3:2) so ChatGPT's 1536 × 1024 images fit. Admin → Plants → "Upload photos for many plants at once" matches files to plants by name (slug, common or local name; "-2" or "(1)" suffixes ignored), checks each, and uploads them one at a time.

## 2026-11-03 — Sources, team, privacy and legal pages

- **AI-suggested sources.** The AI writes from memory and doesn't browse, so it can misremember links. It now suggests 3–5 reference pages per plant (FAO, PROTA, IITA, extension services, RHS…), the server opens every link and keeps only ones that load, and attaches them to each section labelled "AI suggested · check it". The expert confirms them while reviewing; AI-suggested sources can be removed even after approval. "Draft all plants" also fills sources for plants that have none; each plant page has "Find sources with AI".
- **Team page** (Admin → Team, owner only): add someone by the email they signed up with, pick a role, remove roles. Loamy always keeps at least one owner. Every change is logged.
- **Privacy and data** (Profile): download my data (JSON), turn anonymous visit counts on/off (recorded as consent), request account deletion. Requesting stops membership renewal straight away. Owner or Support completes it from Admin → Privacy requests within 30 days: personal data is deleted, order and payment records are kept for tax with name/phone/address removed, garden photos and the Supabase sign-in are deleted.
- **Terms of use and Privacy notice** drafted for the NDPA 2023, linked from sign-up (now also "I'm 18 or older"), subscribe, checkout, profile and the landing page. Shown with a "Draft for review" banner until `LEGAL.reviewed` is set in `src/lib/legal.ts`.
- **Needs the owner:** business name, CAC number, address, support phone, and confirm privacy@ / hello@loamy.farm mailboxes exist; confirm 48-hour damaged-item window and 7-day change-of-mind returns for non-living items; confirm refunding unused membership if Loamy ever closes; Ask Loamy questions go to DeepSeek (servers in China), which is disclosed — consider a lawyer's view on that transfer or switching Ask Loamy to another provider; check whether Loamy must register with the NDPC as a data controller.
- Analytics events older than 24 months are now purged automatically, matching the notice.
