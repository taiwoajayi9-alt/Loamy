import { describe, expect, it } from "vitest";
import { LAUNCH_PLANTS, LAUNCH_PRODUCTS } from "@/db/launch-catalogue";

describe("launch catalogue", () => {
  it("has the 16 owner-approved plants with unique slugs", () => {
    expect(LAUNCH_PLANTS).toHaveLength(16);
    expect(new Set(LAUNCH_PLANTS.map((p) => p.slug)).size).toBe(16);
  });
  it("never carries a price (admins set prices, AI and seeds never do)", () => {
    for (const p of LAUNCH_PRODUCTS) expect(Object.keys(p)).not.toContain("price");
    expect(new Set(LAUNCH_PRODUCTS.map((p) => p.sku)).size).toBe(LAUNCH_PRODUCTS.length);
  });
});
