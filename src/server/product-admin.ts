import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { auditLogs, inventoryRecords, productCategories, productImages, productVariants, products } from "@/db/schema";
import { canManageShop, checkImage, productImagePath, productReadiness, slugify, type IMAGE_TYPES } from "@/lib/product-admin";
import { requireUser } from "./auth";
import { getRoles, NotAllowed, WorkflowError, type Actor } from "./plant-admin";
import { deleteProductImage, uploadProductImage } from "./storage";

export async function requireShopAdmin(nextPath: string): Promise<Actor> {
  const user = await requireUser(nextPath);
  const roles = await getRoles(user.id);
  if (!canManageShop(roles)) redirect("/admin");
  return { ...user, roles };
}

function allow(actor: Actor) {
  if (!canManageShop(actor.roles)) throw new NotAllowed("You don't have permission to manage the shop.");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const audit = (tx: Tx, actor: Actor, action: string, entityId: string, before: unknown, after: unknown) =>
  tx.insert(auditLogs).values({ actorId: actor.id, action, entityType: "product", entityId, before: before ?? null, after: after ?? null });

// ── Reads ──────────────────────────────────────────────────────

export async function listAdminProducts() {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      status: products.status,
      isSample: products.isSample,
      category: productCategories.name,
      priceMinor: sql<number>`min(${productVariants.priceMinor})`.mapWith(Number),
      stock: sql<number>`coalesce(sum(${inventoryRecords.quantityAvailable} - ${inventoryRecords.reservedQuantity}), 0)`.mapWith(Number),
      images: sql<number>`(select count(*) from ${productImages} where ${productImages.productId} = ${products.id})`.mapWith(Number),
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(inventoryRecords, eq(inventoryRecords.variantId, productVariants.id))
    .groupBy(products.id, productCategories.name, productCategories.sortOrder)
    .orderBy(asc(productCategories.sortOrder), asc(products.name));
  return rows;
}

export async function listProductCategoriesForAdmin() {
  return db.select({ id: productCategories.id, name: productCategories.name }).from(productCategories).orderBy(asc(productCategories.sortOrder));
}

export async function getAdminProduct(id: string) {
  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) return null;
  const [categories, variants, images] = await Promise.all([
    listProductCategoriesForAdmin(),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        priceMinor: productVariants.priceMinor,
        status: productVariants.status,
        quantityAvailable: inventoryRecords.quantityAvailable,
        reservedQuantity: inventoryRecords.reservedQuantity,
      })
      .from(productVariants)
      .leftJoin(inventoryRecords, eq(inventoryRecords.variantId, productVariants.id))
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.createdAt)),
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder), asc(productImages.createdAt)),
  ]);
  const variant = variants[0] ?? null;
  const readiness = productReadiness({ priceMinor: variant?.priceMinor ?? 0, description: product.description, imageCount: images.length });
  return { product, categories, variant, images, readiness };
}

// ── Writes ─────────────────────────────────────────────────────

export async function createProduct(actor: Actor, input: { name: string; categoryId: string }) {
  allow(actor);
  const base = slugify(input.name) || "item";
  return db.transaction(async (tx) => {
    // Unique slug and SKU, even when two items share a name.
    const taken = await tx.select({ slug: products.slug }).from(products).where(sql`${products.slug} like ${base + "%"}`);
    let slug = base;
    for (let n = 2; taken.some((t) => t.slug === slug); n++) slug = `${base}-${n}`;
    const [p] = await tx
      .insert(products)
      .values({ name: input.name, slug, categoryId: input.categoryId, description: "", status: "draft" })
      .returning({ id: products.id });
    const [v] = await tx
      .insert(productVariants)
      .values({ productId: p.id, sku: `LMY-${slug.toUpperCase()}`.slice(0, 60), priceMinor: 0, status: "draft" })
      .returning({ id: productVariants.id });
    await tx.insert(inventoryRecords).values({ variantId: v.id, quantityAvailable: 0 });
    await audit(tx, actor, "product.create", p.id, null, input);
    return p.id;
  });
}

export type ProductUpdate = { name: string; description: string; categoryId: string; priceMinor: number | null; stock: number };

