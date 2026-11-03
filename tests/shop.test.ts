import { describe, expect, it } from "vitest";
import { applyPromo, normaliseNigerianPhone, normalisePromoCode, orderNumber, subtotal, type Promo } from "@/lib/shop";

const base: Promo = { code: "GROW10", discountType: "percent", value: 10, scope: "shop", minSpendMinor: null, maxDiscountMinor: null, startsAt: null, endsAt: null, maxRedemptions: null, perUserLimit: 1, active: true };
const none = { total: 0, byUser: 0 };

describe("cart maths", () => {
  it("adds up lines in kobo", () => {
    expect(subtotal([{ unitPriceMinor: 1_250_000, quantity: 2 }, { unitPriceMinor: 350_000, quantity: 1 }])).toBe(2_850_000);
  });
});

describe("promo codes", () => {
  it("takes a percentage or fixed amount off", () => {
    expect(applyPromo(base, 2_000_000, none)).toEqual({ ok: true, discountMinor: 200_000, label: "10% off" });
    expect(applyPromo({ ...base, discountType: "fixed_amount", value: 300_000 }, 2_000_000, none)).toMatchObject({ ok: true, discountMinor: 300_000 });
  });
  it("respects caps and never makes an order free", () => {
    expect(applyPromo({ ...base, value: 50, maxDiscountMinor: 500_000 }, 2_000_000, none)).toMatchObject({ discountMinor: 500_000 });
    expect(applyPromo({ ...base, discountType: "fixed_amount", value: 5_000_000 }, 1_000_000, none)).toMatchObject({ discountMinor: 999_900 });
  });
  it("refuses codes that don't apply, with a clear reason", () => {
    expect(applyPromo(null, 1, none)).toMatchObject({ ok: false, reason: "That code isn't valid." });
    expect(applyPromo({ ...base, active: false }, 1, none)).toMatchObject({ ok: false });
    expect(applyPromo({ ...base, scope: "subscription" }, 1, none)).toMatchObject({ reason: expect.stringMatching(/memberships/) });
    expect(applyPromo({ ...base, endsAt: new Date("2026-01-01") }, 1, none, new Date("2026-11-03"))).toMatchObject({ reason: "That code has expired." });
    expect(applyPromo({ ...base, maxRedemptions: 5 }, 1, { total: 5, byUser: 0 })).toMatchObject({ reason: "That code has been fully used." });
    expect(applyPromo(base, 1, { total: 1, byUser: 1 })).toMatchObject({ reason: "You've already used that code." });
    expect(applyPromo({ ...base, minSpendMinor: 2_000_000 }, 1_000_000, none)).toMatchObject({ reason: expect.stringMatching(/₦20,000/) });
  });
  it("normalises codes", () => {
    expect(normalisePromoCode(" grow 10 ")).toBe("GROW10");
  });
});

describe("Nigerian phone numbers", () => {
  it("accepts the common ways people type them", () => {
    for (const p of ["0803 123 4567", "08031234567", "+234 803 123 4567", "2348031234567", "803-123-4567", "0909 999 0000", "0701 234 5678"]) expect(normaliseNigerianPhone(p), p).toMatch(/^\+234[789][01]\d{8}$/);
  });
  it("rejects numbers that can't be Nigerian mobiles", () => {
    for (const p of ["12345", "0803 123 456", "0603 123 4567", "+44 7700 900123", "phone"]) expect(normaliseNigerianPhone(p), p).toBeNull();
  });
});

describe("order numbers", () => {
  it("are short and avoid confusing characters", () => {
    const n = orderNumber(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(n).toMatch(/^LMY-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });
});

import { paymentStatusAfterRefunds, refundableMinor, refundStatusFromPaystack } from "@/lib/shop";

describe("refunds", () => {
  it("counts everything except failed refunds", () => {
    const r = [
      { amountMinor: 2000, status: "succeeded" as const },
      { amountMinor: 1000, status: "processing" as const },
      { amountMinor: 5000, status: "failed" as const },
    ];
    expect(refundableMinor(10_000, r)).toBe(7000);
    expect(paymentStatusAfterRefunds(10_000, r)).toBe("partially_refunded");
    expect(paymentStatusAfterRefunds(3000, r)).toBe("refunded");
    expect(paymentStatusAfterRefunds(3000, [])).toBe("paid");
    expect(refundableMinor(2000, r)).toBe(0);
  });
  it("maps Paystack statuses", () => {
    expect(refundStatusFromPaystack("processed")).toBe("succeeded");
    expect(refundStatusFromPaystack("pending")).toBe("processing");
    expect(refundStatusFromPaystack("failed")).toBe("failed");
  });
});
