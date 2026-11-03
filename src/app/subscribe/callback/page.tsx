import type { Metadata } from "next";
import { ButtonLink, FormNotice, HeroCard, Page, Tag } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { confirmSubscriptionPayment } from "@/server/billing";
import { addPlanToGarden } from "@/server/garden";
import { latestPlanForUser } from "@/server/grow";

export const metadata: Metadata = { title: "Confirming your payment" };
export const dynamic = "force-dynamic";

/**
 * Paystack sends members here after paying. We never trust the redirect itself:
 * the payment is re-checked with Paystack on the server before membership is switched on.
 */
export default async function SubscribeCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const reference = (sp.reference ?? sp.trxref ?? "").slice(0, 80);
  const user = await requireUser(`/subscribe/callback?reference=${encodeURIComponent(reference)}`);
  const result = reference
    ? await confirmSubscriptionPayment(reference).catch((err) => {
        console.error("[subscribe/callback]", err);
        return { ok: false as const, reason: "We couldn't confirm your payment just yet." };
      })
    : { ok: false as const, reason: "We couldn't find a payment to confirm." };

  if (result.ok) {
    // Put the plan they just unlocked straight into their garden.
    const latest = await latestPlanForUser(user.id).catch(() => null);
    const gardenPlantId = latest && latest.suitability !== "unsuitable" ? await addPlanToGarden(user, latest.id).catch(() => null) : null;
    return (
      <Page className="pb-12">
        <HeroCard className="gap-3 px-[22px] py-7">
          <Tag tone="lemon" className="self-start">Payment confirmed</Tag>
          <h1 className="text-title">Welcome to Loamy. Let’s grow.</h1>
          <p className="text-ink-on-black">Your {result.planName} membership is active. Your full plans, daily care and Ask Loamy are unlocked.</p>
        </HeroCard>
        <ButtonLink href={gardenPlantId ? `/garden/plants/${gardenPlantId}` : "/garden"} full>
          {gardenPlantId && latest ? `Start growing your ${latest.commonName.toLowerCase()}` : "Go to my garden"}
        </ButtonLink>
        <ButtonLink href="/discover" variant="secondary" full>Find more plants</ButtonLink>
      </Page>
    );
  }
  return (
    <Page className="pb-12">
      <h1 className="text-title">Payment not confirmed</h1>
      <FormNotice tone="error">{result.reason}</FormNotice>
      <p className="text-ink-muted">If money left your account, don’t pay again. It can take a few minutes to confirm. Refresh this page, or contact us with your reference: {reference || "none"}.</p>
      <ButtonLink href="/subscribe" variant="secondary" full>Back to membership</ButtonLink>
    </Page>
  );
}
