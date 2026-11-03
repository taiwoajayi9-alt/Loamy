import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Shared column helpers and enums.
 *
 * Conventions (handoff v1.2):
 * - UUID primary keys; createdAt/updatedAt on mutable tables; timestamps stored in UTC (timestamptz).
 * - Money is integer minor units (kobo) plus an ISO currency code. Never floats.
 * - Columns are written camelCase in TypeScript and stored snake_case (drizzle `casing: "snake_case"`).
 * - JSON only for genuinely variable payloads (plan inputs, rule conditions, event properties).
 */

export const id = () => uuid().primaryKey().defaultRandom();

export const createdAt = () => timestamp({ withTimezone: true }).defaultNow().notNull();

export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

export const ts = () => timestamp({ withTimezone: true });

// ── Enums ──────────────────────────────────────────────────────

export const userStatus = pgEnum("user_status", ["active", "suspended", "deletion_requested", "deleted"]);
export const adminRole = pgEnum("admin_role", [
  "super_admin",
  "content_admin",
  "commerce_admin",
  "support_admin",
  /** Horticulture expert who approves plant content before it is published. */
  "plant_expert",
]);
export const consentType = pgEnum("consent_type", ["terms", "privacy_notice", "analytics", "marketing", "whatsapp"]);
export const consentStatus = pgEnum("consent_status", ["granted", "revoked"]);
export const notificationChannel = pgEnum("notification_channel", ["in_app", "email", "whatsapp"]);

export const spaceType = pgEnum("space_type", [
  "balcony",
  "window",
  "rooftop",
  "compound",
  "indoor",
  "kitchen",
  "backyard",
  "other",
]);
export const sunlight = pgEnum("sunlight", ["full", "part", "low"]);
export const waterAccess = pgEnum("water_access", ["easy", "some", "hard"]);
export const experience = pgEnum("experience", ["new", "some", "lots"]);
export const growingMethod = pgEnum("growing_method", ["pot", "grow_bag", "ground", "other"]);

export const publicationStatus = pgEnum("publication_status", ["draft", "in_review", "published", "archived"]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const contentSectionType = pgEnum("content_section_type", [
  "meet",
  "good_for_you",
  "could_you_grow_it",
  "journey",
  "enjoy",
  "lets_grow",
]);
export const questionInputType = pgEnum("question_input_type", [
  "single_choice",
  "multi_choice",
  "number",
  "date",
  "text",
]);
export const suitabilityOutcome = pgEnum("suitability_outcome", ["suitable", "conditional", "unsuitable"]);

export const planStatus = pgEnum("plan_status", ["draft", "preview", "active", "completed", "archived"]);
export const gardenPlantStatus = pgEnum("garden_plant_status", ["active", "completed", "failed", "archived"]);
export const activityType = pgEnum("activity_type", [
  "watering",
  "soil_check",
  "feeding",
  "pruning",
  "repotting",
  "pest_inspection",
  "general_inspection",
  "harvesting",
  "custom",
]);
export const careTaskStatus = pgEnum("care_task_status", ["scheduled", "due", "completed", "skipped", "cancelled"]);

export const aiRole = pgEnum("ai_role", ["user", "assistant", "system"]);
export const escalationStatus = pgEnum("escalation_status", ["open", "in_progress", "resolved"]);

export const billingInterval = pgEnum("billing_interval", ["month", "year"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "pending",
  "active",
  "past_due",
  "expired",
  "cancelled",
  "payment_failed",
  "refunded",
]);
export const paymentProvider = pgEnum("payment_provider", ["paystack"]);
export const paymentPurpose = pgEnum("payment_purpose", ["subscription", "order"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "cancelled", "refunded"]);
export const webhookStatus = pgEnum("webhook_status", ["received", "processed", "ignored", "failed"]);
export const refundStatus = pgEnum("refund_status", ["requested", "processing", "succeeded", "failed"]);

export const orderPaymentStatus = pgEnum("order_payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
]);
/** Owner decision: delivery is arranged after the order is placed. */
export const fulfilmentStatus = pgEnum("fulfilment_status", [
  "awaiting_delivery_arrangement",
  "delivery_arranged",
  "packing",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);
export const discountType = pgEnum("discount_type", ["percent", "fixed_amount"]);
export const promoScope = pgEnum("promo_scope", ["all", "shop", "subscription"]);
export const cartStatus = pgEnum("cart_status", ["open", "converted", "abandoned"]);
