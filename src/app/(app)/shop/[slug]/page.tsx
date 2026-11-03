/* eslint-disable @next/next/no-img-element -- product photos are served from Supabase Storage */
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackEvent } from "@/components/analytics";
import { AddToCart } from "@/components/add-to-cart";
import { ButtonLink, EmptyState, FormNotice, Icon, Page, PhotoPlaceholder, Tag } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { publicImageUrl } from "@/lib/product-admin";
import { getPublishedProduct } from "@/server/catalogue";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ added?: string; error?: string }> }) {
  const { slug } = await params;
  const { added, error } = await searchParams;
  const res = await getPublishedProduct(slug);
  if (res.ok && !res.data) notFound();
  if (!res.ok) return <Page><EmptyState title="We can't load this item right now" body="Check your connection and try again in a moment." /></Page>;
  const p = res.data!;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const soldOut = p.stock <= 0;

  return (
    <Page className="gap-5 pt-0">
      <TrackEvent name="product_viewed" props={{ product_id: p.slug, category: p.category }} />
      <div className="relative -mx-4">
        {p.images[0] && url ? (
          <img src={publicImageUrl(url, p.images[0].path)} alt={p.images[0].alt} className="aspect-square w-full bg-chip object-cover" />
        ) : (
          <PhotoPlaceholder label="product photo" tone="grey" className="aspect-square h-auto" />
        )}
        <Link href="/shop" aria-label="Back to the shop" className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90">
          <Icon name="back" />
        </Link>
      </div>
      {p.images.length > 1 && url ? (
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="More photos">
          {p.images.slice(1).map((im) => (
            <li key={im.path} className="flex-none">
              <img src={publicImageUrl(url, im.path)} alt={im.alt} loading="lazy" className="h-20 w-20 rounded-xl bg-chip object-cover" />
            </li>
          ))}
        </ul>
      ) : null}

      {added ? (
        <FormNotice tone="success">
          Added to your cart. <Link href="/cart" className="font-semibold underline">View cart</Link>
        </FormNotice>
      ) : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <div className="flex flex-col gap-1.5">
        <Tag className="self-start">{p.category}</Tag>
        <h1 className="mt-1 text-title">{p.name}</h1>
        <p className="text-xl font-bold tabular-nums">{formatNaira(p.priceMinor)}</p>
        <p className="text-small text-ink-muted">
          {soldOut ? "Sold out for now." : p.stock <= 5 ? `Only ${p.stock} left.` : "In stock."} Delivery within Lagos is arranged after you order.
        </p>
      </div>
      <p className="whitespace-pre-line leading-relaxed">{p.description}</p>
      <AddToCart slug={p.slug} back={`/shop/${p.slug}`} soldOut={soldOut} full />
      {added ? <ButtonLink href="/cart" variant="secondary" full>Go to cart</ButtonLink> : null}
    </Page>
  );
}
