import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, FormNotice, Page } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { confirmOrderPayment } from "@/server/checkout";

export const metadata: Metadata = { title: "Confirming your order" };
export const dynamic = "force-dynamic";

/** Paystack returns shoppers here. The payment is re-checked with Paystack before the order counts as paid. */
export default async function CheckoutCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const reference = (sp.reference ?? sp.trxref ?? "").slice(0, 80);
  await requireUser(`/checkout/callback?reference=${encodeURIComponent(reference)}`);
  const result = reference
    ? await confirmOrderPayment(reference).catch((err) => {
        console.error("[checkout/callback]", err);
        return { ok: false as const, reason: "We couldn't confirm your payment just yet.", orderNumber: undefined };
      })
    : { ok: false as const, reason: "We couldn't find a payment to confirm.", orderNumber: undefined };

  if (result.ok) redirect(`/orders/${result.orderNumber}?placed=1`);

  return (
    <Page className="pb-12">
      <h1 className="text-title">Payment not confirmed</h1>
      <FormNotice tone="error">{result.reason}</FormNotice>
      <p className="text-ink-muted">
        If money left your account, don’t pay again. It can take a few minutes to confirm. Refresh this page, or contact us with your reference: {reference || "none"}.
      </p>
      <ButtonLink href="/cart" variant="secondary" full>Back to cart</ButtonLink>
    </Page>
  );
}
