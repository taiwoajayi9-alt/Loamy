import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, HeroCard, Icon, Page, PhotoPlaceholder, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNaira } from "@/lib/money";
import { listProductCategories, listPublishedProducts } from "@/server/catalogue";

export const metadata: Metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const [productsRes, catsRes] = await Promise.all([listPublishedProducts({ category }), listProductCategories()]);
  const items = productsRes.ok ? productsRes.data : [];
  const cats = catsRes.ok ? catsRes.data : [];
  const hasSamples = items.some((p) => p.isSample);

  return (
    <Page>
      <HeroCard className="px-[22px] py-6">
        <Tag tone="lemon" className="self-start">Loamy shop</Tag>
        <h1 className="text-title">Everything to start growing.</h1>
        <p className="text-ink-on-black">Picked by Loamy, delivered within Lagos. No subscription needed.</p>
      </HeroCard>

      {cats.length ? (
        <nav aria-label="Product categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {[{ slug: "", name: "All" }, ...cats].map((c) => {
            const active = (category ?? "") === c.slug;
            return (
              <Link
                key={c.slug || "all"}
                href={c.slug ? `/shop?category=${c.slug}` : "/shop"}
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

      {!productsRes.ok ? (
        <EmptyState title="We can't load the shop right now" body="Check your connection and try again in a moment." />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing here yet" body="We add new supplies often. Check back soon." />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p) => {
            const soldOut = p.stock <= 0;
            return (
              <li key={p.slug}>
                <Card className="flex items-center gap-3.5 p-3">
                  <PhotoPlaceholder label="product" tone="grey" caption="none" className="h-[88px] w-[88px] flex-none rounded-xl" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-small text-ink-muted">{p.category}</p>
                    <p className="font-semibold tabular-nums">{formatNaira(p.fromPriceMinor)}</p>
                    {soldOut ? <p className="text-small font-medium text-danger-ink">Sold out</p> : null}
                  </div>
                  <button
                    type="button"
                    disabled
                    aria-label={`Add ${p.name} to cart (cart arrives in Phase 4)`}
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-ink text-white disabled:opacity-40"
                  >
                    <Icon name="plus" size={20} />
                  </button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-small text-ink-muted">
        Delivery is arranged after you order.{hasSamples ? " Sample prices in development." : ""}
      </p>
    </Page>
  );
}
