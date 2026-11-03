/* eslint-disable @next/next/no-img-element -- admin thumbnails come straight from Supabase Storage */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { PhotoPicker } from "@/components/photo-picker";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormNotice, Tag } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { koboToInput, publicImageUrl } from "@/lib/product-admin";
import { getAdminProduct, getProductPlantIds, requireShopAdmin } from "@/server/product-admin";
import { db } from "@/db/client";
import { plants as plantsTable } from "@/db/schema";
import { asc } from "drizzle-orm";
import { storageConfigured } from "@/server/storage";
import {
  addImageAction,
  coverImageAction,
  productPlantsAction,
  publishProductAction,
  removeImageAction,
  updateProductAction,
} from "../actions";

export const metadata: Metadata = { title: "Edit item" };
export const dynamic = "force-dynamic";

const inputClass = "w-full rounded-2xl border border-line-strong bg-card px-4 text-[15px] text-ink";

export default async function EditProduct({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  await requireShopAdmin(`/admin/products/${id}`);
  const { notice, error } = await searchParams;
  const data = await getAdminProduct(id);
  if (!data) notFound();
  const { product, categories, variant, images, readiness } = data;
  const [linked, allPlants] = await Promise.all([
    getProductPlantIds(product.id),
    db.select({ id: plantsTable.id, name: plantsTable.commonName }).from(plantsTable).orderBy(asc(plantsTable.commonName)),
  ]);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const uploadsOn = storageConfigured();
  const live = product.status === "published";
  const stock = variant?.quantityAvailable ?? 0;
  const reserved = variant?.reservedQuantity ?? 0;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/products" className="text-small font-semibold text-ink-muted hover:underline">
          ← Shop items
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title">{product.name}</h1>
          <Tag tone={live ? "leaf" : "grey"}>{live ? "Live" : "Draft"}</Tag>
        </div>
        {variant ? <p className="text-small text-ink-muted">SKU {variant.sku}</p> : null}
      </div>

      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      {/* ── Details, price and stock ── */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 id="details" className="scroll-mt-20 text-lg font-semibold">Details, price and stock</h2>
        <form action={updateProductAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="productId" value={product.id} />
          <div className="sm:col-span-2">
            <Field label="Name" name="name" defaultValue={product.name} required />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="field-description" className="text-small font-semibold">Description</label>
            <textarea
              id="field-description"
              name="description"
              rows={5}
              defaultValue={product.description}
              placeholder="What it is, what's in the pack, sizes, and what it's good for."
              className={`${inputClass} py-3 leading-relaxed`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="field-categoryId" className="text-small font-semibold">Category</label>
            <select id="field-categoryId" name="categoryId" defaultValue={product.categoryId} className={`${inputClass} min-h-[50px]`}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <Field
            label="Price (₦)"
            name="price"
            inputMode="decimal"
            defaultValue={koboToInput(variant?.priceMinor ?? 0)}
            placeholder="e.g. 12500"
            hint="What the customer pays for one. Delivery is agreed after they order."
          />
          <Field
            label="In stock"
            name="stock"
            type="number"
            min={reserved}
            step={1}
            defaultValue={stock}
            required
            hint={reserved ? `${reserved} held in open orders.` : "How many you have ready to sell."}
          />
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </div>
        </form>
      </Card>

      {/* ── Photos ── */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 id="photos" className="scroll-mt-20 text-lg font-semibold">Photos</h2>
        <p className="text-small text-ink-muted">
          Use your own photos of the real item, in daylight on a plain background, cropped square. Don&rsquo;t use supplier or marketplace photos.
          The first photo is the cover.
        </p>
        {images.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img, i) => (
              <li key={img.id} className="flex flex-col gap-2">
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-chip">
                  <img src={publicImageUrl(supabaseUrl, img.storagePath)} alt={img.altText} className="h-full w-full object-cover" />
                  {i === 0 ? <Tag tone="dark" className="absolute left-2 top-2">Cover</Tag> : null}
                </div>
                <p className="text-xs text-ink-muted">{img.altText}</p>
                <div className="flex gap-3">
                  {i > 0 ? (
                    <form action={coverImageAction}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button type="submit" className="text-xs font-semibold underline">Make cover</button>
                    </form>
                  ) : null}
                  <form action={removeImageAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <button type="submit" className="text-xs font-semibold text-danger-ink underline">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small">No photos yet.</p>
        )}
        {uploadsOn ? (
          <form action={addImageAction} className="grid gap-3 rounded-2xl bg-chip p-4 sm:grid-cols-2 sm:items-end">
            <input type="hidden" name="productId" value={product.id} />
            <PhotoPicker submitId="upload-photo" />
            <Field label="Describe the photo" name="altText" required placeholder="e.g. Seven garden tools laid out on a table" />
            <div className="sm:col-span-2">
              <SubmitButton id="upload-photo" variant="secondary" pendingLabel="Uploading…">Upload photo</SubmitButton>
            </div>
          </form>
        ) : (
          <FormNotice tone="error">Photo uploads are off. Your developer needs to add SUPABASE_SECRET_KEY.</FormNotice>
        )}
      </Card>

      {/* ── Plants ── */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 id="plants" className="scroll-mt-20 text-lg font-semibold">Good for these plants</h2>
        <p className="text-small text-ink-muted">Tick the plants this item helps start. It then appears in their “What you’ll need” list on the plan and in members’ gardens, with an Add button. Seedlings and starter packs belong here.</p>
        <form action={productPlantsAction} className="flex flex-col gap-3">
          <input type="hidden" name="productId" value={product.id} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {allPlants.map((p) => (
              <label key={p.id} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-line px-3 text-small has-[:checked]:border-ink">
                <input type="checkbox" name="plantIds" value={p.id} defaultChecked={linked.includes(p.id)} className="h-4 w-4 accent-[#0A0A0A]" />
                {p.name}
              </label>
            ))}
          </div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">Save plants</SubmitButton>
        </form>
      </Card>

      {/* ── Publish ── */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 id="publish" className="scroll-mt-20 text-lg font-semibold">Publish</h2>
        {live ? (
          <p className="text-small">
            Live in the shop at {formatNaira(variant?.priceMinor ?? 0)}. {stock - reserved <= 0 ? "Shown as sold out." : `${stock - reserved} available.`}
          </p>
        ) : readiness.ready ? (
          <p className="text-small">Ready to go into the shop.</p>
        ) : (
          <>
            <p className="text-small">Before it can go live:</p>
            <ul className="list-disc pl-5 text-small">
              {readiness.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
        <form action={publishProductAction}>
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="publish" value={live ? "0" : "1"} />
          {live ? (
            <SubmitButton variant="secondary" pendingLabel="Unpublishing…">Unpublish</SubmitButton>
          ) : readiness.ready ? (
            <SubmitButton variant="lime" pendingLabel="Publishing…">Publish to the shop</SubmitButton>
          ) : null}
        </form>
      </Card>
    </>
  );
}
