import Link from "next/link";
import type { Metadata } from "next";
import { TrackEvent } from "@/components/analytics";
import { EmptyState, HeroCard, Icon, Page, PhotoCard, QuickAction, Tag, Wordmark } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BUCKETS, publicUrl } from "@/lib/photos";
import { listPlantCategories, listPublishedPlants } from "@/server/catalogue";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

type Search = Promise<{ category?: string; q?: string; unlock?: string }>;

export default async function DiscoverPage({ searchParams }: { searchParams: Search }) {
  const { category, q, unlock } = await searchParams;
  const [plantsRes, catsRes] = await Promise.all([
    listPublishedPlants({ category, q }),
    listPlantCategories(),
  ]);
  const plants = plantsRes.ok ? plantsRes.data : [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cats = catsRes.ok ? catsRes.data : [];

  return (
    <Page>
      <TrackEvent name="discovery_home_viewed" props={{}} />
      {category ? <TrackEvent name="plant_category_viewed" props={{ category_id: category }} /> : null}
      {q && plantsRes.ok ? (
        <TrackEvent name="plant_searched" props={{ search_term: q.slice(0, 64), result_count: plants.length }} />
      ) : null}
      <header className="flex items-center justify-between">
        <Link href="/discover" className="text-[26px]" aria-label="Loamy home">
          <Wordmark />
        </Link>
        <Link
          href="/profile"
          aria-label="Profile"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-lemon"
        >
          <Icon name="user" size={20} />
        </Link>
      </header>

      {unlock ? (
        <p role="status" className="rounded-2xl bg-[#fbe3cf] px-4 py-3 text-small text-[#5c3410]">
          My Garden and Ask Loamy come with a subscription. Start with a free plan preview for any plant.
        </p>
      ) : null}

      <HeroCard className="gap-3.5 px-[22px] pb-[22px] pt-[26px]">
        <Tag tone="lemon" className="self-start">Grow a little joy</Tag>
        <h1 className="text-hero">Your balcony can do more than look good.</h1>
        <p className="text-ink-on-black">Choose what you want to grow. We&apos;ll help you grow it.</p>
        <div className="mt-1.5 flex gap-1.5">
          <QuickAction onBlack href="#search" icon="search" colour="lemon" label="Find a plant" />
          <QuickAction onBlack href="/plants/sweet-basil" icon="sun" colour="peach" label="Can I grow it?" />
          <QuickAction onBlack href="/shop?category=starter-kits" icon="bag" colour="sky" label="Starter kits" />
          <QuickAction onBlack href="/garden" icon="chat" colour="lilac" label="Ask Loamy" />
        </div>
      </HeroCard>

      <form id="search" action="/discover" role="search" className="flex items-center gap-2.5 rounded-full border border-line-strong bg-card px-4">
        <label htmlFor="q" className="sr-only">Search plants</label>
        <Icon name="search" size={20} className="text-ink-muted" />
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search plants, like basil or ugu"
          className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8a8a86]"
        />
        {category ? <input type="hidden" name="category" value={category} /> : null}
      </form>

      {cats.length ? (
        <nav aria-label="Plant categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {[{ slug: "", name: "All" }, ...cats].map((c) => {
            const active = (category ?? "") === c.slug;
            const href = c.slug ? `/discover?category=${c.slug}` : "/discover";
            return (
              <Link
                key={c.slug || "all"}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[38px] flex-none items-center rounded-full border px-4 text-small font-semibold",
                  active ? "border-ink bg-ink text-white" : "border-line-strong bg-card",
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold tracking-[-0.02em]">Ready to grow</h2>
          {plantsRes.ok ? <span className="text-small text-ink-muted">{plants.length} {plants.length === 1 ? "plant" : "plants"}</span> : null}
        </div>
        {!plantsRes.ok ? (
          <EmptyState
            title="We can't load plants right now"
            body="Check your connection and try again in a moment."
          />
        ) : plants.length === 0 ? (
          <EmptyState
            title="No plants here yet"
            body="We only add plants our growing experts have checked. Try another category or search."
          />
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {plants.map((p) => (
              <PhotoCard
                key={p.slug}
                href={`/plants/${p.slug}`}
                title={p.commonName}
                line={p.summaryLine}
                badge={p.category}
                imageUrl={p.coverPath && supabaseUrl ? publicUrl(supabaseUrl, BUCKETS.plants, p.coverPath) : null}
              />
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
