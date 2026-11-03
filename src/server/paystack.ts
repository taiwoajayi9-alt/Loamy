import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Paystack client (https://paystack.com/docs/api/). Server-only: uses the secret key.
 * Test keys (sk_test_) move no real money. Live keys need the owner's approval.
 */

const BASE = "https://api.paystack.co";

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export function paystackMode(): "test" | "live" | "off" {
  const k = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!k) return "off";
  return k.includes("_live_") ? "live" : "test";
}

export class PaystackError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError("Payments aren't set up yet.", 0);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || json.status === false) throw new PaystackError(json.message || `Paystack error ${res.status}`, res.status);
  return json.data as T;
}

export type PaystackPlan = { plan_code: string; amount: number; interval: string; name: string };

export const paystack = {
  createPlan: (p: { name: string; amount: number; interval: string; description?: string }) =>
    call<PaystackPlan>("POST", "/plan", { ...p, currency: "NGN" }),
  fetchPlan: (code: string) => call<PaystackPlan>("GET", `/plan/${encodeURIComponent(code)}`),
  initialize: (p: { email: string; amount: number; reference: string; callback_url: string; plan?: string; metadata?: Record<string, unknown> }) =>
    call<{ authorization_url: string; access_code: string; reference: string }>("POST", "/transaction/initialize", { ...p, currency: "NGN" }),
  verify: (reference: string) =>
    call<{
      id: number;
      status: string;
      amount: number;
      currency: string;
      reference: string;
      paid_at: string | null;
      customer: { email: string; customer_code: string };
      plan?: string | { plan_code?: string } | null;
      metadata?: unknown;
    }>("GET", `/transaction/verify/${encodeURIComponent(reference)}`),
  fetchCustomer: (emailOrCode: string) =>
    call<{ customer_code: string; email: string; subscriptions?: { subscription_code: string; email_token: string; status: string; plan?: { plan_code: string } }[] }>(
      "GET",
      `/customer/${encodeURIComponent(emailOrCode)}`,
    ),
  disableSubscription: (code: string, token: string) => call<unknown>("POST", "/subscription/disable", { code, token }),
  /** Refunds all or part of a successful charge. Paystack processes it over minutes to days. */
  refund: (p: { transaction: string; amount: number; merchant_note?: string; customer_note?: string }) =>
    call<{ id: number; status: string; amount: number }>("POST", "/refund", { ...p, currency: "NGN" }),
};

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = process.env.PAYSTACK_SECRET_KEY ?? ""): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
