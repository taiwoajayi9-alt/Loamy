import type { Metadata } from "next";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, FormNotice, Tag } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { listPromos } from "@/server/order-admin";
import { requireShopAdmin } from "@/server/product-admin";
import { createPromoAction, togglePromoAction } from "../orders/actions";

export const metadata: Metadata = { title: "Promo codes" };
export const dynamic = "force-dynamic";

const input = "min-h-[50px] w-full rounded-2xl border border-line-strong bg-card px-4 text-[15px]";
const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
const SCOPE = { all: "Shop and memberships", shop: "Shop only", subscription: "Memberships only" } as const;

export default async function AdminPromos({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireShopAdmin("/admin/promos");
  const { notice, error } = await searchParams;
  const promos = await listPromos();
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Promo codes</h1>
        <p className="text-ink-muted">Shoppers enter these at checkout. Codes work in the shop now; memberships come later.</p>
      </div>
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <details className="rounded-card bg-card p-4">
        <summary className="cursor-pointer font-semibold">Create a code</summary>
        <form action={createPromoAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Code" name="code" required placeholder="e.g. GROW10" hint="Letters and numbers only." />
          <Field label="Description (for you)" name="description" placeholder="e.g. Launch week" />
          <div className="flex flex-col gap-2">
            <label htmlFor="discountType" className="text-small font-semibold">Discount type</label>
            <select id="discountType" name="discountType" className={input} defaultValue="percent">
              <option value="percent">Percentage off</option>
              <option value="fixed_amount">Naira off</option>
            </select>
          </div>
          <Field label="Amount" name="value" required inputMode="decimal" placeholder="10 for 10%, or 2000 for ₦2,000" />
          <div className="flex flex-col gap-2">
            <label htmlFor="scope" className="text-small font-semibold">Works on</label>
            <select id="scope" name="scope" className={input} defaultValue="shop">
              <option value="shop">Shop only</option>
              <option value="all">Shop and memberships</option>
              <option value="subscription">Memberships only</option>
            </select>
          </div>
          <Field label="Minimum spend (₦, optional)" name="minSpend" inputMode="decimal" />
          <Field label="Total uses allowed (optional)" name="maxRedemptions" type="number" min={1} />
          <Field label="Uses per customer" name="perUserLimit" type="number" min={1} defaultValue={1} />
          <Field label="Ends on (optional)" name="endsAt" type="date" />
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Creating…">Create code</SubmitButton>
          </div>
        </form>
      </details>

      {promos.length === 0 ? (
        <EmptyState title="No promo codes yet" body="Create one above." />
      ) : (
        <ul className="flex flex-col gap-2">
          {promos.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold tabular-nums">
                    {p.code} · {p.discountType === "percent" ? `${p.value}% off` : `${formatNaira(p.value)} off`}
                  </p>
                  <p className="text-small text-ink-muted">
                    {SCOPE[p.scope]} · used {p.used}
                    {p.maxRedemptions ? ` of ${p.maxRedemptions}` : ""}
                    {p.minSpendMinor ? ` · min ${formatNaira(p.minSpendMinor)}` : ""}
                    {p.endsAt ? ` · ends ${dateFmt.format(p.endsAt)}` : ""}
                    {p.description ? ` · ${p.description}` : ""}
                  </p>
                </div>
                <Tag tone={p.active ? "leaf" : "grey"}>{p.active ? "On" : "Off"}</Tag>
                <form action={togglePromoAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                  <SubmitButton variant="secondary" pendingLabel="…">{p.active ? "Turn off" : "Turn on"}</SubmitButton>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
