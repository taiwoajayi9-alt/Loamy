import Link from "next/link";
import type { Metadata } from "next";
import { CareTaskCard } from "@/components/care-task";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, EmptyState, FormNotice, HeroCard, Icon, Page, PhotoPlaceholder, QuickAction, Tag } from "@/components/ui";
import { env } from "@/lib/env";
import { getSessionUser, userHasEntitlement } from "@/server/auth";
import { getGardenOverview, plansNotInGarden } from "@/server/garden";
import { addToGardenAction } from "./actions";

export const metadata: Metadata = { title: "My Garden" };
export const dynamic = "force-dynamic";

/**
 * Subscriber area. Access is decided on the server from active entitlements.
 * Visitors and free accounts see an invitation, never subscriber data.
 */
export default async function GardenPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { notice, error } = await searchParams;
  const user = env.authConfigured() ? await getSessionUser() : null;
  const entitled = user ? await userHasEntitlement(user.id, "my_garden") : false;

  if (!user || !entitled) {
    return (
      <Page>
        <h1 className="text-title">My Garden</h1>
        <PhotoPlaceholder label="herbs on a sunny balcony" className="h-[200px] rounded-card" />
        <h2 className="text-xl font-bold leading-snug">Your first garden starts with one plant.</h2>
        <p className="text-ink-muted">
          Pick a plant you’d love to grow. We’ll check your space and show you a free plan preview first. Members get daily care tasks here.
        </p>
        <ButtonLink href="/discover" full>Find a plant to grow</ButtonLink>
        {user ? <ButtonLink href="/subscribe" variant="secondary" full>See membership options</ButtonLink> : null}
      </Page>
    );
  }

  const [{ garden, plants, tasks, doneToday }, plans] = await Promise.all([getGardenOverview(user.id), plansNotInGarden(user.id)]);
  const total = tasks.length + doneToday;

  return (
    <Page>
      <h1 className="text-title">{garden?.name ?? "My Garden"}</h1>
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <HeroCard>
        <div className="flex items-center justify-between">
          <span className="text-eyebrow uppercase text-lemon">Today</span>
          <Tag tone={tasks.length ? "lemon" : "grey"}>
            {plants.length ? `${plants.length} plant${plants.length === 1 ? "" : "s"}` : "No plants yet"}
          </Tag>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-big tabular-nums">{doneToday}/{total}</span>
          <span className="text-ink-on-black">care tasks done</span>
        </div>
        {total > 0 ? (
          <div className="h-2 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
            <div className="h-full rounded-full bg-lemon" style={{ width: `${Math.round((doneToday / total) * 100)}%` }} />
          </div>
        ) : null}
        <p className="text-small text-ink-on-black">
          {!plants.length ? "Add your first plant to get daily care tasks." : tasks.length ? "Your plants may be ready for some attention." : "All done for today. Your little garden is coming along."}
        </p>
        <div className="mt-1 flex gap-1.5">
          <QuickAction onBlack href="/discover" icon="plus" colour="sky" label="Add plant" />
          <QuickAction onBlack href="/shop" icon="bag" colour="peach" label="Supplies" />
          <QuickAction onBlack href="/discover" icon="search" colour="lilac" label="Explore" />
          <QuickAction onBlack href="/profile" icon="user" colour="sage" label="Account" />
        </div>
      </HeroCard>

      {tasks.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="today-h">
          <h2 id="today-h" className="text-lg font-semibold">To do today</h2>
          {tasks.map((t) => (
            <CareTaskCard key={t.id} task={t} back="/garden" showPlant />
          ))}
        </section>
      ) : null}

      {plans.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="plans-h">
          <h2 id="plans-h" className="text-lg font-semibold">Ready to plant</h2>
          {plans.map((p) => (
            <Card key={p.id} className="flex items-center gap-3 p-4">
              <div className="flex-1">
                <p className="font-semibold">{p.commonName}</p>
                <p className="text-small text-ink-muted">{p.suitability === "conditional" ? "Good with a few tweaks" : "A good match for your space"}</p>
              </div>
              <form action={addToGardenAction}>
                <input type="hidden" name="planId" value={p.id} />
                <SubmitButton pendingLabel="Adding…">Add to garden</SubmitButton>
              </form>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="plants-h">
        <h2 id="plants-h" className="text-lg font-semibold">Your plants</h2>
        {plants.length === 0 ? (
          <EmptyState title="No plants in your garden yet" body="Pick a plant, check it suits your space, then add it here." action={<ButtonLink href="/discover" size="sm">Find a plant</ButtonLink>} />
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {plants.map((p) => (
              <li key={p.id}>
                <Link href={`/garden/plants/${p.id}`}>
                  <Card className="flex h-full flex-col gap-2 p-4 hover:border-line-strong">
                    <PhotoPlaceholder label={p.commonName.toLowerCase()} caption="none" className="h-24 rounded-xl" />
                    <p className="font-semibold leading-tight">{p.name}</p>
                    <p className="text-small text-ink-muted">{p.stage ?? "Growing"}</p>
                    {p.due ? <Tag tone="lemon" className="self-start">{p.due} to do</Tag> : <span className="flex items-center gap-1 text-small text-leaf-ink"><Icon name="check" size={14} /> All done</span>}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
