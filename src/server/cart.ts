import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { cartItems, carts, inventoryRecords, productImages, productVariants, products } from "@/db/schema";
import { MAX_QTY_PER_ITEM } from "@/lib/shop";

/**
 * Carts are open to visitors (the shop needs no account). A visitor's cart lives behind a
 * functional cookie and moves into their account when they sign in to check out.
 * Prices are never stored in the cart; they're re-read from the catalogue every time.
 */
const CART_COOKIE = "loamy_cart";

async function cookieCartId(): Promise<string | null> {
  const v = (await cookies()).get(CART_COOKIE)?.value ?? "";
  return /^[0-9a-f-]{36}$/.test(v) ? v : null;
}

async function openCartFor(userId: string | null, cookieId: string | null) {
  if (userId) {
    const mine = await db.query.carts.findFirst({ where: and(eq(carts.userId, userId), eq(carts.status, "open")) });
    // Bring a visitor cart from this browser into the account.
    if (cookieId && cookieId !== mine?.id) {
      const visitor = await db.query.carts.findFirst({ where: and(eq(carts.id, cookieId), eq(carts.status, "open"), isNull(carts.userId)) });
      if (visitor) {
        if (!mine) {
          await db.update(carts).set({ userId }).where(eq(carts.id, visitor.id));
          return visitor.id;
        }
        const items = await db.select().from(cartItems).where(eq(cartItems.cartId, visitor.id));
        for (const it of items)
          await db
            .insert(cartItems)
            .values({ cartId: mine.id, variantId: it.variantId, quantity: it.quantity })
            .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: sql`least(${cartItems.quantity} + ${it.quantity}, ${MAX_QTY_PER_ITEM})` } });
        await db.update(carts).set({ status: "abandoned" }).where(eq(carts.id, visitor.id));
      }
    }
    return mine?.id ?? null;
  }
  if (!cookieId) return null;
  const c = await db.query.carts.findFirst({ where: and(eq(carts.id, cookieId), eq(carts.status, "open"), isNull(carts.userId)) });
  return c?.id ?? null;
}

/** Read-only lookup (safe in pages). */
export async function findCartId(userId: string | null) {
  return openCartFor(userId, await cookieCartId());
}

/** Creates a cart if needed. Only call from server actions (it may set a cookie). */
async function ensureCartId(userId: string | null): Promise<string> {
  const existing = await findCartId(userId);
  if (existing) return existing;
  const [c] = await db.insert(carts).values({ userId }).returning({ id: carts.id });
  if (!userId)
    (await cookies()).set(CART_COOKIE, c.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return c.id;
}

export class CartError extends Error {}

/** Adds a published product's default variant. */
export async function addToCart(userId: string | null, productSlug: string, quantity = 1) {
  const [v] = await db
    .select({ id: productVariants.id, available: sql<number>`coalesce(${inventoryRecords.quantityAvailable} - ${inventoryRecords.reservedQuantity}, 0)`.mapWith(Number) })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventoryRecords, eq(inventoryRecords.variantId, productVariants.id))
    .where(and(eq(products.slug, productSlug), eq(products.status, "published"), eq(productVariants.status, "published")))
    .orderBy(asc(productVariants.createdAt))
    .limit(1);
  if (!v) throw new CartError("That item isn't available.");
  if (v.available <= 0) throw new CartError("Sorry, that's sold out.");
  const cartId = await ensureCartId(userId);
  await db
    .insert(cartItems)
    .values({ cartId, variantId: v.id, quantity: Math.min(quantity, MAX_QTY_PER_ITEM, v.available) })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.variantId],
      set: { quantity: sql`least(${cartItems.quantity} + ${quantity}, ${MAX_QTY_PER_ITEM}, ${v.available})` },
    });
}

export async function setCartQuantity(userId: string | null, itemId: string, quantity: number) {
  const cartId = await findCartId(userId);
  if (!cartId) return;
  if (quantity <= 0) await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
  else await db.update(cartItems).set({ quantity: Math.min(quantity, MAX_QTY_PER_ITEM) }).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
}

export type CartLine = {
  itemId: string;
  variantId: string;
  productSlug: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  available: number;
  coverPath: string | null;
  /** Why this line can't be bought as it is, if anything. */
  problem: string | null;
};

/** The cart with live prices and stock. */
export async function getCart(userId: string | null): Promise<{ cartId: string | null; lines: CartLine[] }> {
  const cartId = await findCartId(userId);
  if (!cartId) return { cartId: null, lines: [] };
  const rows = await db
    .select({
      itemId: cartItems.id,
      variantId: productVariants.id,
      quantity: cartItems.quantity,
      productId: products.id,
      productSlug: products.slug,
      name: products.name,
      productStatus: products.status,
      variantStatus: productVariants.status,
      unitPriceMinor: productVariants.priceMinor,
      available: sql<number>`coalesce(${inventoryRecords.quantityAvailable} - ${inventoryRecords.reservedQuantity}, 0)`.mapWith(Number),
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventoryRecords, eq(inventoryRecords.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.addedAt));
  const covers = rows.length
    ? await db
        .select({ productId: productImages.productId, path: productImages.storagePath, sortOrder: productImages.sortOrder })
        .from(productImages)
        .where(inArray(productImages.productId, rows.map((r) => r.productId)))
        .orderBy(asc(productImages.sortOrder))
    : [];
  return {
    cartId,
    lines: rows.map((r) => ({
      itemId: r.itemId,
      variantId: r.variantId,
      productSlug: r.productSlug,
      name: r.name,
      unitPriceMinor: r.unitPriceMinor,
      quantity: r.quantity,
      available: Math.max(0, r.available),
      coverPath: covers.find((c) => c.productId === r.productId)?.path ?? null,
      problem:
        r.productStatus !== "published" || r.variantStatus !== "published"
          ? "No longer available"
          : r.available <= 0
            ? "Sold out"
            : r.quantity > r.available
              ? `Only ${r.available} left`
              : null,
    })),
  };
}

export async function cartCount(userId: string | null): Promise<number> {
  const cartId = await findCartId(userId);
  if (!cartId) return 0;
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)`.mapWith(Number) }).from(cartItems).where(eq(cartItems.cartId, cartId));
  return r?.n ?? 0;
}
