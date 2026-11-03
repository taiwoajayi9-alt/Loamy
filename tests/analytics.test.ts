import { describe, expect, it } from "vitest";
import { EVENT_SCHEMAS, SERVER_ONLY_EVENTS, parseEvent } from "@/lib/analytics/events";

describe("analytics taxonomy", () => {
  it("covers every event in the build spec", () => {
    const required = [
      "discovery_home_viewed", "plant_category_viewed", "plant_searched", "plant_profile_viewed",
      "plant_content_section_viewed", "plant_quiz_started", "plant_quiz_completed", "plant_saved",
      "plant_removed_from_saved", "plant_shared", "growing_plan_started", "growing_plan_input_completed",
      "growing_plan_preview_viewed", "subscription_options_viewed", "checkout_started", "subscription_activated",
      "subscription_cancelled", "garden_created", "plant_added_to_garden", "care_activity_recorded",
      "milestone_recorded", "harvest_recorded", "ai_conversation_started", "ai_message_sent",
      "ai_response_feedback", "marketplace_viewed", "product_viewed", "product_added_to_cart",
      "checkout_started_marketplace", "order_completed", "whatsapp_opted_in", "whatsapp_opted_out",
    ];
    expect(Object.keys(EVENT_SCHEMAS).sort()).toEqual(required.sort());
  });

  it("accepts valid events", () => {
    expect(parseEvent("plant_profile_viewed", { plant_id: "sweet-basil", category: "Herbs" })).not.toBeNull();
  });

  it("rejects unknown events", () => {
    expect(parseEvent("password_typed", {})).toBeNull();
  });

  it("rejects extra properties, so personal data can't slip in", () => {
    expect(parseEvent("plant_saved", { plant_id: "mint", email: "ada@example.com" })).toBeNull();
    expect(parseEvent("ai_message_sent", { context_type: "garden", message: "my plant is dying" })).toBeNull();
  });

  it("normalises and caps search terms", () => {
    expect(parseEvent("plant_searched", { search_term: "  BASIL " })?.props.search_term).toBe("basil");
    expect(parseEvent("plant_searched", { search_term: "x".repeat(65) })).toBeNull();
  });

  it("keeps revenue events server-only", () => {
    expect(SERVER_ONLY_EVENTS.has("order_completed")).toBe(true);
    expect(SERVER_ONLY_EVENTS.has("subscription_activated")).toBe(true);
  });
});
