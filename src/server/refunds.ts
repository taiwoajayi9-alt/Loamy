import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, fulfilmentRecords, inventoryRecords, orderItems, orders, paymentTransactions, refundRecords, userProfiles } from "@/db/schema";
import { refundEmail } from "@/lib/email/messages";
import { formatNaira } from "@/lib/money";
import { canManageShop } from "@/lib/product-admin";
import { paymentStatusAfterRefunds, refundableMinor, refundStatusFromPaystack, type RefundLike } from "@/lib/shop";
import { sendEmail, siteUrl } from "./email";
import { paystack, PaystackError } from "./paystack";
import { NotAllowed, WorkflowError, type Actor } from "./plant-admin";

export async function listRefunds(orderId: string) {
  return db
    .select({ id: refundRecords.id, amountMinor: refundRecords.amountMinor, reason: refundRecords.reason, status: refundRecords.status, createdAt: refundRecords.createdAt })
    .from(refundRecords)
    .innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRecords.paymentTransactionId))
    .where(eq(paymentTransactions.orderId, orderId))
    .orderBy(desc(refundRecords.createdAt));
}

/**
 * Refunds all or part of an order's items through Paystack (the delivery fee is collected separately,
 * so it isn't refunded here). The order row is locked while the refund is recorded, so a double click
 * can't refund twice. A full refund can put the items back in stock.
 */
export async function refundOrder(actor: Actor, orderNumber: string, input: { amountMinor: number; reason: string; restock: boolean }) {
  if (!canManageShop(actor.roles)) throw new NotAllowed("You don't have permission to refund orders.");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new WorkflowError("Enter an amount to refund.");

  const staged = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.orderNumber, orderNumber)).for("update");
    if (!order) throw new WorkflowError("Order not found.");
    if (!["paid", "partially_refunded"].includes(order.paymentStatus)) throw new WorkflowError("Only paid orders can be refunded.");
    const [payment] = await tx
      .select()
      .from(paymentTransactions)
      .where(and(eq(paymentTransactions.orderId, order.id), eq(paymentTransactions.purpose, "order"), inArray(paymentTransactions.status, ["succeeded", "refunded"])))
      .limit(1);
    if (!payment) throw new WorkflowError("No successful payment found for this order.");
    const existing = await tx.select().from(refundRecords).where(eq(refundRecords.paymentTransactionId, payment.id));
    const left = refundableMinor(order.itemsTotalMinor, existing);
    if (input.amountMinor > left) throw new WorkflowError(`You can refund up to ${formatNaira(left)} on this order.`);
    const [rec] = await tx
      .insert(refundRecords)
      .values({ paymentTransactionId: payment.id, amountMinor: input.amountMinor, reason: input.reason, status: "processing" })
      .returning();
    return { order, payment, rec };
  });

  let status: RefundLike["status"];
  let providerReference: string | null = null;
  try {
    const r = await paystack.refund({
      transaction: staged.payment.reference,
      amount: input.amountMinor,
      merchant_note: `${orderNumber}: ${input.reason}`.slice(0, 200),
      customer_note: `Refund for Loamy order ${orderNumber}`,
    });
    status = refundStatusFromPaystack(r.status);
    providerReference = String(r.id);
  } catch (err) {
    await db.update(refundRecords).set({ status: "failed" }).where(eq(refundRecords.id, staged.rec.id));
    const why = err instanceof PaystackError ? err.message : "Paystack didn't respond";
    throw new WorkflowError(`Paystack didn't accept the refund: ${why}. Nothing was refunded.`);
  }

  const everything = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, staged.order.id)).for("update");
    await tx.update(refundRecords).set({ status, providerReference }).where(eq(refundRecords.id, staged.rec.id));
    const all = await tx.select().from(refundRecords).where(eq(refundRecords.paymentTransactionId, staged.payment.id));
    const next = paymentStatusAfterRefunds(order.itemsTotalMinor, all);
    const restock = input.restock && next === "refunded" && order.fulfilmentStatus !== "delivered";
    await tx
      .update(orders)
      .set({ paymentStatus: next, ...(next === "refunded" && order.fulfilmentStatus !== "delivered" ? { fulfilmentStatus: "cancelled" as const } : {}) })
      .where(eq(orders.id, order.id));
    if (next === "refunded") await tx.update(paymentTransactions).set({ status: "refunded" }).where(eq(paymentTransactions.id, staged.payment.id));
    if (restock) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const it of items) {
        if (!it.variantId) continue;
        await tx
          .update(inventoryRecords)
          .set({ quantityAvailable: sql`${inventoryRecords.quantityAvailable} + ${it.quantity}` })
          .where(eq(inventoryRecords.variantId, it.variantId));
      }
    }
    await tx.insert(fulfilmentRecords).values({
      orderId: order.id,
      status: next === "refunded" && order.fulfilmentStatus !== "delivered" ? "cancelled" : order.fulfilmentStatus,
      note: `Refunded ${formatNaira(input.amountMinor)}: ${input.reason}${restock ? " (items back in stock)" : ""}`,
      actorId: actor.id,
    });
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      action: "order.refund",
      entityType: "order",
      entityId: order.id,
      before: { paymentStatus: order.paymentStatus },
      after: { amountMinor: input.amountMinor, reason: input.reason, status, providerReference, restocked: restock, paymentStatus: next },
    });
    return { next, userId: order.userId, email: (order.buyerContactSnapshot as { email?: string }).email ?? null };
  });

  if (everything.email) {
    const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, everything.userId) });
    await sendEmail(
      everything.email,
      refundEmail({ site: siteUrl(), firstName: profile?.firstName ?? null, orderNumber, amountMinor: input.amountMinor, full: everything.next === "refunded" }),
      `refund-${staged.rec.id}`,
    );
  }
  return { status, paymentStatus: everything.next };
}

