import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carts,
  deliveryAddresses,
  fulfilmentRecords,
  inventoryRecords,
  orderItems,
  orders,
  paymentTransactions,
  promoCodes,
  promoRedemptions,
  userProfiles,
} from "@/db/schema";
import { chargeMatches, paymentReference } from "@/lib/billing";
import { applyPromo, normalisePromoCode, orderNumber, RESERVATION_MINUTES, subtotal, type Promo } from "@/lib/shop";
import { trackServer } from "./analytics";
import type { SessionUser } from "./auth";
import { getCart } from "./cart";
import { paystack } from "./paystack";

export class CheckoutError extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DeliveryDetails = { recipient: string; phone: string; address: string; area: string };

async function promoUsage(tx: Tx | typeof db, promoId: string, userId: string) {
  const [r] = await tx
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      byUser: sql<number>`count(*) filter (where ${promoRedemptions.userId} = ${userId})`.mapWith(Number),
    })
    .from(promoRedemptions)
    .where(eq(promoRedemptions.promoCodeId, promoId));
  return r ?? { total: 0, byUser: 0 };
}

/** Checks a promo code against the current cart, for the checkout screen. */
export async function previewPromo(userId: string, code: string, subtotalMinor: number) {
  const promo = await db.query.promoCodes.findFirst({ where: eq(promoCodes.code, normalisePromoCode(code)) });
  const usage = promo ? await promoUsage(db, promo.id, userId) : { total: 0, byUser: 0 };
  return applyPromo(promo as Promo | null, subtotalMinor, usage);
}

/** Frees stock held by orders that were never paid. Runs lazily before checkouts. */
export async function releaseStaleReservations() {
  const cutoff = new Date(Date.now() - RESERVATION_MINUTES * 60_000);
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "pending"), lt(orders.createdAt, cutoff)));
  for (const o of stale) {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(orders).where(and(eq(orders.id, o.id), eq(orders.paymentStatus, "pending"))).for("update");
      if (!locked) return;
      await releaseOrderStock(tx, o.id);
      await tx.update(orders).set({ paymentStatus: "failed", fulfilmentStatus: "cancelled", supportNotes: "Not paid within 30 minutes; stock released." }).where(eq(orders.id, o.id));
    });
  }
}

async function releaseOrderStock(tx: Tx, orderId: string) {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const it of items)
    if (it.variantId)
      await tx
        .update(inventoryRecords)
        .set({ reservedQuantity: sql`greatest(${inventoryRecords.reservedQuantity} - ${it.quantity}, 0)` })
        .where(eq(inventoryRecords.variantId, it.variantId));
}

/**
 * Places an order from the signed-in shopper's cart and opens Paystack.
 * Prices and stock are re-read and locked here; the customer pays for items only.
 */
export async function placeOrder(user: SessionUser, details: DeliveryDetails, promoCode: string | null, siteUrl: string): Promise<string> {
  await releaseStaleReservations();
  const { cartId, lines } = await getCart(user.id);
  if (!cartId || !lines.length) throw new CheckoutError("Your cart is empty.");
  const bad = lines.find((l) => l.problem);
  if (bad) throw new CheckoutError(`${bad.name}: ${bad.problem}. Update your cart and try again.`);

  const reference = paymentReference("ord", randomUUID());
  const { orderId, total, number } = await db.transaction(async (tx) => {
    // Lock stock rows so two shoppers can't buy the last item at the same time.
    const variantIds = lines.map((l) => l.variantId);
    const stock = await tx.select().from(inventoryRecords).where(inArray(inventoryRecords.variantId, variantIds)).for("update");
    for (const l of lines) {
      const s = stock.find((x) => x.variantId === l.variantId);
      const free = s ? s.quantityAvailable - s.reservedQuantity : 0;
      if (l.quantity > free) throw new CheckoutError(free > 0 ? `Only ${free} ${l.name} left. Update your cart.` : `${l.name} just sold out.`);
    }
    const sub = subtotal(lines);
    let discount = 0;
    let promoId: string | null = null;
    if (promoCode) {
      const promo = await tx.query.promoCodes.findFirst({ where: eq(promoCodes.code, normalisePromoCode(promoCode)) });
      const result = applyPromo(promo as Promo | null, sub, promo ? await promoUsage(tx, promo.id, user.id) : { total: 0, byUser: 0 });
      if (!result.ok) throw new CheckoutError(result.reason);
      discount = result.discountMinor;
      promoId = promo!.id;
    }

    // Save the address for next time (reuse an identical one).
    const existing = await tx.query.deliveryAddresses.findFirst({
      where: and(
        eq(deliveryAddresses.userId, user.id),
        eq(deliveryAddresses.phone, details.phone),
        eq(deliveryAddresses.address, details.address),
        eq(deliveryAddresses.area, details.area),
        eq(deliveryAddresses.recipient, details.recipient),
      ),
    });
    const addressId = existing?.id ?? (await tx.insert(deliveryAddresses).values({ userId: user.id, ...details }).returning({ id: deliveryAddresses.id }))[0].id;
    await tx.update(userProfiles).set({ phone: details.phone }).where(eq(userProfiles.userId, user.id));

    const number = orderNumber(randomBytes(8));
    const total = sub - discount;
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: number,
        userId: user.id,
        deliveryAddressId: addressId,
        buyerContactSnapshot: { ...details, email: user.email, promoCode: promoId ? normalisePromoCode(promoCode!) : null },
        subtotalMinor: sub,
        discountMinor: discount,
        itemsTotalMinor: total,
        paymentStatus: "pending",
      })
      .returning({ id: orders.id });
    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        variantId: l.variantId,
        productNameSnapshot: l.name,
        variantNameSnapshot: "Default",
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
        lineTotalMinor: l.unitPriceMinor * l.quantity,
      })),
    );
    for (const l of lines)
      await tx.update(inventoryRecords).set({ reservedQuantity: sql`${inventoryRecords.reservedQuantity} + ${l.quantity}` }).where(eq(inventoryRecords.variantId, l.variantId));
    await tx.insert(paymentTransactions).values({ userId: user.id, purpose: "order", orderId: order.id, reference, amountMinor: total, status: "pending" });
    return { orderId: order.id, total, number };
  });

  try {
    const init = await paystack.initialize({
      email: user.email,
      amount: total,
      reference,
      callback_url: `${siteUrl.replace(/\/$/, "")}/checkout/callback`,
      metadata: { kind: "order", order_number: number, user_id: user.id },
    });
    return init.authorization_url;
  } catch (err) {
    // Couldn't reach Paystack: cancel the order and free the stock straight away.
    await db.transaction(async (tx) => {
      await releaseOrderStock(tx, orderId);
      await tx.update(orders).set({ paymentStatus: "failed", fulfilmentStatus: "cancelled", supportNotes: "Paystack checkout couldn't start." }).where(eq(orders.id, orderId));
      await tx.update(paymentTransactions).set({ status: "cancelled" }).where(eq(paymentTransactions.reference, reference));
    });
    throw err;
  }
}

