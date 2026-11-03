import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, fulfilmentRecords, orderItems, orders, promoCodes, promoRedemptions } from "@/db/schema";
import { canManageShop } from "@/lib/product-admin";
import { normalisePromoCode } from "@/lib/shop";
import { NotAllowed, WorkflowError, type Actor } from "./plant-admin";

function allow(actor: Actor) {
  if (!canManageShop(actor.roles)) throw new NotAllowed("You don't have permission to manage orders.");
}

export async function listAdminOrders(filter: "open" | "all") {
  const where = filter === "open"
    ? and(eq(orders.paymentStatus, "paid"), inArray(orders.fulfilmentStatus, ["awaiting_delivery_arrangement", "delivery_arranged", "packing", "out_for_delivery"]))
    : ne(orders.paymentStatus, "pending");
  return db.select().from(orders).where(where).orderBy(desc(orders.placedAt), desc(orders.createdAt)).limit(200);
}

export async function getAdminOrder(number: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.orderNumber, number) });
  if (!order) return null;
  const [items, history] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(fulfilmentRecords).where(eq(fulfilmentRecords.orderId, order.id)).orderBy(desc(fulfilmentRecords.createdAt)),
  ]);
  return { order, items, history };
}

export type FulfilmentUpdate = {
  status: "awaiting_delivery_arrangement" | "delivery_arranged" | "packing" | "out_for_delivery" | "delivered" | "cancelled";
  deliveryFeeMinor: number | null;
  deliveryScheduledFor: Date | null;
  deliveryNotes: string | null;
  note: string | null;
};

export async function updateFulfilment(actor: Actor, number: string, u: FulfilmentUpdate) {
  allow(actor);
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.orderNumber, number)).for("update");
    if (!o) throw new WorkflowError("Order not found.");
    if (o.paymentStatus !== "paid") throw new WorkflowError("Only paid orders can be updated.");
    await tx
      .update(orders)
      .set({ fulfilmentStatus: u.status, deliveryFeeMinor: u.deliveryFeeMinor, deliveryScheduledFor: u.deliveryScheduledFor, deliveryNotes: u.deliveryNotes })
      .where(eq(orders.id, o.id));
    if (u.status !== o.fulfilmentStatus || u.note)
      await tx.insert(fulfilmentRecords).values({ orderId: o.id, status: u.status, note: u.note, actorId: actor.id });
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      action: "order.fulfilment_update",
      entityType: "order",
      entityId: o.id,
      before: { status: o.fulfilmentStatus, deliveryFeeMinor: o.deliveryFeeMinor },
      after: { ...u, deliveryScheduledFor: u.deliveryScheduledFor?.toISOString() ?? null },
    });
  });
}

// ── Promo codes ────────────────────────────────────────────────

export async function listPromos() {
  const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  const used = await db
    .select({ id: promoRedemptions.promoCodeId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(promoRedemptions)
    .groupBy(promoRedemptions.promoCodeId);
  return rows.map((r) => ({ ...r, used: used.find((u) => u.id === r.id)?.n ?? 0 }));
}

export type PromoInput = {
  code: string;
  description: string | null;
  discountType: "percent" | "fixed_amount";
  value: number;
  scope: "all" | "shop" | "subscription";
  minSpendMinor: number | null;
  maxRedemptions: number | null;
  perUserLimit: number | null;
  endsAt: Date | null;
};

export async function createPromo(actor: Actor, p: PromoInput) {
  allow(actor);
  const code = normalisePromoCode(p.code);
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new WorkflowError("Codes are 3 to 20 letters or numbers, with no spaces.");
  if (p.discountType === "percent" && (p.value < 1 || p.value > 90)) throw new WorkflowError("Percentage discounts must be between 1 and 90.");
  const exists = await db.query.promoCodes.findFirst({ where: eq(promoCodes.code, code) });
  if (exists) throw new WorkflowError("That code already exists.");
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(promoCodes).values({ ...p, code }).returning({ id: promoCodes.id });
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "promo.create", entityType: "promo_code", entityId: row.id, after: { ...p, code, endsAt: p.endsAt?.toISOString() ?? null } });
  });
}

export async function setPromoActive(actor: Actor, id: string, active: boolean) {
  allow(actor);
  await db.transaction(async (tx) => {
    await tx.update(promoCodes).set({ active }).where(eq(promoCodes.id, id));
    await tx.insert(auditLogs).values({ actorId: actor.id, action: active ? "promo.activate" : "promo.deactivate", entityType: "promo_code", entityId: id });
  });
}
