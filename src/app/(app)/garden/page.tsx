import type { Metadata } from "next";
import { ButtonLink, EmptyState, HeroCard, Page, PhotoPlaceholder, QuickAction, Tag } from "@/components/ui";
import { env } from "@/lib/env";
import { getSessionUser, userHasEntitlement } from "@/server/auth";

export const metadata: Metadata = { title: "My Garden" };
export const dynamic = "force-dynamic";

/**
 * Subscriber area. Access is decided on the server from active entitlements.
 * Visitors and free accounts see an invitation, never subscriber data.
 */
export default async function GardenPage() {
  const user = env.authConfigured() ? await getSessionUser() : null;
  const entitled = user ? await userHasEntitlement(user.id, "my_garden") : false;

  if (!entitled) {
    return (
      <Page>
        <h1 className="text-title">My Garden</h1>
        <PhotoPlaceholder label="herbs on a sunny balcony" className="h-[200px] rounded-card" />
        <h2 className="text-xl font-bold leading-snug">Your first garden starts with one plant.</h2>
        <p className="text-ink-muted">
          Pick a plant you&apos;d love to grow. We&apos;ll check your space and show you a free plan preview first.
        </p>
        <ButtonLink href="/discover" full>
          Find a plant to grow
        </ButtonLink>
      </Page>
    );
  }

  return (
    <Page>
      <h1 className="text-title">My Garden</h1>
      <HeroCard>
        <div className="flex items-center justify-between">
          <span className="text-eyebrow uppercase text-lemon">Today</span>
          <Tag tone="grey">No plants yet</Tag>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-big">0/0</span>
          <span className="text-ink-on-black">care tasks done</span>
        </div>
        <div className="mt-1 flex gap-1.5">
          <QuickAction onBlack href="/discover" icon="plus" colour="sky" label="Add plant" />
          <QuickAction onBlack href="/shop" icon="bag" colour="peach" label="Supplies" />
        </div>
      </HeroCard>
      <EmptyState
        title="Gardens arrive in Phase 3"
        body="This is where your plants, today's care tasks and milestones will live."
      />
    </Page>
  );
}
