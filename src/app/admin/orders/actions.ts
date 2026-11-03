"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseNairaInput } from "@/lib/product-admin";
import { NotAllowed, WorkflowError } from "@/server/plant-admin";
import { createPromo, setPromoActive, updateFulfilment } from "@/server/order-admin";
import { requireShopAdmin } from "@/server/product-admin";
import { refundOrder } from "@/server/refunds";

const msg = (err: unknown) => {
  if (err instanceof NotAllowed || err instanceof WorkflowError) return err.message;
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Check the form.";
  console.error("[admin/orders]", err);
  return "Something went wrong. Try again.";
};

export async function updateOrderAction(form: FormData) {
  const number = z.string().regex(/^LMY-[A-Z0-9]{4}-[A-Z0-9]{4}$/).parse(form.get("number"));
  const actor = await requireShopAdmin(`/admin/orders/${number}`);
  let to = `/admin/orders/${number}?notice=${encodeURIComponent("Saved. The customer sees the update on their order page.")}`;
  try {
    const feeRaw = String(form.get("fee") ?? "").trim();
    const fee = feeRaw === "" ? null : parseNairaInput(feeRaw);
    if (feeRaw !== "" && fee === null) throw new WorkflowError("Enter the delivery fee in naira, like 2500.");
    const dateRaw = String(form.get("date") ?? "");
    const date = dateRaw ? new Date(`${dateRaw}T12:00:00+01:00`) : null;
    if (date && Number.isNaN(date.getTime())) throw new WorkflowError("Pick a valid delivery date.");
    await updateFulfilment(actor, number, {
      status: z.enum(["awaiting_delivery_arrangement", "delivery_arranged", "packing", "out_for_delivery", "delivered", "cancelled"]).parse(form.get("status")),
      deliveryFeeMinor: fee,
      deliveryScheduledFor: date,
      deliveryNotes: String(form.get("deliveryNotes") ?? "").trim().slice(0, 500) || null,
      note: String(form.get("note") ?? "").trim().slice(0, 500) || null,
    });
  } catch (err) {
    to = `/admin/orders/${number}?error=${encodeURIComponent(msg(err))}`;
  }
  revalidatePath(`/admin/orders/${number}`);
  revalidatePath("/admin/orders");
  redirect(to);
}

export async function createPromoAction(form: FormData) {
  const actor = await requireShopAdmin("/admin/promos");
  let to = `/admin/promos?notice=${encodeURIComponent("Promo code created.")}`;
  try {
    const type = z.enum(["percent", "fixed_amount"]).parse(form.get("discountType"));
    const valueRaw = String(form.get("value") ?? "").trim();
    const value = type === "percent" ? z.coerce.number().int().parse(valueRaw) : parseNairaInput(valueRaw);
    if (value === null) throw new WorkflowError("Enter the discount amount in naira, like 2000.");
    const minRaw = String(form.get("minSpend") ?? "").trim();
    const minSpend = minRaw ? parseNairaInput(minRaw) : null;
    if (minRaw && minSpend === null) throw new WorkflowError("Enter the minimum spend in naira.");
    const intOrNull = (k: string) => {
      const v = String(form.get(k) ?? "").trim();
      return v ? z.coerce.number().int().min(1).max(100000).parse(v) : null;
    };
    const ends = String(form.get("endsAt") ?? "");
    await createPromo(actor, {
      code: z.string().min(1, "Add a code.").parse(form.get("code")),
      description: String(form.get("description") ?? "").trim().slice(0, 140) || null,
      discountType: type,
      value,
      scope: z.enum(["all", "shop", "subscription"]).parse(form.get("scope")),
      minSpendMinor: minSpend,
      maxRedemptions: intOrNull("maxRedemptions"),
      perUserLimit: intOrNull("perUserLimit"),
      endsAt: ends ? new Date(`${ends}T23:59:59+01:00`) : null,
    });
  } catch (err) {
    to = `/admin/promos?error=${encodeURIComponent(msg(err))}`;
  }
  revalidatePath("/admin/promos");
  redirect(to);
}

export async function togglePromoAction(form: FormData) {
  const actor = await requireShopAdmin("/admin/promos");
  await setPromoActive(actor, z.string().uuid().parse(form.get("id")), form.get("active") === "1");
  revalidatePath("/admin/promos");
  redirect("/admin/promos");
}

export async function refundOrderAction(form: FormData) {
  const number = z.string().regex(/^LMY-[A-Z0-9]{4}-[A-Z0-9]{4}$/).parse(form.get("number"));
  const actor = await requireShopAdmin(`/admin/orders/${number}`);
  let to: string;
  try {
    if (form.get("confirm") !== "yes") throw new WorkflowError("Tick the box to confirm the refund.");
    const amount = parseNairaInput(String(form.get("amount") ?? "").trim());
    if (amount === null || amount <= 0) throw new WorkflowError("Enter the refund amount in naira, like 6500.");
    const reason = z.string().trim().min(3, "Add a short reason, like “arrived damaged”.").max(200).parse(form.get("reason"));
    const r = await refundOrder(actor, number, { amountMinor: amount, reason, restock: form.get("restock") === "yes" });
    const done = r.status === "succeeded" ? "Refund done." : "Refund sent to Paystack. It usually completes within a day; the customer’s bank may take up to 10 working days.";
    to = `/admin/orders/${number}?notice=${encodeURIComponent(`${done} The customer has been emailed.`)}`;
  } catch (err) {
    to = `/admin/orders/${number}?error=${encodeURIComponent(msg(err))}`;
  }
  revalidatePath(`/admin/orders/${number}`);
  revalidatePath("/admin/orders");
  redirect(to);
}