/** Confirms an order payment with Paystack. Safe to call from the callback page and the webhook. */
export async function confirmOrderPayment(reference: string): Promise<{ ok: true; orderNumber: string } | { ok: false; reason: string; orderNumber?: string }> {
  const charge = await paystack.verify(reference);
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.reference, reference)).for("update");
    if (!payment || payment.purpose !== "order" || !payment.orderId) return { ok: false as const, reason: "We couldn't find that payment." };
    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update");
    if (payment.status === "succeeded") return { ok: true as const, orderNumber: order.orderNumber };

    const problem = chargeMatches(charge, { reference, amountMinor: payment.amountMinor });
    if (problem) {
      if (charge.status === "failed" || charge.status === "abandoned") {
        await tx.update(paymentTransactions).set({ status: "failed", rawVerification: slim(charge) }).where(eq(paymentTransactions.id, payment.id));
        if (order.paymentStatus === "pending") {
          await releaseOrderStock(tx, order.id);
          await tx.update(orders).set({ paymentStatus: "failed", fulfilmentStatus: "cancelled" }).where(eq(orders.id, order.id));
        }
      }
      return {
        ok: false as const,
        orderNumber: order.orderNumber,
        reason: charge.status === "success" ? "The payment didn't match. Contact us and we'll sort it out." : "The payment didn't go through. Nothing was charged.",
      };
    }

    const now = new Date();
    const lateAfterRelease = order.paymentStatus !== "pending"; // paid after the 30-minute hold ended
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const it of items) {
      if (!it.variantId) continue;
      await tx
        .update(inventoryRecords)
        .set({
          quantityAvailable: sql`greatest(${inventoryRecords.quantityAvailable} - ${it.quantity}, 0)`,
          reservedQuantity: lateAfterRelease ? inventoryRecords.reservedQuantity : sql`greatest(${inventoryRecords.reservedQuantity} - ${it.quantity}, 0)`,
        })
        .where(eq(inventoryRecords.variantId, it.variantId));
    }
    await tx
      .update(orders)
      .set({
        paymentStatus: "paid",
        fulfilmentStatus: "awaiting_delivery_arrangement",
        placedAt: now,
        supportNotes: lateAfterRelease ? "Paid after the stock hold expired. Check stock before confirming delivery." : order.supportNotes,
      })
      .where(eq(orders.id, order.id));
    await tx.insert(fulfilmentRecords).values({ orderId: order.id, status: "awaiting_delivery_arrangement", note: "Order paid. Contact the customer to arrange delivery." });
    await tx.update(paymentTransactions).set({ status: "succeeded", providerReference: String(charge.id), verifiedAt: now, rawVerification: slim(charge) }).where(eq(paymentTransactions.id, payment.id));
    await tx.update(carts).set({ status: "converted" }).where(and(eq(carts.userId, order.userId), eq(carts.status, "open")));
    const promo = (order.buyerContactSnapshot as { promoCode?: string | null }).promoCode;
    if (promo && order.discountMinor > 0) {
      const p = await tx.query.promoCodes.findFirst({ where: eq(promoCodes.code, promo) });
      if (p) await tx.insert(promoRedemptions).values({ promoCodeId: p.id, userId: order.userId, orderId: order.id, discountMinor: order.discountMinor });
    }
    await trackServer("order_completed", { order_id: order.id, value: order.itemsTotalMinor }, order.userId);
    return { ok: true as const, orderNumber: order.orderNumber };
  });
}

export async function listOrders(userId: string) {
  return db.select().from(orders).where(and(eq(orders.userId, userId), inArray(orders.paymentStatus, ["paid", "refunded", "partially_refunded"]))).orderBy(desc(orders.placedAt));
}

export async function getOrder(userId: string, number: string) {
  const order = await db.query.orders.findFirst({ where: and(eq(orders.userId, userId), eq(orders.orderNumber, number)) });
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { order, items };
}

export async function lastAddress(userId: string) {
  return db.query.deliveryAddresses.findFirst({ where: eq(deliveryAddresses.userId, userId), orderBy: desc(deliveryAddresses.createdAt) });
}

function slim(c: { id?: number; status?: string; amount?: number; currency?: string; reference?: string; paid_at?: string | null }) {
  return { id: c.id, status: c.status, amount: c.amount, currency: c.currency, reference: c.reference, paid_at: c.paid_at };
}
