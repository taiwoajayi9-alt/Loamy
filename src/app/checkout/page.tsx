import Link from "next/link";
import type { Metadata } from "next";
import { Card, FormNotice, Icon, Page } from "@/components/ui";
import { db } from "@/db/client";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatNaira } from "@/lib/money";
import { formatPhone, normalisePromoCode, subtotal } from "@/lib/shop";
import { requireUser } from "@/server/auth";
import { getCart } from "@/server/cart";
import { lastAddress, previewPromo } from "@/server/checkout";
import { paystackConfigured, paystackMode } from "@/server/paystack";
import { CheckoutForm } from "./checkout-form";
import { TrackEvent } from "@/components/analytics";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

/** Owner decision: shoppers must be signed in and give a phone number and address before ordering. */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ promo?: string }> }) {
  const user = await requireUser("/checkout");
  const { promo: promoParam } = await searchParams;
  const { lines } = await getCart(user.id);
  if (!lines.length || lines.some((l) => l.problem)) redirect("/cart");

  const sub = subtotal(lines);
  const promoCode = promoParam ? normalisePromoCode(promoParam).slice(0, 40) : null;
  const promo = promoCode ? await previewPromo(user.id, promoCode, sub) : null;
  const discount = promo?.ok ? promo.discountMinor : 0;
  const total = sub - discount;

  const [addr, profile] = await Promise.all([lastAddress(user.id), db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, user.id) })]);
  const defaults = {
    recipient: addr?.recipient ?? [profile?.firstName, profile?.lastName].filter(Boolean).join(" "),
    phone: addr?.phone ? formatPhone(addr.phone) : profile?.phone ? formatPhone(profile.phone) : "",
    address: addr?.address ?? "",
    area: addr?.area ?? "",
  };

  return (
    <Page className="pb-12">
      <TrackEvent name="checkout_started_marketplace" props={{ cart_value: total }} />
      <Link href="/cart" className="flex items-center gap-1.5 self-start text-small font-semibold">
        <Icon name="back" size={18} /> Cart
      </Link>
      <h1 className="text-title">Checkout</h1>

      <Card className="flex flex-col gap-2 p-5">
        <ul className="flex flex-col gap-1.5 text-small">
          {lines.map((l) => (
            <li key={l.itemId} className="flex justify-between gap-3">
              <span>{l.quantity} × {l.name}</span>
              <span className="tabular-nums">{formatNaira(l.unitPriceMinor * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-line pt-2 text-small">
          <span className="text-ink-muted">Items</span>
          <span className="tabular-nums">{formatNaira(sub)}</span>
        </div>
        {promo?.ok ? (
          <div className="flex justify-between text-small text-leaf-ink">
            <span>Promo {promoCode} ({promo.label})</span>
            <span className="tabular-nums">−{formatNaira(discount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-small">
          <span className="text-ink-muted">Delivery within Lagos</span>
          <span>Agreed after you order</span>
        </div>
        <div className="flex justify-between border-t border-line pt-2 font-semibold">
          <span>Pay now</span>
          <span className="tabular-nums">{formatNaira(total)}</span>
        </div>
      </Card>

      <form method="get" className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-2 text-small font-semibold">
          Promo code
          <input name="promo" defaultValue={promoCode ?? ""} autoCapitalize="characters" className="min-h-[50px] rounded-2xl border border-line-strong bg-card px-4 text-[15px] font-normal uppercase" />
        </label>
        <button type="submit" className="min-h-[50px] rounded-full border border-line-strong bg-card px-5 text-small font-semibold">Apply</button>
      </form>
      {promo && !promo.ok ? <FormNotice tone="error">{promo.reason}</FormNotice> : null}

      <h2 className="text-lg font-semibold">Where should we deliver?</h2>
      {paystackConfigured() ? (
        <>
          <CheckoutForm defaults={defaults} promo={promo?.ok ? promoCode : null} payLabel={`Pay ${formatNaira(total)} with Paystack`} />
          <p className="text-center text-small text-ink-muted">
            We’ll call you after you order to agree the delivery fee and time. By paying you agree to our{" "}
            <Link href="/terms#s4" className="underline">shop terms</Link>.
            {paystackMode() === "test" ? " Test mode: use a Paystack test card. No real money moves." : ""}
          </p>
        </>
      ) : (
        <FormNotice tone="error">Payments aren’t set up yet. Please check back soon.</FormNotice>
      )}
    </Page>
  );
}
