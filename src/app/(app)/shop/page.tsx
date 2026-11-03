/* eslint-disable @next/next/no-img-element -- product photos are served from Supabase Storage */
import Link from "next/link";
import type { Metadata } from "next";
import { TrackEvent } from "@/components/analytics";
import { ButtonLink, Card, EmptyState, FormNotice, HeroCard, Icon, Page, PhotoPlaceholder, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNaira } from "@/lib/money";
import { publicImageUrl } from "@/lib/product-admin";
import { AddToCart } from "@/components/add-to-cart";
import { getSessionUser } from "@/server/auth";
import { cartCount } from "@/server/cart";
import { listProductCategories, listPublishedProducts } from "@/server/catalogue";

export const metadata: Metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; added?: string; error?: string }> }) {
  const { category, q, added, error } = await searchParams;
  const user = await getSessionUser();
  const inCart = await cartCount(user?.id ?? null).catch(() => 0);
  const [productsRes, catsRes] = await Promise.all([listPublishedProducts({ category, q }), listProductCategories()]);
  const items = productsRes.ok ? productsRes.data : [];
  const cats = catsRes.ok ? catsRes.data : [];
  const hasSamples = items.some((p) => p.isSample);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return (
    <Page>
      <TrackEvent name="marketplace_viewed" props={category ? { category_id: category } : {}} />
      <HeroCard className="px-[22px] py-6">
        <Tag tone="lemon" className="self-start">Loamy shop</Tag>
        <h1 className="text-title">Everything to start growing.</h1>
        <p className="text-ink-on-black">Picked by Loamy, delivered within Lagos. No subscription needed.</p>
      </HeroCard>

      {added ? <FormNotice tone="success">Added to your cart.</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {inCart > 0 ? (
        <ButtonLink href="/cart" variant="lime" full>
          View cart · {inCart} item{inCart === 1 ? "" : "s"}
        </ButtonLink>
      ) : null}

      <form action="/shop" role="search" className="flex items-center gap-2.5 rounded-full border border-line-strong bg-card px-4">
        <label htmlFor="shop-q" className="sr-only">Search the shop</label>
        <Icon name="search" size={20} className="text-ink-muted" />
        <input
          id="shop-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search, like pots or basil"
          className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8a8a86]"
        />
        {category ? <input type="hidden" name="category" value={category} /> : null}
      </form>

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
        <EmptyState title={q ? `Nothing matches “${q.slice(0, 40)}”` : "Nothing here yet"} body={q ? "Try another word, or browse a category." : "We add new supplies often. Check back soon."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p) => {
            const soldOut = p.stock <= 0;
            return (
              <li key={p.slug}>
                <Card className="relative flex items-center gap-3.5 p-3">
                  {p.coverPath && supabaseUrl ? (
                    <img
                      src={publicImageUrl(supabaseUrl, p.coverPath)}
                      alt={p.coverAlt ?? p.name}
                      loading="lazy"
                      className="h-[88px] w-[88px] flex-none rounded-xl bg-chip object-cover"
                    />
                  ) : (
                    <PhotoPlaceholder label="product" tone="grey" caption="none" className="h-[88px] w-[88px] flex-none rounded-xl" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link href={`/shop/${p.slug}`} className="font-semibold after:absolute after:inset-0">{p.name}</Link>
                    <p className="text-small text-ink-muted">{p.category}</p>
                    <p className="font-semibold tabular-nums">{formatNaira(p.fromPriceMinor)}</p>
                  </div>
                  <div className="relative z-10 flex-none">
                    <AddToCart slug={p.slug} back={category ? `/shop?category=${category}` : "/shop"} soldOut={soldOut} label="Add" />
                  </div>
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
