import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ButtonLink, Card, HeroCard, Icon, Page, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNaira } from "@/lib/money";
import { FULFILMENT_LABEL, formatPhone } from "@/lib/shop";
import { requireUser } from "@/server/auth";
import { getOrder } from "@/server/checkout";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

const STEPS = ["awaiting_delivery_arrangement", "delivery_arranged", "packing", "out_for_delivery", "delivered"] as const;
const STEP_LABEL: Record<(typeof STEPS)[number], string> = {
  awaiting_delivery_arrangement: "Paid",
  delivery_arranged: "Delivery arranged",
  packing: "Packing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};
const dateFmt = new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { number } = await params;
  const { placed } = await searchParams;
  const user = await requireUser(`/orders/${number}`);
  const data = await getOrder(user.id, number.slice(0, 20));
  if (!data || data.order.paymentStatus === "pending" || data.order.paymentStatus === "failed") notFound();
  const { order, items } = data;
  const contact = order.buyerContactSnapshot as { recipient: string; phone: string; address: string; area: string };
  const current = STEPS.indexOf(order.fulfilmentStatus as (typeof STEPS)[number]);
  const cancelled = order.fulfilmentStatus === "cancelled";

  return (
    <Page className="pb-12">
      <Link href="/orders" className="flex items-center gap-1.5 self-start text-small font-semibold">
        <Icon name="back" size={18} /> Orders
      </Link>
      {placed ? (
        <HeroCard className="gap-3 px-[22px] py-6">
          <Tag tone="lemon" className="self-start">Payment confirmed</Tag>
          <h1 className="text-title">Order placed. Next, we’ll arrange delivery.</h1>
          <p className="text-ink-on-black">We’ll call {formatPhone(contact.phone)} shortly to agree your delivery fee and time.</p>
        </HeroCard>
      ) : (
        <h1 className="text-title">Order {order.orderNumber}</h1>
      )}
      {order.paymentStatus === "refunded" || order.paymentStatus === "partially_refunded" ? (
        <p role="status" className="rounded-2xl bg-leaf-pale px-4 py-3 text-small text-leaf-ink">
          {order.paymentStatus === "refunded" ? "This order has been refunded." : "Part of this order has been refunded."} Refunds go back to the card or account you
          paid with; banks can take up to 10 working days to show them.
        </p>
      ) : null}

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{cancelled ? "Cancelled" : FULFILMENT_LABEL[order.fulfilmentStatus]}</h2>
          <span className="text-small tabular-nums text-ink-muted">{order.orderNumber}</span>
        </div>
        {!cancelled ? (
          <ol className="flex flex-col gap-2.5">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-small">
                <span aria-hidden="true" className={cn("h-3 w-3 flex-none rounded-full", i < current ? "bg-ink" : i === current ? "bg-lemon ring-4 ring-lemon/30" : "bg-line-strong")} />
                <span className={i <= current ? "font-semibold" : "text-ink-muted"}>{STEP_LABEL[s]}</span>
                {i === current ? <span className="sr-only">(current step)</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {order.deliveryScheduledFor ? <p className="text-small">Delivery: {dateFmt.format(order.deliveryScheduledFor)}</p> : null}
        {order.deliveryNotes ? <p className="text-small text-ink-muted">{order.deliveryNotes}</p> : null}
      </Card>

      <Card className="flex flex-col gap-2 p-5">
        <h2 className="font-semibold">Items</h2>
        <ul className="flex flex-col gap-1.5 text-small">
          {items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3">
              <span>{it.quantity} × {it.productNameSnapshot}</span>
              <span className="tabular-nums">{formatNaira(it.lineTotalMinor)}</span>
            </li>
          ))}
        </ul>
        {order.discountMinor > 0 ? (
          <div className="flex justify-between text-small text-leaf-ink"><span>Promo</span><span className="tabular-nums">−{formatNaira(order.discountMinor)}</span></div>
        ) : null}
        <div className="flex justify-between border-t border-line pt-2 font-semibold"><span>Paid</span><span className="tabular-nums">{formatNaira(order.itemsTotalMinor)}</span></div>
        {order.deliveryFeeMinor != null ? (
          <div className="flex justify-between text-small"><span className="text-ink-muted">Delivery fee (agreed)</span><span className="tabular-nums">{formatNaira(order.deliveryFeeMinor)}</span></div>
        ) : (
          <p className="text-small text-ink-muted">Delivery fee: agreed with you by phone.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-1 p-5 text-small">
        <h2 className="mb-1 font-semibold">Delivering to</h2>
        <p>{contact.recipient} · {formatPhone(contact.phone)}</p>
        <p className="text-ink-muted">{contact.address}, {contact.area}, Lagos</p>
      </Card>

      <ButtonLink href="/shop" variant="secondary" full>Keep shopping</ButtonLink>
    </Page>
  );
}
