"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseNairaInput } from "@/lib/product-admin";
import { NotAllowed, WorkflowError } from "@/server/plant-admin";
import {
  addProductImage,
  createProduct,
  makeCoverImage,
  removeProductImage,
  requireShopAdmin,
  setProductPublished,
  updateProduct,
} from "@/server/product-admin";

const uuid = z.string().uuid();

function messageFor(err: unknown): string {
  if (err instanceof NotAllowed || err instanceof WorkflowError) return err.message;
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Check the form and try again.";
  if (err instanceof Error && err.message.startsWith("Upload failed")) return "The photo didn't upload. Check your connection and try again.";
  if (err instanceof Error && err.message.startsWith("Photo uploads are off")) return err.message;
  console.error("[admin/products]", err);
  return "Something went wrong. Try again.";
}

async function run(productId: string, anchor: string, fn: () => Promise<string>) {
  const path = `/admin/products/${productId}`;
  let to: string;
  try {
    to = `${path}?notice=${encodeURIComponent(await fn())}#${anchor}`;
  } catch (err) {
    to = `${path}?error=${encodeURIComponent(messageFor(err))}#${anchor}`;
  }
  revalidatePath(path);
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  redirect(to);
}

export async function createProductAction(form: FormData) {
  const actor = await requireShopAdmin("/admin/products");
  let id: string;
  try {
    const input = z
      .object({ name: z.string().trim().min(2, "Add the item's name.").max(100), categoryId: uuid })
      .parse({ name: form.get("name"), categoryId: form.get("categoryId") });
    id = await createProduct(actor, input);
  } catch (err) {
    redirect(`/admin/products?error=${encodeURIComponent(messageFor(err))}`);
  }
  revalidatePath("/admin/products");
  redirect(`/admin/products/${id}?notice=${encodeURIComponent("Item created. Add a price, description and photo, then publish.")}`);
}

export async function updateProductAction(form: FormData) {
  const id = uuid.parse(form.get("productId"));
  const actor = await requireShopAdmin(`/admin/products/${id}`);
  await run(id, "details", async () => {
    const priceRaw = String(form.get("price") ?? "").trim();
    const priceMinor = priceRaw === "" ? null : parseNairaInput(priceRaw);
    if (priceRaw !== "" && priceMinor === null) throw new WorkflowError("Enter the price in naira, like 12500.");
    const input = z
      .object({
        name: z.string().trim().min(2, "Add the item's name.").max(100),
        description: z.string().trim().max(2000),
        categoryId: uuid,
        stock: z.coerce.number({ invalid_type_error: "Enter how many you have." }).int("Stock must be a whole number.").min(0, "Stock can't be below zero.").max(100_000),
      })
      .parse({ name: form.get("name"), description: form.get("description") ?? "", categoryId: form.get("categoryId"), stock: form.get("stock") });
    await updateProduct(actor, id, { ...input, priceMinor });
    return "Saved.";
  });
}

export async function addImageAction(form: FormData) {
  const id = uuid.parse(form.get("productId"));
  const actor = await requireShopAdmin(`/admin/products/${id}`);
  await run(id, "photos", async () => {
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new WorkflowError("Choose a photo first.");
    const alt = z.string().trim().min(3, "Describe the photo in a few words, for people using screen readers.").max(200).parse(form.get("altText"));
    await addProductImage(actor, id, file, alt);
    return "Photo added.";
  });
}

export async function removeImageAction(form: FormData) {
  const id = uuid.parse(form.get("productId"));
  const actor = await requireShopAdmin(`/admin/products/${id}`);
  await run(id, "photos", async () => {
    await removeProductImage(actor, id, uuid.parse(form.get("imageId")));
    return "Photo removed.";
  });
}

export async function coverImageAction(form: FormData) {
  const id = uuid.parse(form.get("productId"));
  const actor = await requireShopAdmin(`/admin/products/${id}`);
  await run(id, "photos", async () => {
    await makeCoverImage(actor, id, uuid.parse(form.get("imageId")));
    return "Cover photo updated.";
  });
}

export async function publishProductAction(form: FormData) {
  const id = uuid.parse(form.get("productId"));
  const actor = await requireShopAdmin(`/admin/products/${id}`);
  const publish = form.get("publish") === "1";
  await run(id, "publish", async () => {
    await setProductPublished(actor, id, publish);
    return publish ? "Published. It's now in the shop." : "Unpublished. It's hidden from the shop.";
  });
}
