"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { normaliseNigerianPhone, normalisePromoCode } from "@/lib/shop";
import { requireUser } from "@/server/auth";
import { CheckoutError, placeOrder } from "@/server/checkout";
import { PaystackError } from "@/server/paystack";

export type CheckoutState = { error?: string; fieldErrors?: Partial<Record<"recipient" | "phone" | "address" | "area", string>> };

export async function placeOrderAction(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const user = await requireUser("/checkout");
  const raw = {
    recipient: String(form.get("recipient") ?? "").trim(),
    phone: String(form.get("phone") ?? ""),
    address: String(form.get("address") ?? "").trim(),
    area: String(form.get("area") ?? "").trim(),
  };
  const fieldErrors: CheckoutState["fieldErrors"] = {};
  if (raw.recipient.length < 2) fieldErrors.recipient = "Add the name we should ask for.";
  const phone = normaliseNigerianPhone(raw.phone);
  if (!phone) fieldErrors.phone = "Enter a Nigerian mobile number, like 0803 123 4567.";
  if (raw.address.length < 6) fieldErrors.address = "Add the house number and street.";
  if (raw.area.length < 2) fieldErrors.area = "Add your area, like Yaba or Lekki Phase 1.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const promo = z.string().max(40).optional().parse(form.get("promo") || undefined);
  let url: string;
  try {
    url = await placeOrder(
      user,
      { recipient: raw.recipient.slice(0, 80), phone: phone!, address: raw.address.slice(0, 200), area: raw.area.slice(0, 80) },
      promo ? normalisePromoCode(promo) : null,
      env.public().NEXT_PUBLIC_SITE_URL,
    );
  } catch (err) {
    if (err instanceof CheckoutError) return { error: err.message };
    console.error("[checkout]", err);
    return { error: err instanceof PaystackError ? "Paystack couldn't start the payment. Try again in a minute." : "Something went wrong. Try again." };
  }
  redirect(url);
}
