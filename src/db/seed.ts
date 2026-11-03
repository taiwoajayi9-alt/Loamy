/**
 * Seeds reference data and (outside production) clearly-marked sample content.
 *
 * Always seeded (owner-confirmed):
 * - Plant and product categories
 * - Subscription plans: Quarterly ₦15,000, Annual ₦50,000
 *
 * Sample content (isSample = true; never seeded when NODE_ENV=production unless SEED_SAMPLES=1):
 * - Two plants (sweet basil, mint) with questions, stages and care templates, pending expert review
 * - Five products with SAMPLE prices
 *
 * Idempotent: re-running updates by slug/code instead of duplicating rows.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "./schema";

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
  await upsertPlantCategory("Leafy greens", "leafy-greens", 2);
  await upsertPlantCategory("Vegetables", "vegetables", 3);
  await upsertPlantCategory("Fruit", "fruit", 4);
  await upsertPlantCategory("Ornamentals", "ornamentals", 5);

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

  if (!seedSamples) {
    console.log("Production: skipped sample plants and products.");
    return;
  }

  // ── Sample plants (pending expert review) ───────────────────
  const samplePlants = [
    {
      slug: "sweet-basil",
      commonName: "Sweet basil",
      botanicalName: "Ocimum basilicum",
      tagline: "The little herb with a lot of personality.",
      summaryLine: "Herb · beginner friendly",
      stages: ["Sow or plant", "Sprouting", "Seedling", "Leafy growth", "Ongoing harvest"],
    },
    {
      slug: "mint",
      commonName: "Mint",
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
        prompt: `Where will your ${p.commonName.toLowerCase()} grow?`,
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
