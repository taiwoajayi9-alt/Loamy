/**
 * Entitlements decide access to subscriber features. One active subscription unlocks the full
 * experience (entitlement set "full_access"); plans can map to other sets later without schema changes.
 * Never infer access from client state or a payment redirect.
 */

export const ENTITLEMENT_SETS: Record<string, readonly string[]> = {
  full_access: ["growing_plans", "my_garden", "care_schedules", "ask_loamy", "progress_tracking"],
};

export type EntitlementKey = (typeof ENTITLEMENT_SETS)["full_access"][number];

export type EntitlementRow = {
  entitlementKey: string;
  active: boolean;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
};

/** Pure check, unit-tested: is `key` granted by any row at time `now`? */
export function hasEntitlement(rows: EntitlementRow[], key: string, now: Date = new Date()): boolean {
  return rows.some(
    (r) =>
      r.active &&
      r.entitlementKey === key &&
      r.effectiveFrom.getTime() <= now.getTime() &&
      (r.effectiveUntil === null || r.effectiveUntil.getTime() > now.getTime()),
  );
}

/** Keys granted when a subscription on a plan with `setKey` is verified as paid. */
export function entitlementsForSet(setKey: string): readonly string[] {
  const keys = ENTITLEMENT_SETS[setKey];
  if (!keys) throw new Error(`Unknown entitlement set: ${setKey}`);
  return keys;
}
