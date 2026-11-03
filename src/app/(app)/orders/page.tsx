import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink, Card, EmptyState, Icon, Page, Tag } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { FULFILMENT_LABEL } from "@/lib/shop";
import { requireUser } from "@/server/auth";
import { listOrders } from "@/server/checkout";

export const metadata: Metadata = { title: "Your orders" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const orders = await listOrders(user.id);
  return (
    <Page>
      <h1 className="text-title">Your orders</h1>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" body="When you buy from the Loamy shop, your orders show up here." action={<ButtonLink href="/shop" size="sm">Go to the shop</ButtonLink>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.orderNumber}`}>
                <Card className="flex items-center gap-3 p-4 hover:border-line-strong">
                  <div className="flex-1">
                    <p className="font-semibold tabular-nums">{o.orderNumber}</p>
                    <p className="text-small text-ink-muted">{o.placedAt ? dateFmt.format(o.placedAt) : ""} · {formatNaira(o.itemsTotalMinor)}</p>
                  </div>
                  <Tag tone={o.fulfilmentStatus === "delivered" ? "leaf" : o.fulfilmentStatus === "cancelled" ? "grey" : "lemon"}>
                    {FULFILMENT_LABEL[o.fulfilmentStatus].replace("We'll call you to arrange delivery", "Arranging delivery")}
                  </Tag>
                  <Icon name="chevron" size={18} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
