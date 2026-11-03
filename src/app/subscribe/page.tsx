import Link from "next/link";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { TrackEvent } from "@/components/analytics";
import { Card, FormNotice, HeroCard, Icon, Page, Tag } from "@/components/ui";
import { db } from "@/db/client";
import { subscriptionPlans } from "@/db/schema";
import { formatNaira } from "@/lib/money";
import { requireUser, userHasEntitlement } from "@/server/auth";
import { claimBrowserPlans, getPlanForViewer, latestPlanForUser } from "@/server/grow";

export const metadata: Metadata = { title: "Choose your plan" };
export const dynamic = "force-dynamic";

const INCLUDED = [
  "A full growing plan for every plant you add",
  "Daily care tasks for your space",
  "Ask Loamy, your gardening companion",
  "Track growth, milestones and harvests",
];

function periodLabel(interval: "month" | "year", count: number) {
  if (interval === "year") return count === 1 ? "a year" : `every ${count} years`;
  return count === 3 ? "every 3 months" : count === 1 ? "a month" : `every ${count} months`;
}

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planParam } = await searchParams;
  const user = await requireUser(`/subscribe${planParam ? `?plan=${planParam}` : ""}`);
  await claimBrowserPlans(user.id); // plans made before sign-up now belong to this account
  const subscribed = await userHasEntitlement(user.id, "full_access");

  const fromParam = planParam && z.string().uuid().safeParse(planParam).success ? await getPlanForViewer(planParam, user.id) : null;
  const growPlan = fromParam ? { slug: fromParam.plant.slug, commonName: fromParam.plant.commonName } : await latestPlanForUser(user.id);

  const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.active, true)).orderBy(asc(subscriptionPlans.displayOrder));
  const quarterly = plans.find((p) => p.code === "quarterly");
  const paymentsReady = Boolean(process.env.PAYSTACK_SECRET_KEY);

  return (
    <Page className="pb-12">
      <TrackEvent name="subscription_options_viewed" props={{ billing_options: plans.map((p) => p.code) }} />
      <Link href={growPlan ? `/grow/${growPlan.slug}` : "/discover"} className="flex items-center gap-1.5 self-start text-small font-semibold">
        <Icon name="back" size={18} /> Back
      </Link>

      <HeroCard className="gap-3 px-[22px] py-6">
        <Tag tone="lemon" className="self-start">Loamy membership</Tag>
        <h1 className="text-title">{growPlan ? `Unlock your ${growPlan.commonName.toLowerCase()} plan` : "Grow with a plan made for your space"}</h1>
        <ul className="flex flex-col gap-2 text-ink-on-black">
          {INCLUDED.map((i) => (
            <li key={i} className="flex items-center gap-2">
              <Icon name="check" size={16} /> {i}
            </li>
          ))}
        </ul>
      </HeroCard>

      {subscribed ? (
        <FormNotice tone="success">You’re already a member. Your full plans are in your garden.</FormNotice>
      ) : null}

      <ul className="flex flex-col gap-3" aria-label="Membership options">
        {plans.map((p) => {
          const saving = p.code === "annual" && quarterly ? quarterly.priceMinor * 4 - p.priceMinor : 0;
          return (
            <li key={p.id}>
            <Card className="flex items-center gap-4 p-5">
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{p.name}</p>
                  {saving > 0 ? <Tag tone="lemon">Save {formatNaira(saving)}</Tag> : null}
                </div>
                <p className="text-small text-ink-muted">Renews until you cancel.</p>
              </div>
              <p className="text-right">
                <span className="block text-xl font-bold tabular-nums">{formatNaira(p.priceMinor)}</span>
                <span className="text-small text-ink-muted">{periodLabel(p.billingInterval, p.intervalCount)}</span>
              </p>
            </Card>
            </li>
          );
        })}
      </ul>

      {paymentsReady ? null : (
        <Card className="flex flex-col gap-1 p-5">
          <p className="font-semibold">Payments open soon</p>
          <p className="text-small text-ink-muted">
            We’re finishing secure payments with Paystack. Your plan is saved to your account, so you can pick up right here.
          </p>
        </Card>
      )}
    </Page>
  );
}
