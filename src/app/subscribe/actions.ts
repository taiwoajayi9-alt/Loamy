"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { requireUser } from "@/server/auth";
import { BillingError, cancelMembership, startSubscription } from "@/server/billing";
import { PaystackError } from "@/server/paystack";

export async function startSubscriptionAction(form: FormData) {
  const planCode = z.enum(["quarterly", "annual"]).parse(form.get("plan"));
  const user = await requireUser("/subscribe");
  let url: string;
  try {
    url = await startSubscription(user, planCode, env.public().NEXT_PUBLIC_SITE_URL);
  } catch (err) {
    const msg =
      err instanceof BillingError ? err.message : err instanceof PaystackError ? "Paystack couldn't start the payment. Try again in a minute." : "Something went wrong. Try again.";
    if (!(err instanceof BillingError)) console.error("[subscribe]", err);
    redirect(`/subscribe?error=${encodeURIComponent(msg)}`);
  }
  redirect(url);
}

export async function cancelMembershipAction() {
  const user = await requireUser("/profile");
  try {
    await cancelMembership(user);
  } catch (err) {
    const msg = err instanceof BillingError ? err.message : "We couldn't cancel right now. Try again in a minute.";
    if (!(err instanceof BillingError)) console.error("[cancel]", err);
    redirect(`/profile?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/profile?notice=${encodeURIComponent("Your membership won't renew. You keep full access until the end of the period you paid for.")}`);
}
