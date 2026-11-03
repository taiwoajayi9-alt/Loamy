import Link from "next/link";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, FormNotice, Tag } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { listAdminProducts, listProductCategoriesForAdmin, requireShopAdmin } from "@/server/product-admin";
import { createProductAction } from "./actions";

export const metadata: Metadata = { title: "Shop items" };
export const dynamic = "force-dynamic";

export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireShopAdmin("/admin/products");
  const { error } = await searchParams;
  const [rows, categories] = await Promise.all([listAdminProducts(), listProductCategoriesForAdmin()]);
  const live = rows.filter((r) => r.status === "published").length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Shop items</h1>
        <p className="text-ink-muted">
          {live} of {rows.length} live. Customers pay the price you set here.
        </p>
      </div>
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <details className="rounded-card bg-card p-4">
        <summary className="cursor-pointer font-semibold">Add an item</summary>
        <form action={createProductAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <Field label="Name" name="name" required placeholder="e.g. Potting mix, 10 litres" />
          <div className="flex flex-col gap-2">
            <label htmlFor="new-cat" className="text-small font-semibold">Category</label>
            <select id="new-cat" name="categoryId" className="min-h-[50px] rounded-2xl border border-line-strong bg-card px-4 text-[15px]">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <SubmitButton size="md" pendingLabel="Adding…">Add item</SubmitButton>
        </form>
      </details>

      {rows.length === 0 ? (
        <EmptyState title="No items yet" body="Add your first item above." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/products/${p.id}`}>
                <Card className="flex flex-wrap items-center gap-3 p-4 hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-small text-ink-muted">{p.category}</p>
                  </div>
                  <span className="text-small tabular-nums">{p.priceMinor > 0 ? formatNaira(p.priceMinor) : <span className="text-danger-ink">No price</span>}</span>
                  <span className="text-small tabular-nums text-ink-muted">{p.stock} in stock</span>
                  {p.images === 0 ? <Tag tone="peach">No photo</Tag> : null}
                  {p.isSample ? <Tag tone="grey">Sample</Tag> : null}
                  <Tag tone={p.status === "published" ? "leaf" : "grey"}>{p.status === "published" ? "Live" : "Draft"}</Tag>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
