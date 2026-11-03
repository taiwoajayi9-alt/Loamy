import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNaira } from "@/lib/money";
import { FULFILMENT_LABEL, formatPhone } from "@/lib/shop";
import { listAdminOrders } from "@/server/order-admin";
import { requireShopAdmin } from "@/server/product-admin";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireShopAdmin("/admin/orders");
  const show = (await searchParams).show === "all" ? "all" : "open";
  const rows = await listAdminOrders(show);
  const toCall = rows.filter((o) => o.paymentStatus === "paid" && o.fulfilmentStatus === "awaiting_delivery_arrangement").length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Orders</h1>
        <p className="text-ink-muted">{toCall} waiting for a call to arrange delivery.</p>
      </div>
      <nav className="flex gap-2" aria-label="Filter orders">
        {(["open", "all"] as const).map((f) => (
          <Link
            key={f}
            href={f === "open" ? "/admin/orders" : "/admin/orders?show=all"}
            aria-current={show === f ? "page" : undefined}
            className={cn("flex min-h-[38px] items-center rounded-full border px-4 text-small font-semibold", show === f ? "border-ink bg-ink text-white" : "border-line-strong bg-card")}
          >
            {f === "open" ? "To deliver" : "All orders"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title={show === "open" ? "Nothing to deliver" : "No orders yet"} body="Paid orders appear here as soon as Paystack confirms them." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((o) => {
            const c = o.buyerContactSnapshot as { recipient: string; phone: string; area: string };
            return (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.orderNumber}`}>
                  <Card className="flex flex-wrap items-center gap-3 p-4 hover:border-line-strong">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold tabular-nums">{o.orderNumber} · {formatNaira(o.itemsTotalMinor)}</p>
                      <p className="text-small text-ink-muted">
                        {c.recipient} · {formatPhone(c.phone)} · {c.area} · {o.placedAt ? fmt.format(o.placedAt) : fmt.format(o.createdAt)}
                      </p>
                    </div>
                    {o.paymentStatus !== "paid" ? <Tag tone="grey">Not paid</Tag> : null}
                    <Tag tone={o.fulfilmentStatus === "awaiting_delivery_arrangement" ? "peach" : o.fulfilmentStatus === "delivered" ? "leaf" : "lemon"}>
                      {o.fulfilmentStatus === "awaiting_delivery_arrangement" ? "Call to arrange" : FULFILMENT_LABEL[o.fulfilmentStatus]}
                    </Tag>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
