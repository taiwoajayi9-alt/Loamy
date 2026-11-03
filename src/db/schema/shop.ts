import { boolean, index, integer, jsonb, pgTable, text, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  cartStatus,
  createdAt,
  discountType,
  fulfilmentStatus,
  id,
  orderPaymentStatus,
  promoScope,
  publicationStatus,
  ts,
  updatedAt,
} from "./_shared";
import { subscriptions } from "./billing";
import { anonymousSessions, users } from "./identity";
import { plants } from "./plants";

export const productCategories = pgTable("product_categories", {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique("product_categories_slug_key"),
  sortOrder: integer().notNull().default(0),
  status: publicationStatus().notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Loamy owns all supplies, so there is no supplier table. */
export const products = pgTable(
  "products",
  {
    id: id(),
    categoryId: uuid()
      .notNull()
      .references(() => productCategories.id),
    slug: text().notNull().unique("products_slug_key"),
    name: text().notNull(),
    description: text().notNull(),
    status: publicationStatus().notNull().default("draft"),
    aiDrafted: boolean().notNull().default(false),
    /** Sample/demo product with a sample price. Must never ship to production. */
    isSample: boolean().notNull().default(false),
    publishedAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.categoryId, t.status), index().on(t.status, t.name)],
);

/** Price lives on the variant and is set by an admin. Every product has at least one variant. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text().notNull().default("Default"),
    sku: text().notNull().unique("product_variants_sku_key"),
    priceMinor: integer().notNull(),
    currency: text().notNull().default("NGN"),
    status: publicationStatus().notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.productId)],
);

/** v1.2 — several photos per product or variant. */
export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid().references(() => productVariants.id, { onDelete: "set null" }),
    storagePath: text().notNull(),
    altText: text().notNull(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.productId, t.sortOrder)],
);

export const inventoryRecords = pgTable("inventory_records", {
  id: id(),
  variantId: uuid()
    .notNull()
    .unique("inventory_records_variant_id_key")
    .references(() => productVariants.id, { onDelete: "cascade" }),
  quantityAvailable: integer().notNull().default(0),
  reservedQuantity: integer().notNull().default(0),
  updatedAt: updatedAt(),
});

export const productPlantRelations = pgTable(
  "product_plant_relations",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    relevanceType: text().notNull().default("recommended"),
  },
  (t) => [unique("product_plant_relations_product_id_plant_id_key").on(t.productId, t.plantId)],
);

export const carts = pgTable(
  "carts",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    anonymousSessionId: uuid().references(() => anonymousSessions.id, { onDelete: "set null" }),
    status: cartStatus().notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.status)],
);

/** Prices are re-read from the variant at checkout; carts never store a trusted price. */
export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id),
    quantity: integer().notNull(),
    addedAt: createdAt(),
  },
  (t) => [unique("cart_items_cart_id_variant_id_key").on(t.cartId, t.variantId)],
);

export const deliveryAddresses = pgTable(
  "delivery_addresses",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    recipient: text().notNull(),
    phone: text().notNull(),
    address: text().notNull(),
    area: text().notNull(),
    city: text().notNull().default("Lagos"),
    state: text().notNull().default("Lagos"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

/**
 * Owner decision: delivery is arranged after the order is placed.
 * Customers pay for items at checkout; admins record the delivery fee, date and notes afterwards.
 */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    orderNumber: text().notNull().unique("orders_order_number_key"),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    deliveryAddressId: uuid().references(() => deliveryAddresses.id, { onDelete: "set null" }),
    buyerContactSnapshot: jsonb().notNull(),
    subtotalMinor: integer().notNull(),
    discountMinor: integer().notNull().default(0),
    itemsTotalMinor: integer().notNull(),
    currency: text().notNull().default("NGN"),
    paymentStatus: orderPaymentStatus().notNull().default("pending"),
    fulfilmentStatus: fulfilmentStatus().notNull().default("awaiting_delivery_arrangement"),
    deliveryFeeMinor: integer(),
    deliveryScheduledFor: ts(),
    deliveryNotes: text(),
    supportNotes: text(),
    /** Guest checkout (pending owner approval): hashed token for the order-status link. */
    guestAccessTokenHash: text(),
    placedAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.fulfilmentStatus, t.createdAt)],
);

/** Name and price are snapshots; they never change when the catalogue changes. */
export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid().references(() => productVariants.id, { onDelete: "set null" }),
    productNameSnapshot: text().notNull(),
    variantNameSnapshot: text().notNull(),
    unitPriceMinor: integer().notNull(),
    quantity: integer().notNull(),
    lineTotalMinor: integer().notNull(),
  },
  (t) => [index().on(t.orderId)],
);

export const fulfilmentRecords = pgTable(
  "fulfilment_records",
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: fulfilmentStatus().notNull(),
    note: text(),
    deliveryReference: text(),
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orderId, t.createdAt)],
);

/** Optional reference data admins use when arranging delivery. Not a checkout dependency. */
export const deliveryZones = pgTable("delivery_zones", {
  id: id(),
  name: text().notNull(),
  areas: text().array().notNull().default([]),
  suggestedFeeMinor: integer(),
  currency: text().notNull().default("NGN"),
  etaText: text(),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Owner-approved promo codes. Stored uppercase; validated server-side before payment. */
export const promoCodes = pgTable("promo_codes", {
  id: id(),
  code: text().notNull().unique("promo_codes_code_key"),
  description: text(),
  discountType: discountType().notNull(),
  /** Percent (1–100) for `percent`, kobo for `fixed_amount`. */
  value: integer().notNull(),
  scope: promoScope().notNull().default("all"),
  minSpendMinor: integer(),
  maxDiscountMinor: integer(),
  startsAt: ts(),
  endsAt: ts(),
  maxRedemptions: integer(),
  perUserLimit: integer().default(1),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: id(),
    promoCodeId: uuid()
      .notNull()
      .references(() => promoCodes.id, { onDelete: "restrict" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    subscriptionId: uuid().references((): AnyPgColumn => subscriptions.id, { onDelete: "set null" }),
    discountMinor: integer().notNull(),
    redeemedAt: createdAt(),
  },
  (t) => [index().on(t.promoCodeId), index().on(t.userId)],
);