export async function updateProduct(actor: Actor, id: string, input: ProductUpdate) {
  allow(actor);
  await db.transaction(async (tx) => {
    const before = await tx.query.products.findFirst({ where: eq(products.id, id) });
    if (!before) throw new WorkflowError("Item not found.");
    const [variant] = await tx
      .select({ id: productVariants.id, priceMinor: productVariants.priceMinor, status: productVariants.status })
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.createdAt))
      .limit(1);
    if (!variant) throw new WorkflowError("This item has no price row. Contact your developer.");
    const [inv] = await tx.select().from(inventoryRecords).where(eq(inventoryRecords.variantId, variant.id));

    if (before.status === "published" && (input.priceMinor === null || input.description.trim().length < 20))
      throw new WorkflowError("A live item needs a price and a description. Unpublish it first if you need to clear them.");
    if (inv && input.stock < inv.reservedQuantity)
      throw new WorkflowError(`${inv.reservedQuantity} are held in open orders, so stock can't go below that.`);

    await tx.update(products).set({ name: input.name, description: input.description, categoryId: input.categoryId, isSample: false }).where(eq(products.id, id));
    const priceMinor = input.priceMinor ?? 0;
    if (priceMinor !== variant.priceMinor) await tx.update(productVariants).set({ priceMinor }).where(eq(productVariants.id, variant.id));
    if (inv) await tx.update(inventoryRecords).set({ quantityAvailable: input.stock }).where(eq(inventoryRecords.id, inv.id));
    else await tx.insert(inventoryRecords).values({ variantId: variant.id, quantityAvailable: input.stock });

    await audit(
      tx,
      actor,
      "product.update",
      id,
      { name: before.name, categoryId: before.categoryId, priceMinor: variant.priceMinor, stock: inv?.quantityAvailable ?? 0 },
      { name: input.name, categoryId: input.categoryId, priceMinor, stock: input.stock },
    );
  });
}

export async function addProductImage(actor: Actor, id: string, file: File, altText: string) {
  allow(actor);
  const problem = checkImage(file);
  if (problem) throw new WorkflowError(problem);
  const exists = await db.query.products.findFirst({ where: eq(products.id, id), columns: { id: true } });
  if (!exists) throw new WorkflowError("Item not found.");
  const path = productImagePath(id, file.type as keyof typeof IMAGE_TYPES, randomUUID());
  await uploadProductImage(path, file);
  try {
    await db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(productImages).where(eq(productImages.productId, id));
      await tx.insert(productImages).values({ productId: id, storagePath: path, altText, sortOrder: n });
      await audit(tx, actor, "product.image_add", id, null, { path, altText });
    });
  } catch (err) {
    await deleteProductImage(path); // don't leave an orphaned file behind
    throw err;
  }
}

export async function removeProductImage(actor: Actor, id: string, imageId: string) {
  allow(actor);
  const path = await db.transaction(async (tx) => {
    const [img] = await tx.select().from(productImages).where(and(eq(productImages.id, imageId), eq(productImages.productId, id)));
    if (!img) throw new WorkflowError("Photo not found.");
    const product = await tx.query.products.findFirst({ where: eq(products.id, id), columns: { status: true } });
    const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(productImages).where(eq(productImages.productId, id));
    if (product?.status === "published" && n <= 1) throw new WorkflowError("A live item needs at least one photo. Add another first, or unpublish it.");
    await tx.delete(productImages).where(eq(productImages.id, imageId));
    await audit(tx, actor, "product.image_remove", id, { path: img.storagePath }, null);
    return img.storagePath;
  });
  await deleteProductImage(path);
}

export async function makeCoverImage(actor: Actor, id: string, imageId: string) {
  allow(actor);
  await db.transaction(async (tx) => {
    const imgs = await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
    if (!imgs.some((i) => i.id === imageId)) throw new WorkflowError("Photo not found.");
    const order = [imageId, ...imgs.map((i) => i.id).filter((x) => x !== imageId)];
    for (const [i, imgId] of order.entries()) await tx.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, imgId));
    await audit(tx, actor, "product.image_cover", id, null, { imageId });
  });
}

export async function setProductPublished(actor: Actor, id: string, publish: boolean) {
  allow(actor);
  if (publish) {
    const data = await getAdminProduct(id);
    if (!data) throw new WorkflowError("Item not found.");
    if (!data.readiness.ready) throw new WorkflowError(`Not ready yet: ${data.readiness.missing.join("; ")}.`);
  }
  await db.transaction(async (tx) => {
    const status = publish ? ("published" as const) : ("draft" as const);
    await tx
      .update(products)
      .set(publish ? { status, publishedAt: new Date(), isSample: false } : { status })
      .where(eq(products.id, id));
    // The database also refuses to publish a variant without a price (product_variants_published_price_check).
    const variantIds = (await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, id))).map((v) => v.id);
    if (variantIds.length) await tx.update(productVariants).set({ status }).where(inArray(productVariants.id, variantIds));
    await audit(tx, actor, publish ? "product.publish" : "product.unpublish", id, null, { status });
  });
}
