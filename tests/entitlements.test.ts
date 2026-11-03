import { describe, expect, it } from "vitest";
import { entitlementsForSet, hasEntitlement, type EntitlementRow } from "@/server/entitlements";

const now = new Date("2026-11-03T12:00:00Z");
const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  entitlementKey: "my_garden",
  active: true,
  effectiveFrom: new Date("2026-11-01T00:00:00Z"),
  effectiveUntil: new Date("2027-02-01T00:00:00Z"),
  ...over,
});

describe("hasEntitlement", () => {
  it("grants access for an active, current entitlement", () => {
    expect(hasEntitlement([row()], "my_garden", now)).toBe(true);
  });

  it("denies free accounts with no entitlements", () => {
    expect(hasEntitlement([], "my_garden", now)).toBe(false);
  });

  it("denies inactive (cancelled or refunded) entitlements", () => {
    expect(hasEntitlement([row({ active: false })], "my_garden", now)).toBe(false);
  });

  it("denies expired entitlements", () => {
    expect(hasEntitlement([row({ effectiveUntil: new Date("2026-11-02T00:00:00Z") })], "my_garden", now)).toBe(false);
  });

  it("denies entitlements that have not started", () => {
    expect(hasEntitlement([row({ effectiveFrom: new Date("2026-12-01T00:00:00Z") })], "my_garden", now)).toBe(false);
  });

  it("does not grant one key from another", () => {
    expect(hasEntitlement([row({ entitlementKey: "ask_loamy" })], "my_garden", now)).toBe(false);
  });

  it("treats an open-ended entitlement as current", () => {
    expect(hasEntitlement([row({ effectiveUntil: null })], "my_garden", now)).toBe(true);
  });
});

describe("entitlementsForSet", () => {
  it("full_access unlocks the whole subscriber experience, not per plant", () => {
    expect(entitlementsForSet("full_access")).toEqual(
      expect.arrayContaining(["growing_plans", "my_garden", "care_schedules", "ask_loamy"]),
    );
  });

  it("rejects unknown sets", () => {
    expect(() => entitlementsForSet("nope")).toThrow();
  });
});
