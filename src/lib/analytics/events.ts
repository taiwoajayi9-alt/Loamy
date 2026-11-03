import { z } from "zod";

/**
 * Loamy event taxonomy (build spec section 16.3). The only events the app may record.
 * Each event has a strict property schema: unknown properties are rejected, and free text is limited
 * to the search term (trimmed, lower-cased, capped). Never add message bodies, names, phone numbers,
 * addresses or emails here.
 */

const id = z.string().min(1).max(80);
const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);
const money = z.number().int().nonnegative();

export const EVENT_SCHEMAS = {
  discovery_home_viewed: z.object({}).strict(),
  plant_category_viewed: z.object({ category_id: slug }).strict(),
  plant_searched: z
    .object({
      search_term: z.string().trim().toLowerCase().max(64),
      result_count: z.number().int().nonnegative().optional(),
    })
    .strict(),
  plant_profile_viewed: z.object({ plant_id: slug, category: z.string().max(40).optional() }).strict(),
  plant_content_section_viewed: z.object({ plant_id: slug, section: z.string().max(40) }).strict(),
  plant_quiz_started: z.object({ plant_id: slug.optional(), quiz_id: id }).strict(),
  plant_quiz_completed: z.object({ plant_id: slug.optional(), quiz_id: id, result: z.enum(["correct", "incorrect"]) }).strict(),
  plant_saved: z.object({ plant_id: slug }).strict(),
  plant_removed_from_saved: z.object({ plant_id: slug }).strict(),
  plant_shared: z.object({ plant_id: slug }).strict(),
  growing_plan_started: z.object({ plant_id: slug }).strict(),
  growing_plan_input_completed: z.object({ plant_id: slug, input_type: z.string().max(40) }).strict(),
  growing_plan_preview_viewed: z.object({ plant_id: slug }).strict(),
  subscription_options_viewed: z.object({ billing_options: z.array(z.string().max(20)).max(10) }).strict(),
  checkout_started: z.object({ plan_type: z.string().max(20), price: money }).strict(),
  subscription_activated: z.object({ plan_type: z.string().max(20), transaction_id: id }).strict(),
  subscription_cancelled: z.object({ plan_type: z.string().max(20) }).strict(),
  garden_created: z.object({ garden_type: z.string().max(20) }).strict(),
  plant_added_to_garden: z.object({ plant_id: slug, garden_id: id }).strict(),
  care_activity_recorded: z.object({ activity_type: z.string().max(30), plant_id: slug }).strict(),
  milestone_recorded: z.object({ milestone_type: z.string().max(40), plant_id: slug }).strict(),
  harvest_recorded: z.object({ plant_id: slug, quantity: z.number().nonnegative(), unit: z.string().max(20) }).strict(),
  ai_conversation_started: z.object({ context_type: z.string().max(30) }).strict(),
  ai_message_sent: z.object({ context_type: z.string().max(30) }).strict(),
  ai_response_feedback: z.object({ helpful: z.boolean(), issue_type: z.string().max(40).optional() }).strict(),
  marketplace_viewed: z.object({ category_id: slug.optional() }).strict(),
  product_viewed: z.object({ product_id: slug, category: z.string().max(40).optional() }).strict(),
  product_added_to_cart: z.object({ product_id: slug, quantity: z.number().int().positive() }).strict(),
  checkout_started_marketplace: z.object({ cart_value: money }).strict(),
  order_completed: z.object({ order_id: id, value: money }).strict(),
  whatsapp_opted_in: z.object({ consent_source: z.string().max(40) }).strict(),
  whatsapp_opted_out: z.object({ consent_source: z.string().max(40) }).strict(),
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;
export type EventProps<N extends EventName> = z.input<(typeof EVENT_SCHEMAS)[N]>;

/** Events that may only be recorded by the server after verification (never from the browser). */
export const SERVER_ONLY_EVENTS: ReadonlySet<EventName> = new Set([
  "subscription_activated",
  "subscription_cancelled",
  "order_completed",
]);

export function isEventName(name: unknown): name is EventName {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, name);
}

/** Validates and normalises an event. Returns null when the event or its properties aren't allowed. */
export function parseEvent(name: unknown, props: unknown): { name: EventName; props: Record<string, unknown> } | null {
  if (!isEventName(name)) return null;
  const parsed = EVENT_SCHEMAS[name].safeParse(props ?? {});
  return parsed.success ? { name, props: parsed.data as Record<string, unknown> } : null;
}

// Consent and identity cookies (first-party only).
export const CONSENT_COOKIE = "loamy_analytics";
export const ANON_ID_COOKIE = "loamy_aid";
export const ANALYTICS_POLICY_VERSION = "2026-11-03";
