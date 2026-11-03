/* eslint-disable @next/next/no-img-element -- product photos are served from Supabase Storage */
import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink, Card, EmptyState, FormNotice, Page, PhotoPlaceholder } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { publicImageUrl } from "@/lib/product-admin";
import { MAX_QTY_PER_ITEM, subtotal } from "@/lib/shop";
import { getSessionUser } from "@/server/auth";
import { getCart } from "@/server/cart";
import { updateCartAction } from "../shop/actions";

export const metadata: Metadata = { title: "Your cart" };
export const dynamic = "force-dynamic";

function QtyButton({ itemId, quantity, label, children, disabled }: { itemId: string; quantity: number; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <form action={updateCartAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="quantity" value={quantity} />
      <button type="submit" aria-label={label} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-card text-lg font-semibold disabled:opacity-40">
        {children}
      </button>
    </form>
  );
}

export default async function CartPage() {
  const user = await getSessionUser();
  const { lines } = await getCart(user?.id ?? null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const buyable = lines.filter((l) => !l.problem);
  const hasProblems = lines.some((l) => l.problem);
  const total = subtotal(lines);

  return (
    <Page>
      <h1 className="text-title">Your cart</h1>
      {lines.length === 0 ? (
        <EmptyState title="Your cart is empty" body="Pick up everything you need to start growing." action={<ButtonLink href="/shop" size="sm">Go to the shop</ButtonLink>} />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {lines.map((l) => (
              <li key={l.itemId}>
                <Card className="flex gap-3.5 p-3">
                  {l.coverPath && url ? (
                    <img src={publicImageUrl(url, l.coverPath)} alt="" className="h-[76px] w-[76px] flex-none rounded-xl bg-chip object-cover" />
                  ) : (
                    <PhotoPlaceholder label="product" tone="grey" caption="none" className="h-[76px] w-[76px] flex-none rounded-xl" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/shop/${l.productSlug}`} className="font-semibold">{l.name}</Link>
                    <p className="text-small tabular-nums text-ink-muted">{formatNaira(l.unitPriceMinor)} each</p>
                    {l.problem ? <p className="text-small font-medium text-danger-ink">{l.problem}</p> : null}
                    <div className="mt-1 flex items-center gap-2">
                      <QtyButton itemId={l.itemId} quantity={l.quantity - 1} label={l.quantity === 1 ? `Remove ${l.name}` : `One fewer ${l.name}`}>−</QtyButton>
                      <span className="w-8 text-center font-semibold tabular-nums" aria-label={`Quantity ${l.quantity}`}>{l.quantity}</span>
                      <QtyButton itemId={l.itemId} quantity={l.quantity + 1} label={`One more ${l.name}`} disabled={l.quantity >= Math.min(MAX_QTY_PER_ITEM, l.available)}>+</QtyButton>
                      <span className="ml-auto font-semibold tabular-nums">{formatNaira(l.unitPriceMinor * l.quantity)}</span>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {hasProblems ? <FormNotice tone="error">Some items need a change before you can check out.</FormNotice> : null}

          <Card className="flex flex-col gap-2 p-5">
            <div className="flex justify-between">
              <span className="text-ink-muted">Items</span>
              <span className="font-semibold tabular-nums">{formatNaira(total)}</span>
            </div>
            <div className="flex justify-between text-small">
              <span className="text-ink-muted">Delivery within Lagos</span>
              <span>Agreed after you order</span>
            </div>
            <p className="pt-1 text-small text-ink-muted">Have a promo code? Add it at checkout.</p>
          </Card>

          {hasProblems || buyable.length === 0 ? null : (
            <ButtonLink href="/checkout" full>
              {user ? `Check out · ${formatNaira(total)}` : `Sign in to check out · ${formatNaira(total)}`}
            </ButtonLink>
          )}
          {!user ? <p className="text-center text-small text-ink-muted">You’ll need a free account with your phone number and address to order.</p> : null}
        </>
      )}
    </Page>
  );
}
