/**
 * Seeds reference data and (outside production) clearly-marked sample content.
 *
 * Always seeded (owner-confirmed):
 * - Plant and product categories
 * - Subscription plans: Quarterly ₦15,000, Annual ₦50,000
 *
 * Launch catalogue (always seeded, as DRAFTS — see launch-catalogue.ts):
 * - 16 launch plants pending expert review
 * - Launch products with no price yet (an admin sets it before publishing)
 *
 * Sample content (isSample = true; never seeded when NODE_ENV=production unless SEED_SAMPLES=1):
 * - Two sample plants (sample-sweet-basil, sample-mint) with questions, stages and care templates, pending expert review
 * - Five products with SAMPLE prices
 *
 * Idempotent: re-running updates by slug/code instead of duplicating rows.
 */
import { and, eq, sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "./schema";
import { rulesForNeeds } from "../lib/grow/suitability";
import { LAUNCH_PLANTS, LAUNCH_PRODUCTS } from "./launch-catalogue";

// Load .env.local when present (local runs); CI passes env vars directly.
try {
  process.loadEnvFile(".env.local");
} catch {}


const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set DIRECT_URL (or DATABASE_URL) before seeding.");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema: s, casing: "snake_case" });

const seedSamples = process.env.NODE_ENV !== "production" || process.env.SEED_SAMPLES === "1";
const naira = (n: number) => Math.round(n * 100); // to kobo

async function upsertPlantCategory(name: string, slug: string, sortOrder: number) {
  const [row] = await db
    .insert(s.plantCategories)
    .values({ name, slug, sortOrder, status: "published" })
    .onConflictDoUpdate({ target: s.plantCategories.slug, set: { name, sortOrder } })
    .returning();
  return row;
}

async function upsertProductCategory(name: string, slug: string, sortOrder: number) {
  const [row] = await db
    .insert(s.productCategories)
    .values({ name, slug, sortOrder, status: "published" })
    .onConflictDoUpdate({ target: s.productCategories.slug, set: { name, sortOrder } })
    .returning();
  return row;
}

async function main() {
  // ── Reference data ──────────────────────────────────────────
  const herbs = await upsertPlantCategory("Herbs", "herbs", 1);
  const plantCats: Record<string, string> = { herbs: herbs.id };
  plantCats["leafy-greens"] = (await upsertPlantCategory("Leafy greens", "leafy-greens", 2)).id;
  plantCats.vegetables = (await upsertPlantCategory("Vegetables", "vegetables", 3)).id;
  plantCats.fruit = (await upsertPlantCategory("Fruit", "fruit", 4)).id;
  plantCats.ornamentals = (await upsertPlantCategory("Ornamentals", "ornamentals", 5)).id;

  const kits = await upsertProductCategory("Starter kits", "starter-kits", 1);
  const plantsSeeds = await upsertProductCategory("Plants and seeds", "plants-and-seeds", 2);
  const materials = await upsertProductCategory("Growing materials", "growing-materials", 3);
  const tools = await upsertProductCategory("Tools and accessories", "tools-and-accessories", 4);

  const plans = [
    {
      code: "quarterly",
      name: "Quarterly",
      description: "Billed every 3 months. Renews until you cancel.",
      billingInterval: "month" as const,
      intervalCount: 3,
      priceMinor: naira(15_000),
      displayOrder: 1,
    },
    {
      code: "annual",
      name: "Annual",
      description: "Billed once a year. Renews until you cancel.",
      billingInterval: "year" as const,
      intervalCount: 1,
      priceMinor: naira(50_000),
      displayOrder: 2,
    },
  ];
  for (const p of plans) {
    await db
      .insert(s.subscriptionPlans)
      .values({ ...p, entitlementSetKey: "full_access", active: true })
      .onConflictDoUpdate({
        target: s.subscriptionPlans.code,
        set: { name: p.name, description: p.description, priceMinor: p.priceMinor, displayOrder: p.displayOrder },
      });
  }
  console.log("Seeded categories and subscription plans (Quarterly ₦15,000, Annual ₦50,000).");

  // ── Launch catalogue (drafts) ───────────────────────────────
  const productCats: Record<string, string> = {
    "starter-kits": kits.id,
    "plants-and-seeds": plantsSeeds.id,
    "growing-materials": materials.id,
    "tools-and-accessories": tools.id,
  };
  for (const p of LAUNCH_PLANTS) {
    const values = {
      categoryId: plantCats[p.category],
      slug: p.slug,
      commonName: p.commonName,
      localNames: p.localNames,
      botanicalName: p.botanicalName,
      tagline: p.tagline,
      summaryLine: p.summaryLine,
      status: "draft" as const,
      isSample: false,
    };
    // New rows are inserted as drafts. An old sample row with the same slug becomes a launch draft.
    // Rows an admin already owns (isSample = false) are never touched.
    await db
      .insert(s.plants)
      .values(values)
      .onConflictDoUpdate({
        target: s.plants.slug,
        set: { ...values, publishedAt: null },
        setWhere: dsql`${s.plants.isSample} = true`,
      });
  }
  // Suitability rules (version 1, generated from each plant's needs). Re-seeding refreshes version 1 only.
  for (const p of LAUNCH_PLANTS) {
    const plant = await db.query.plants.findFirst({ where: eq(s.plants.slug, p.slug), columns: { id: true } });
    if (!plant) continue;
    await db.delete(s.plantSuitabilityRules).where(and(eq(s.plantSuitabilityRules.plantId, plant.id), eq(s.plantSuitabilityRules.ruleVersion, 1)));
    const rules = rulesForNeeds(p.commonName, p.needs);
    if (rules.length)
      await db.insert(s.plantSuitabilityRules).values(
        rules.map((r) => ({ plantId: plant.id, priority: r.priority, condition: r.condition, outcome: r.outcome, reason: r.reason, ruleVersion: 1, status: "published" as const })),
      );
  }

  for (const p of LAUNCH_PRODUCTS) {
    const [product] = await db
      .insert(s.products)
      .values({ slug: p.slug, name: p.name, categoryId: productCats[p.category], description: p.description, status: "draft" })
      .onConflictDoNothing({ target: s.products.slug })
      .returning();
    if (!product) continue; // already exists: the admin owns it now
    // Price 0 + draft: the database refuses to publish a variant without a real price.
    const [variant] = await db
      .insert(s.productVariants)
      .values({ productId: product.id, sku: p.sku, priceMinor: 0, status: "draft" })
      .returning();
    await db.insert(s.inventoryRecords).values({ variantId: variant.id, quantityAvailable: p.stock });
  }
  console.log(`Seeded launch catalogue as drafts (${LAUNCH_PLANTS.length} plants, ${LAUNCH_PRODUCTS.length} products).`);

  if (!seedSamples) {
    console.log("Production: skipped sample plants and products.");
    return;
  }

  // ── Sample plants (pending expert review) ───────────────────
  const samplePlants = [
    {
      slug: "sample-sweet-basil",
      commonName: "Sweet basil (sample)",
      botanicalName: "Ocimum basilicum",
      tagline: "The little herb with a lot of personality.",
      summaryLine: "Herb · beginner friendly",
      stages: ["Sow or plant", "Sprouting", "Seedling", "Leafy growth", "Ongoing harvest"],
    },
    {
      slug: "sample-mint",
      commonName: "Mint (sample)",
      botanicalName: "Mentha spp.",
      tagline: "Fresh, cooling and very keen to grow.",
      summaryLine: "Herb · spreads fast",
      stages: ["Plant a cutting or seedling", "Rooting and new shoots", "First picks", "Ongoing harvest"],
    },
  ];

  for (const p of samplePlants) {
    const [plant] = await db
      .insert(s.plants)
      .values({
        categoryId: herbs.id,
        slug: p.slug,
        commonName: p.commonName,
        botanicalName: p.botanicalName,
        tagline: p.tagline,
        summaryLine: p.summaryLine,
        status: "published",
        isSample: true,
        publishedAt: new Date(),
      })
      .onConflictDoUpdate({ target: s.plants.slug, set: { tagline: p.tagline, summaryLine: p.summaryLine } })
      .returning();

    await db.delete(s.plantGrowthStages).where(eq(s.plantGrowthStages.plantId, plant.id));
    await db
      .insert(s.plantGrowthStages)
      .values(p.stages.map((name, i) => ({ plantId: plant.id, name, sequence: i + 1 })));

    await db.delete(s.plantQuestions).where(eq(s.plantQuestions.plantId, plant.id));
    await db.insert(s.plantQuestions).values([
      {
        plantId: plant.id,
        questionKey: "space",
        prompt: `Where will your ${p.commonName.replace(" (sample)", "").toLowerCase()} grow?`,
        helpText: "This helps us check light and space.",
        options: [
          { value: "balcony", label: "Balcony" },
          { value: "window", label: "Indoors, by a window" },
          { value: "rooftop", label: "Rooftop" },
          { value: "compound", label: "Compound or garden" },
        ],
        sortOrder: 1,
        status: "published",
      },
      {
        plantId: plant.id,
        questionKey: "sun",
        prompt: "How much direct sun does that spot get?",
        helpText: "A rough guess is fine.",
        options: [
          { value: "full", label: "6 hours or more" },
          { value: "part", label: "3 to 6 hours" },
          { value: "low", label: "Under 3 hours" },
        ],
        sortOrder: 2,
        status: "published",
      },
      {
        plantId: plant.id,
        questionKey: "method",
        prompt: "How would you like to grow it?",
        options: [
          { value: "pot", label: "In a pot" },
          { value: "grow_bag", label: "In a grow bag" },
          { value: "ground", label: "In the ground", showIf: { space: ["compound"] } },
        ],
        sortOrder: 3,
        status: "published",
      },
    ]);

    await db.delete(s.careTaskTemplates).where(eq(s.careTaskTemplates.plantId, plant.id));
    await db.insert(s.careTaskTemplates).values([
      {
        plantId: plant.id,
        taskType: "soil_check",
        title: "Check the soil before watering",
        instructions:
          "Push a finger about 2 cm into the soil. Dry? Water slowly until it drains. Still damp? Skip today.",
        timingRule: { everyDays: 1 },
        reviewStatus: "pending",
        status: "draft",
      },
    ]);
  }

  // ── Sample products (SAMPLE prices — replace before launch, ticket LMY-35) ──
  const sampleProducts = [
    { slug: "herb-starter-kit", name: "Herb starter kit", categoryId: kits.id, price: 12_000, stock: 20, desc: "Seeds, a pot, potting mix and a simple care card to start your first herb." },
    { slug: "basil-seedling", name: "Basil seedling", categoryId: plantsSeeds.id, price: 2_500, stock: 40, desc: "A young basil plant, ready to pot up." },
    { slug: "potting-mix-10l", name: "Potting mix, 10L", categoryId: materials.id, price: 4_000, stock: 30, desc: "A free-draining mix for containers and grow bags." },
    { slug: "grow-bag-small", name: "Grow bag, small", categoryId: tools.id, price: 3_500, stock: 3, desc: "A breathable fabric bag that drains well. Good for balconies." },
    { slug: "watering-can-2l", name: "Watering can, 2L", categoryId: tools.id, price: 6_000, stock: 0, desc: "A narrow spout for gentle watering of seedlings." },
  ];
  for (const p of sampleProducts) {
    const [product] = await db
      .insert(s.products)
      .values({
        slug: p.slug,
        name: p.name,
        categoryId: p.categoryId,
        description: p.desc,
        status: "published",
        isSample: true,
        publishedAt: new Date(),
      })
      .onConflictDoUpdate({ target: s.products.slug, set: { name: p.name, description: p.desc } })
      .returning();
    const [variant] = await db
      .insert(s.productVariants)
      .values({ productId: product.id, sku: `SAMPLE-${p.slug}`, priceMinor: naira(p.price), status: "published" })
      .onConflictDoUpdate({ target: s.productVariants.sku, set: { priceMinor: naira(p.price) } })
      .returning();
    await db
      .insert(s.inventoryRecords)
      .values({ variantId: variant.id, quantityAvailable: p.stock })
      .onConflictDoUpdate({ target: s.inventoryRecords.variantId, set: { quantityAvailable: p.stock } });
  }
  console.log("Seeded sample plants and products (marked isSample; sample prices).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
