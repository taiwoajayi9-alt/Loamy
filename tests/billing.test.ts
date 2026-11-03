import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accessUntil, addPeriod, chargeMatches, paymentReference, paystackInterval } from "@/lib/billing";
import { verifyWebhookSignature } from "@/server/paystack";

describe("billing periods", () => {
  it("maps our plans to Paystack intervals", () => {
    expect(paystackInterval("month", 3)).toBe("quarterly");
    expect(paystackInterval("year", 1)).toBe("annually");
    expect(() => paystackInterval("month", 2)).toThrow();
  });
  it("adds months safely at month ends", () => {
    expect(addPeriod(new Date("2026-11-03T10:00:00Z"), "month", 3).toISOString()).toBe("2027-02-03T10:00:00.000Z");
    expect(addPeriod(new Date("2026-11-30T10:00:00Z"), "month", 3).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(addPeriod(new Date("2028-02-29T10:00:00Z"), "year", 1).toISOString()).toBe("2029-02-28T10:00:00.000Z");
  });
  it("gives a short grace period after the paid period", () => {
    expect(accessUntil(new Date("2027-02-03T10:00:00Z")).toISOString()).toBe("2027-02-06T10:00:00.000Z");
  });
});

describe("payment checks", () => {
  const ok = { status: "success", amount: 1_500_000, currency: "NGN", reference: "LMY-SUB-ABC" };
  it("accepts only the exact amount, currency and reference", () => {
    expect(chargeMatches(ok, { reference: "LMY-SUB-ABC", amountMinor: 1_500_000 })).toBeNull();
    expect(chargeMatches({ ...ok, amount: 100 }, { reference: "LMY-SUB-ABC", amountMinor: 1_500_000 })).toMatch(/Amount/);
    expect(chargeMatches({ ...ok, currency: "USD" }, { reference: "LMY-SUB-ABC", amountMinor: 1_500_000 })).toMatch(/Currency/);
    expect(chargeMatches({ ...ok, status: "abandoned" }, { reference: "LMY-SUB-ABC", amountMinor: 1_500_000 })).toMatch(/not successful/);
    expect(chargeMatches(ok, { reference: "LMY-SUB-XYZ", amountMinor: 1_500_000 })).toMatch(/Reference/);
  });
  it("makes readable, unique references", () => {
    expect(paymentReference("sub", "1b4e28ba-2fa1-11d2-883f-0016d3cca427")).toBe("LMY-SUB-1B4E28BA2FA111D2883F");
  });
  it("only trusts webhooks signed with our secret", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
    const sig = createHmac("sha512", "sk_test_secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "sk_test_secret")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, "sk_test_secret")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "sk_test_other")).toBe(false);
    expect(verifyWebhookSignature(body, null, "sk_test_secret")).toBe(false);
  });
});
