/* eslint-disable @next/next/no-img-element -- product photos are served from Supabase Storage */
import Link from "next/link";
import { AddToCart } from "@/components/add-to-cart";
import { Card, Icon } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { BUCKETS, publicUrl } from "@/lib/photos";
import type { StartItem, StartProduct } from "@/server/start-kit";

/** Short "What you'll need" list with linked shop items. Deliberately brief. */
export function StartKitCard({ items, products, back, title = "What you’ll need" }: { items: StartItem[]; products: StartProduct[]; back: string; title?: string }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.label} className="flex gap-2.5 text-small">
            <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-lemon"><Icon name="check" size={12} /></span>
            <span>
              <span className="font-medium">{i.label}</span>
              {i.detail ? <span className="block text-ink-muted">{i.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {products.length ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-small font-semibold">From the Loamy shop</p>
          <ul className="flex flex-col gap-2">
            {products.map((p) => (
              <li key={p.slug} className="flex items-center gap-3">
                {p.coverPath && url ? <img src={publicUrl(url, BUCKETS.products, p.coverPath)} alt="" className="h-12 w-12 flex-none rounded-xl bg-chip object-cover" /> : <span className="h-12 w-12 flex-none rounded-xl bg-chip" />}
                <Link href={`/shop/${p.slug}`} className="min-w-0 flex-1">
                  <span className="block truncate text-small font-semibold">{p.name}</span>
                  <span className="text-small tabular-nums text-ink-muted">{formatNaira(p.priceMinor)}</span>
                </Link>
                <AddToCart slug={p.slug} back={back} soldOut={!p.inStock} label="Add" />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Link href="/shop" className="self-start text-small font-semibold underline decoration-lemon decoration-2 underline-offset-4">Browse pots and supplies in the shop</Link>
      )}
    </Card>
  );
}