/** Paystack tells us later when a refund finishes or fails (refund.processed / refund.failed). */
export async function applyRefundEvent(evt: { event: string; data: Record<string, unknown> }): Promise<"processed" | "ignored"> {
  const d = evt.data as { id?: number | string; status?: string; transaction_reference?: string; amount?: number; refund_reference?: string };
  const status = evt.event === "refund.processed" ? "succeeded" : evt.event === "refund.failed" ? "failed" : null;
  if (!status) return "ignored";
  const ids = [d.id, d.refund_reference].filter((x) => x !== undefined && x !== null).map(String);
  let rec = ids.length ? (await db.select().from(refundRecords).where(inArray(refundRecords.providerReference, ids)).limit(1))[0] : undefined;
  if (!rec && d.transaction_reference && d.amount) {
    const [row] = await db
      .select({ r: refundRecords })
      .from(refundRecords)
      .innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRecords.paymentTransactionId))
      .where(and(eq(paymentTransactions.reference, d.transaction_reference), eq(refundRecords.amountMinor, d.amount), eq(refundRecords.status, "processing")))
      .limit(1);
    rec = row?.r;
  }
  if (!rec || rec.status === status) return "ignored";
  await db.transaction(async (tx) => {
    await tx.update(refundRecords).set({ status }).where(eq(refundRecords.id, rec!.id));
    const [payment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, rec!.paymentTransactionId));
    if (status === "failed" && payment?.orderId) {
      // A failed refund gives the money back to the order's refundable total.
      const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update");
      const all = await tx.select().from(refundRecords).where(eq(refundRecords.paymentTransactionId, payment.id));
      await tx.update(orders).set({ paymentStatus: paymentStatusAfterRefunds(order.itemsTotalMinor, all) }).where(eq(orders.id, order.id));
      await tx.insert(fulfilmentRecords).values({ orderId: order.id, status: order.fulfilmentStatus, note: `Refund of ${formatNaira(rec!.amountMinor)} failed at Paystack. Try again or refund by transfer.` });
    }
  });
  return "processed";
}
