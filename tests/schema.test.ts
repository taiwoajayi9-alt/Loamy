import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

// Column names may be camelCase in config (snake_case is applied at query time), so compare normalised.
const norm = (s: string) => s.replace(/_/g, "").toLowerCase();

/** Guards the data rules from handoff v1.2 so they can't silently regress. */
describe("schema rules", () => {
  it("has the v1.2 scale tables", () => {
    for (const t of [schema.plantQuestions, schema.careTaskTemplates, schema.productImages, schema.deliveryZones, schema.promoCodes]) {
      expect(getTableConfig(t).name).toBeTruthy();
    }
  });

  it("has no supplier table (Loamy owns all supplies)", () => {
    expect(Object.keys(schema).some((k) => k.toLowerCase().includes("supplier"))).toBe(false);
  });

  it("stores money as integers", () => {
    const moneyCols = [
      schema.subscriptionPlans.priceMinor,
      schema.productVariants.priceMinor,
      schema.orders.itemsTotalMinor,
      schema.orderItems.unitPriceMinor,
      schema.paymentTransactions.amountMinor,
    ];
    for (const c of moneyCols) expect(c.columnType).toBe("PgInteger");
  });

  it("keeps saved plants unique per user and plant", () => {
    const cfg = getTableConfig(schema.savedPlants);
    expect(cfg.uniqueConstraints.map((u) => u.columns.map((c) => norm(c.name)))).toContainEqual(["userid", "plantid"]);
  });

  it("makes webhook events idempotent per provider event", () => {
    const cfg = getTableConfig(schema.paymentWebhookEvents);
    expect(cfg.uniqueConstraints.map((u) => u.columns.map((c) => norm(c.name)))).toContainEqual(["provider", "eventid"]);
  });

  it("does not require a delivery fee at checkout (delivery arranged after order)", () => {
    expect(schema.orders.deliveryFeeMinor.notNull).toBe(false);
  });
});
