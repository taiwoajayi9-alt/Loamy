import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormNotice, Tag } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { koboToInput } from "@/lib/product-admin";
import { FULFILMENT_LABEL, formatPhone } from "@/lib/shop";
import { getAdminOrder } from "@/server/order-admin";
import { requireShopAdmin } from "@/server/product-admin";
import { listRefunds } from "@/server/refunds";
import { refundableMinor } from "@/lib/shop";
import { refundOrderAction, updateOrderAction } from "../actions";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
const isoDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
const input = "min-h-[50px] w-full rounded-2xl border border-line-strong bg-card px-4 text-[15px]";

export default async function AdminOrder({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { number } = await params;
  await requireShopAdmin(`/admin/orders/${number}`);
  const { notice, error } = await searchParams;
  const data = await getAdminOrder(number.slice(0, 20));
  if (!data) notFound();
  const { order, items, history } = data;
  const c = order.buyerContactSnapshot as { recipient: string; phone: string; address: string; area: string; email: string; promoCode?: string | null };
  const paid = order.paymentStatus === "paid";
  const refunds = await listRefunds(order.id);
  const refundable = ["paid", "partially_refunded"].includes(order.paymentStatus) ? refundableMinor(order.itemsTotalMinor, refunds) : 0;
  const REFUND_STATUS = { requested: "Requested", processing: "Processing", succeeded: "Refunded", failed: "Failed" } as const;

  return (
    <>
      <Link href="/admin/orders" className="text-small font-semibold text-ink-muted hover:underline">← Orders</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-title tabular-nums">{order.orderNumber}</h1>
        <Tag tone={paid ? "leaf" : "grey"}>{paid ? `Paid ${formatNaira(order.itemsTotalMinor)}` : order.paymentStatus}</Tag>
      </div>
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {order.supportNotes ? <FormNotice tone="error">{order.supportNotes}</FormNotice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-1.5 p-5">
          <h2 className="mb-1 font-semibold">Customer</h2>
          <p>{c.recipient}</p>
          <a href={`tel:${c.phone}`} className="font-semibold underline decoration-lemon decoration-2 underline-offset-4">{formatPhone(c.phone)}</a>
          <p className="text-small text-ink-muted">{c.email}</p>
          <p className="text-small">{c.address}, {c.area}, Lagos</p>
        </Card>
        <Card className="flex flex-col gap-1.5 p-5">
          <h2 className="mb-1 font-semibold">Items</h2>
          <ul className="flex flex-col gap-1 text-small">
            {items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3">
                <span>{it.quantity} × {it.productNameSnapshot}</span>
                <span className="tabular-nums">{formatNaira(it.lineTotalMinor)}</span>
              </li>
            ))}
          </ul>
          {order.discountMinor > 0 ? <p className="text-small text-leaf-ink">Promo {c.promoCode}: −{formatNaira(order.discountMinor)}</p> : null}
          <p className="text-small text-ink-muted">Placed {order.placedAt ? fmt.format(order.placedAt) : "—"}</p>
        </Card>
      </div>

      {paid ? (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Delivery</h2>
          <form action={updateOrderAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="number" value={order.orderNumber} />
            <div className="flex flex-col gap-2">
              <label htmlFor="status" className="text-small font-semibold">Status</label>
              <select id="status" name="status" defaultValue={order.fulfilmentStatus} className={input}>
                {Object.entries(FULFILMENT_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{v === "awaiting_delivery_arrangement" ? "Waiting to arrange delivery" : l}</option>
                ))}
              </select>
            </div>
            <Field label="Delivery fee agreed (₦)" name="fee" inputMode="decimal" defaultValue={order.deliveryFeeMinor ? koboToInput(order.deliveryFeeMinor) : ""} placeholder="e.g. 2500" hint="Collected separately, as agreed on the call." />
            <Field label="Delivery date" name="date" type="date" defaultValue={order.deliveryScheduledFor ? isoDate(order.deliveryScheduledFor) : ""} />
            <Field label="Note for the customer (optional)" name="deliveryNotes" defaultValue={order.deliveryNotes ?? ""} placeholder="e.g. Rider will call when nearby" />
            <div className="sm:col-span-2">
              <Field label="Internal note (optional)" name="note" placeholder="e.g. Called at 2pm, agreed Thursday" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      {refundable > 0 || refunds.length ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Refunds</h2>
          {refunds.length ? (
            <ul className="flex flex-col gap-1.5 text-small">
              {refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Tag tone={r.status === "succeeded" ? "leaf" : r.status === "failed" ? "peach" : "lemon"}>{REFUND_STATUS[r.status]}</Tag>
                  <span className="tabular-nums">{formatNaira(r.amountMinor)}</span>
                  <span className="text-ink-muted">· {r.reason} · {fmt.format(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {refundable > 0 ? (
            <details className="rounded-2xl bg-chip p-4">
              <summary className="cursor-pointer text-small font-semibold">Refund this order</summary>
              <form action={refundOrderAction} className="mt-3 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="number" value={order.orderNumber} />
                <Field label="Amount (₦)" name="amount" inputMode="decimal" required defaultValue={koboToInput(refundable)} hint={`Up to ${formatNaira(refundable)}. The delivery fee was collected separately, so it isn’t refunded here.`} />
                <Field label="Reason" name="reason" required placeholder="e.g. Arrived damaged" maxLength={200} />
                <label className="flex items-start gap-2.5 text-small sm:col-span-2">
                  <input type="checkbox" name="restock" value="yes" defaultChecked={order.fulfilmentStatus !== "delivered"} className="mt-0.5 h-5 w-5 accent-[#0A0A0A]" />
                  Put the items back in stock (full refunds of undelivered orders only)
                </label>
                <label className="flex items-start gap-2.5 text-small sm:col-span-2">
                  <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-5 w-5 accent-[#0A0A0A]" />
                  Send this refund through Paystack now. It can’t be undone.
                </label>
                <div className="sm:col-span-2">
                  <SubmitButton pendingLabel="Refunding…">Refund</SubmitButton>
                </div>
              </form>
            </details>
          ) : null}
        </Card>
      ) : null}

      {history.length ? (
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="font-semibold">History</h2>
          <ul className="flex flex-col gap-1.5 text-small">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-ink-muted">{fmt.format(h.createdAt)}</span> · {FULFILMENT_LABEL[h.status]}
                {h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
