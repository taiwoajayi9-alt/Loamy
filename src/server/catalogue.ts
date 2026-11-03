import "server-only";
import { and, asc, eq, ilike, inArray, min, or, sql } from "drizzle-orm";
import { approvedByType, PILLARS } from "@/lib/plant-workflow";
import { db } from "@/db/client";
import {
  inventoryRecords,
  plantCategories,
  plantContentSections,
  plantReferences,
  plantSources,
  plants,
  productCategories,
  productImages,
  productVariants,
  products,
} from "@/db/schema";

/** Result wrapper so pages can show a designed "not connected" state instead of crashing. */
export type Loaded<T> = { ok: true; data: T } | { ok: false; reason: "unavailable" };

async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    console.error("[catalogue]", err);
    return { ok: false, reason: "unavailable" };
  }
}

const PAGE_SIZE = 20;

/** Published plants only, searched and paged on the server (never load the full catalogue). */
export function listPublishedPlants(opts: { category?: string; q?: string; limit?: number } = {}) {
  return load(async () => {
    const filters = [eq(plants.status, "published")];
    if (opts.category) filters.push(eq(plantCategories.slug, opts.category));
    if (opts.q) {
      const term = `%${opts.q.trim()}%`;
      filters.push(or(ilike(plants.commonName, term), ilike(plants.summaryLine, term))!);
    }
    return db
      .select({
        slug: plants.slug,
        commonName: plants.commonName,
        summaryLine: plants.summaryLine,
        category: plantCategories.name,
        isSample: plants.isSample,
      })
      .from(plants)
      .innerJoin(plantCategories, eq(plantCategories.id, plants.categoryId))
      .where(and(...filters))
      .orderBy(asc(plants.commonName))
      .limit(Math.min(opts.limit ?? PAGE_SIZE, 50));
  });
}

export function listPlantCategories() {
  return load(() =>
    db
      .select({ slug: plantCategories.slug, name: plantCategories.name })
      .from(plantCategories)
      .where(eq(plantCategories.status, "published"))
      .orderBy(asc(plantCategories.sortOrder)),
  );
}

export function getPublishedPlant(slug: string) {
  return load(async () => {
    const [row] = await db
      .select({
        id: plants.id,
        slug: plants.slug,
        commonName: plants.commonName,
        botanicalName: plants.botanicalName,
        tagline: plants.tagline,
        summaryLine: plants.summaryLine,
        category: plantCategories.name,
        isSample: plants.isSample,
      })
      .from(plants)
      .innerJoin(plantCategories, eq(plantCategories.id, plants.categoryId))
      .where(and(eq(plants.slug, slug), eq(plants.status, "published")))
      .limit(1);
    return row ?? null;
  });
}

/** Published products with their lowest published variant price and total stock. */
export function listPublishedProducts(opts: { category?: string; limit?: number } = {}) {
  return load(async () => {
    const filters = [eq(products.status, "published"), eq(productVariants.status, "published")];
    if (opts.category) filters.push(eq(productCategories.slug, opts.category));
    return db
      .select({
        slug: products.slug,
        name: products.name,
        category: productCategories.name,
        isSample: products.isSample,
        fromPriceMinor: min(productVariants.priceMinor).mapWith(Number),
        stock: sql<number>`coalesce(sum(${inventoryRecords.quantityAvailable} - ${inventoryRecords.reservedQuantity}), 0)`.mapWith(Number),
        coverPath: sql<string | null>`(select ${productImages.storagePath} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.sortOrder}, ${productImages.createdAt} limit 1)`,
        coverAlt: sql<string | null>`(select ${productImages.altText} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.sortOrder}, ${productImages.createdAt} limit 1)`,
      })
      .from(products)
      .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(inventoryRecords, eq(inventoryRecords.variantId, productVariants.id))
      .where(and(...filters))
      .groupBy(products.id, productCategories.name, productCategories.sortOrder)
      .orderBy(asc(productCategories.sortOrder), asc(products.name))
      .limit(Math.min(opts.limit ?? PAGE_SIZE, 50));
  });
}

export function listProductCategories() {
  return load(() =>
    db
      .select({ slug: productCategories.slug, name: productCategories.name })
      .from(productCategories)
      .where(eq(productCategories.status, "published"))
      .orderBy(asc(productCategories.sortOrder)),
  );
}

/**
 * The approved, published sections of a plant in pillar order, with their sources.
 * Drafts, items waiting for review and unapproved versions never reach customers.
 */
export function getPublishedSections(plantId: string) {
  return load(async () => {
    const rows = await db
      .select({
        id: plantContentSections.id,
        sectionType: plantContentSections.sectionType,
        title: plantContentSections.title,
        body: plantContentSections.body,
        version: plantContentSections.version,
        status: plantContentSections.status,
        reviewStatus: plantContentSections.reviewStatus,
      })
      .from(plantContentSections)
      .where(
        and(
          eq(plantContentSections.plantId, plantId),
          eq(plantContentSections.status, "published"),
          eq(plantContentSections.reviewStatus, "approved"),
        ),
      );
    const approved = approvedByType(rows);
    const sections = PILLARS.flatMap((p) => {
      const s = approved.get(p.type);
      return s ? [{ ...s, label: p.label }] : [];
    });
    const sources = sections.length
      ? await db
          .selectDistinct({ title: plantSources.title, publisher: plantSources.publisher, url: plantSources.url })
          .from(plantReferences)
          .innerJoin(plantSources, eq(plantSources.id, plantReferences.sourceId))
          .where(inArray(plantReferences.contentSectionId, sections.map((s) => s.id)))
      : [];
    return { sections, sources };
  });
}
