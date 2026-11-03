/**
 * Billing rules shared by server code and tests. Pure: no network or database.
 * Money is integer kobo. Access comes from entitlements, never from a payment redirect.
 */

export type Interval = "month" | "year";

/** Paystack's plan intervals for our billing periods. */
export function paystackInterval(interval: Interval, count: number): "monthly" | "quarterly" | "biannually" | "annually" {
  if (interval === "year" && count === 1) return "annually";
  if (interval === "month" && count === 1) return "monthly";
  if (interval === "month" && count === 3) return "quarterly";
  if (interval === "month" && count === 6) return "biannually";
  throw new Error(`Paystack has no interval for every ${count} ${interval}(s).`);
}

/** End of a paid period. Month arithmetic clamps to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addPeriod(from: Date, interval: Interval, count: number): Date {
  const d = new Date(from);
  const months = interval === "year" ? 12 * count : count;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Access runs a little past the paid period so a renewal that's a day late doesn't lock anyone out. */
export const GRACE_DAYS = 3;
export function accessUntil(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/** Our payment reference: unique, unguessable, readable in the Paystack dashboard. */
export function paymentReference(kind: "sub" | "ord", random: string): string {
  return `LMY-${kind.toUpperCase()}-${random.replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

export type VerifiedCharge = { status: string; amount: number; currency: string; reference: string };

/** A charge only counts if Paystack says success for exactly the amount and currency we asked for. */
export function chargeMatches(charge: VerifiedCharge, expected: { reference: string; amountMinor: number; currency?: string }): string | null {
  if (charge.reference !== expected.reference) return "Reference mismatch";
  if (charge.status !== "success") return `Payment not successful (${charge.status})`;
  if (charge.currency !== (expected.currency ?? "NGN")) return "Currency mismatch";
  if (charge.amount !== expected.amountMinor) return "Amount mismatch";
  return null;
}
