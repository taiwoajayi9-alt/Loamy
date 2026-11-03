"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, FormNotice } from "@/components/ui";
import { placeOrderAction, type CheckoutState } from "./actions";

export function CheckoutForm({
  defaults,
  promo,
  payLabel,
}: {
  defaults: { recipient: string; phone: string; address: string; area: string };
  promo: string | null;
  payLabel: string;
}) {
  const [state, action] = useActionState<CheckoutState, FormData>(placeOrderAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {promo ? <input type="hidden" name="promo" value={promo} /> : null}
      <Field label="Name for delivery" name="recipient" autoComplete="name" defaultValue={defaults.recipient} required error={fe.recipient} />
      <Field
        label="Phone number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0803 123 4567"
        defaultValue={defaults.phone}
        required
        hint="We’ll call this number to agree your delivery fee and time."
        error={fe.phone}
      />
      <Field label="Delivery address" name="address" autoComplete="street-address" placeholder="House number, street and a landmark" defaultValue={defaults.address} required error={fe.address} />
      <Field label="Area" name="area" placeholder="e.g. Yaba, Lekki Phase 1, Ikeja GRA" defaultValue={defaults.area} required error={fe.area} />
      <SubmitButton full size="md" pendingLabel="Opening Paystack…">{payLabel}</SubmitButton>
    </form>
  );
}
