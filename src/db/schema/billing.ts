import { boolean, foreignKey, index, integer, jsonb, pgTable, text, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  billingInterval,
  createdAt,
  id,
  paymentProvider,
  paymentPurpose,
  paymentStatus,
  refundStatus,
  subscriptionStatus,
  ts,
  updatedAt,
  webhookStatus,
} from "./_shared";
import { users } from "./identity";
import { orders } from "./shop";

/**
 * Any number of plans. The pricing screen lists active rows ordered by displayOrder;
 * plan cards are never hard-coded. Prices are kobo (₦15,000 = 1_500_000).
 */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: id(),
  code: text().notNull().unique("subscription_plans_code_key"),
  name: text().notNull(),
  description: text(),
  billingInterval: billingInterval().notNull(),
  intervalCount: integer().notNull().default(1),
  priceMinor: integer().notNull(),
  currency: text().notNull().default("NGN"),
  displayOrder: integer().notNull().default(0),
  /** Which entitlement set this plan grants. Lets future plan types unlock different features. */
  entitlementSetKey: text().notNull().default("full_access"),
  providerPlanCode: text(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid()
      .notNull()
      .references(() => subscriptionPlans.id),
    status: subscriptionStatus().notNull().default("pending"),
    providerSubscriptionCode: text().unique("subscriptions_provider_subscription_code_key"),
    startedAt: ts(),
    currentPeriodEnd: ts(),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    cancelledAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.status)],
);

/** Access is decided server-side from active entitlements, never from client state. */
export const subscriptionEntitlements = pgTable(
  "subscription_entitlements",
  {
    id: id(),
    subscriptionId: uuid()
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    entitlementKey: text().notNull(),
    active: boolean().notNull().default(true),
    effectiveFrom: ts().notNull(),
    effectiveUntil: ts(),
  },
  (t) => [index("subscription_entitlements_active_idx").on(t.subscriptionId, t.entitlementKey, t.active)],
);

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    purpose: paymentPurpose().notNull(),
    subscriptionId: uuid().references(() => subscriptions.id, { onDelete: "set null" }),
    orderId: uuid().references((): AnyPgColumn => orders.id, { onDelete: "set null" }),
    provider: paymentProvider().notNull().default("paystack"),
    /** Our server-generated reference, persisted before redirecting to Paystack. */
    reference: text().notNull().unique("payment_transactions_reference_key"),
    providerReference: text(),
    amountMinor: integer().notNull(),
    currency: text().notNull().default("NGN"),
    status: paymentStatus().notNull().default("pending"),
    verifiedAt: ts(),
    rawVerification: jsonb(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("payment_transactions_provider_provider_reference_key").on(t.provider, t.providerReference), index().on(t.status, t.createdAt)],
);

/** Idempotent webhook inbox: one row per provider event. */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: id(),
    provider: paymentProvider().notNull(),
    eventId: text().notNull(),
    eventType: text().notNull(),
    payloadHash: text().notNull(),
    payload: jsonb().notNull(),
    status: webhookStatus().notNull().default("received"),
    error: text(),
    receivedAt: createdAt(),
    processedAt: ts(),
  },
  (t) => [unique("payment_webhook_events_provider_event_id_key").on(t.provider, t.eventId)],
);

export const refundRecords = pgTable(
  "refund_records",
  {
  id: id(),
  paymentTransactionId: uuid().notNull(),
  amountMinor: integer().notNull(),
  reason: text().notNull(),
  status: refundStatus().notNull().default("requested"),
  providerReference: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "refund_records_payment_fk",
      columns: [t.paymentTransactionId],
      foreignColumns: [paymentTransactions.id],
    }).onDelete("cascade"),
  ],
);
