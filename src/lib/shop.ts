/**
 * Shop rules shared by server code and tests. Pure: no network or database.
 * Owner decisions: customers pay the admin-set price for items only; delivery is agreed after the order.
 * Shoppers must be signed in with a phone number and delivery address. Promo codes are allowed.
 */

export const MAX_QTY_PER_ITEM = 20;

export type Line = { unitPriceMinor: number; quantity: number };

export function subtotal(lines: Line[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
}

export type Promo = {
  code: string;
  discountType: "percent" | "fixed_amount";
  value: number;
  scope: "all" | "shop" | "subscription";
  minSpendMinor: number | null;
  maxDiscountMinor: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perUserLimit: number | null;
  active: boolean;
};

export type PromoResult = { ok: true; discountMinor: number; label: string } | { ok: false; reason: string };

/** Works out a shop discount. Counts are passed in so this stays pure. */
export function applyPromo(
  promo: Promo | null,
  subtotalMinor: number,
  usage: { total: number; byUser: number },
  now = new Date(),
): PromoResult {
  if (!promo || !promo.active) return { ok: false, reason: "That code isn't valid." };
  if (promo.scope === "subscription") return { ok: false, reason: "That code is for memberships, not the shop." };
  if (promo.startsAt && now < promo.startsAt) return { ok: false, reason: "That code isn't active yet." };
  if (promo.endsAt && now > promo.endsAt) return { ok: false, reason: "That code has expired." };
  if (promo.maxRedemptions != null && usage.total >= promo.maxRedemptions) return { ok: false, reason: "That code has been fully used." };
  if (promo.perUserLimit != null && usage.byUser >= promo.perUserLimit) return { ok: false, reason: "You've already used that code." };
  if (promo.minSpendMinor != null && subtotalMinor < promo.minSpendMinor)
    return { ok: false, reason: `Spend at least ₦${(promo.minSpendMinor / 100).toLocaleString("en-NG")} to use that code.` };
  let discount = promo.discountType === "percent" ? Math.floor((subtotalMinor * Math.min(promo.value, 100)) / 100) : promo.value;
  if (promo.maxDiscountMinor != null) discount = Math.min(discount, promo.maxDiscountMinor);
  discount = Math.max(0, Math.min(discount, subtotalMinor - 100)); // never free: Paystack needs at least ₦1
  const label = promo.discountType === "percent" ? `${promo.value}% off` : `₦${(promo.value / 100).toLocaleString("en-NG")} off`;
  return { ok: true, discountMinor: discount, label };
}

export function normalisePromoCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Nigerian mobile numbers: accepts 0803 123 4567, 803..., +234 803..., 234803...
 * Returns +234XXXXXXXXXX or null.
 */
export function normaliseNigerianPhone(input: string): string | null {
  let d = input.replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("234")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  if (!/^[789][01]\d{8}$/.test(d)) return null;
  return `+234${d}`;
}

export function formatPhone(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Short order number customers can read out on the phone, e.g. LMY-7K4Q-2P9D. No 0/O/1/I. */
export function orderNumber(randomBytes: Uint8Array): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const chars = Array.from(randomBytes.slice(0, 8), (b) => alphabet[b % alphabet.length]).join("");
  return `LMY-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

/** How long unpaid orders hold stock before it's released for other shoppers. */
export const RESERVATION_MINUTES = 30;

export const FULFILMENT_LABEL: Record<string, string> = {
  awaiting_delivery_arrangement: "We'll call you to arrange delivery",
  delivery_arranged: "Delivery arranged",
  packing: "Packing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// ── Refunds ────────────────────────────────────────────────────

export type RefundLike = { amountMinor: number; status: "requested" | "processing" | "succeeded" | "failed" };

/** How much of an order's item total can still be refunded. Failed refunds don't count. */
export function refundableMinor(itemsTotalMinor: number, refunds: RefundLike[]): number {
  const used = refunds.filter((r) => r.status !== "failed").reduce((n, r) => n + r.amountMinor, 0);
  return Math.max(itemsTotalMinor - used, 0);
}

/** The order's payment status once refunds are counted. */
export function paymentStatusAfterRefunds(itemsTotalMinor: number, refunds: RefundLike[]): "paid" | "partially_refunded" | "refunded" {
  const left = refundableMinor(itemsTotalMinor, refunds);
  if (left === itemsTotalMinor) return "paid";
  return left === 0 ? "refunded" : "partially_refunded";
}

/** Maps Paystack's refund status onto ours. */
export function refundStatusFromPaystack(s: string): RefundLike["status"] {
  if (s === "processed") return "succeeded";
  if (s === "failed" || s === "reversed") return "failed";
  return "processing";
}
