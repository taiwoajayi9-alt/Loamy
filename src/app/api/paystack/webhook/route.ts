import { createHash } from "node:crypto";
import { handlePaystackEvent } from "@/server/billing";
import { verifyWebhookSignature } from "@/server/paystack";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook. Set this URL in Paystack: Settings → API Keys & Webhooks → Test Webhook URL
 * (https://<your-site>/api/paystack/webhook). Renewals and cancellations arrive here.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-paystack-signature"))) return new Response("Invalid signature", { status: 401 });
  let evt: { event: string; data: Record<string, unknown> };
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (typeof evt?.event !== "string" || typeof evt.data !== "object" || !evt.data) return new Response("Bad event", { status: 400 });
  await handlePaystackEvent(evt, createHash("sha256").update(raw).digest("hex"));
  return new Response(null, { status: 200 });
}
