import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryRecords, productImages, productPlantRelations, productVariants, products } from "@/db/schema";
import { LAUNCH_PLANTS } from "@/db/launch-catalogue";
import { CONTAINER_LABEL } from "@/lib/grow/suitability";

export type StartItem = { label: string; detail?: string };
export type StartProduct = { slug: string; name: string; priceMinor: number; inStock: boolean; coverPath: string | null };

/**
 * "What you'll need" to start a plant: plain essentials (kept short on purpose), plus any shop items
 * the admin has linked to this plant (Admin → Shop items → "Good for these plants").
 */
export async function startKit(plantId: string, plantSlug: string, plantName: string, method?: string | null): Promise<{ items: StartItem[]; products: StartProduct[] }> {
  const needs = LAUNCH_PLANTS.find((p) => p.slug === plantSlug)?.needs;
  const container = method === "ground" ? "A sunny patch of ground, cleared of weeds" : needs ? `${CONTAINER_LABEL[needs.container].replace(/^a /, "A ")}, with drainage holes` : "A pot with drainage holes";
  const items: StartItem[] = [
    { label: `${plantName} seeds, a seedling or a cutting`, detail: "A seedling or cutting is quicker and easier for beginners." },
    { label: container },
    ...(method === "ground" ? [] : [{ label: "Potting mix or rich, loose soil" }]),
    ...(needs?.climbs ? [{ label: "A stake, trellis or strings to climb" }] : []),
  ];

  const rows = await db
    .select({
      slug: products.slug,
      name: products.name,
      priceMinor: sql<number>`min(${productVariants.priceMinor})`.mapWith(Number),
      stock: sql<number>`coalesce(sum(${inventoryRecords.quantityAvailable} - ${inventoryRecords.reservedQuantity}), 0)`.mapWith(Number),
      coverPath: sql<string | null>`(select ${productImages.storagePath} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.sortOrder} limit 1)`,
    })
    .from(productPlantRelations)
    .innerJoin(products, eq(products.id, productPlantRelations.productId))
    .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.status, "published")))
    .leftJoin(inventoryRecords, eq(inventoryRecords.variantId, productVariants.id))
    .where(and(eq(productPlantRelations.plantId, plantId), eq(products.status, "published")))
    .groupBy(products.id)
    .orderBy(asc(products.name))
    .limit(4);
  return { items, products: rows.map((r) => ({ slug: r.slug, name: r.name, priceMinor: r.priceMinor, inStock: r.stock > 0, coverPath: r.coverPath })) };
}
