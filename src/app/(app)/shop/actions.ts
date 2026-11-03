"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/routes";
import { MAX_QTY_PER_ITEM } from "@/lib/shop";
import { getSessionUser } from "@/server/auth";
import { addToCart, CartError, setCartQuantity } from "@/server/cart";

export async function addToCartAction(form: FormData) {
  const slug = z.string().min(1).max(80).parse(form.get("slug"));
  const qty = z.coerce.number().int().min(1).max(MAX_QTY_PER_ITEM).catch(1).parse(form.get("quantity") ?? 1);
  const back = safeNextPath(String(form.get("back") ?? ""), "/shop");
  const user = await getSessionUser();
  let notice: string;
  try {
    await addToCart(user?.id ?? null, slug, qty);
    notice = "added";
  } catch (err) {
    if (!(err instanceof CartError)) console.error("[cart]", err);
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(err instanceof CartError ? err.message : "Couldn't add that. Try again.")}`);
  }
  revalidatePath("/cart");
  redirect(`${back}${back.includes("?") ? "&" : "?"}${notice}=${encodeURIComponent(slug)}`);
}

export async function updateCartAction(form: FormData) {
  const itemId = z.string().uuid().parse(form.get("itemId"));
  const qty = z.coerce.number().int().min(0).max(MAX_QTY_PER_ITEM).parse(form.get("quantity"));
  const user = await getSessionUser();
  await setCartQuantity(user?.id ?? null, itemId, qty);
  revalidatePath("/cart");
  redirect("/cart");
}
