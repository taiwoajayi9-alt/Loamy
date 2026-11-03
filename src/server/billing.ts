import "server-only";
import { membershipRenewedEmail, membershipStartedEmail, type Email } from "@/lib/email/messages";
import { sendEmail, siteUrl } from "./email";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  paymentTransactions,
  paymentWebhookEvents,
  subscriptionEntitlements,
  subscriptionPlans,
  subscriptions,
  userProfiles,
  users,
} from "@/db/schema";
import { accessUntil, addPeriod, chargeMatches, paymentReference, paystackInterval } from "@/lib/billing";
import { entitlementsForSet } from "./entitlements";
import { trackServer } from "./analytics";
import { confirmOrderPayment } from "./checkout";
import { applyRefundEvent } from "./refunds";
import { paystack, PaystackError } from "./paystack";
import type { SessionUser } from "./auth";

export class BillingError extends Error {}

type Plan = typeof subscriptionPlans.$inferSelect;

/** Makes sure Paystack has a plan matching our price and period; recreates it if the price or mode changed. */
async function ensurePaystackPlan(plan: Plan): Promise<string> {
  const interval = paystackInterval(plan.billingInterval, plan.intervalCount);
  if (plan.providerPlanCode) {
    try {
      const existing = await paystack.fetchPlan(plan.providerPlanCode);
      if (existing.amount === plan.priceMinor && existing.interval === interval) return existing.plan_code;
    } catch (err) {
      if (!(err instanceof PaystackError) || (err.status !== 404 && err.status !== 400)) throw err;
    }
  }
  const created = await paystack.createPlan({ name: `Loamy ${plan.name}`, amount: plan.priceMinor, interval, description: plan.description ?? undefined });
  await db.update(subscriptionPlans).set({ providerPlanCode: created.plan_code }).where(eq(subscriptionPlans.id, plan.id));
  return created.plan_code;
}

/** Starts a Paystack checkout for a membership plan. Returns the Paystack page to send the member to. */
export async function startSubscription(user: SessionUser, planCode: string, siteUrl: string): Promise<string> {
  const plan = await db.query.subscriptionPlans.findFirst({ where: and(eq(subscriptionPlans.code, planCode), eq(subscriptionPlans.active, true)) });
  if (!plan) throw new BillingError("That plan isn't available.");
  const active = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "active")) });
  if (active && !active.cancelAtPeriodEnd) throw new BillingError("You already have an active membership.");

  const providerPlan = await ensurePaystackPlan(plan);
  const reference = paymentReference("sub", randomUUID());
  // Persist our reference BEFORE redirecting, so the payment can always be matched back.
  await db.insert(paymentTransactions).values({ userId: user.id, purpose: "subscription", reference, amountMinor: plan.priceMinor, status: "pending" });
  const init = await paystack.initialize({
    email: user.email,
    amount: plan.priceMinor,
    reference,
    plan: providerPlan,
    callback_url: `${siteUrl.replace(/\/$/, "")}/subscribe/callback`,
    metadata: { kind: "subscription", user_id: user.id, plan_code: plan.code },
  });
  return init.authorization_url;
}

/**
 * Confirms a payment with Paystack and switches membership on. Safe to call more than once
 * (callback page and webhook both call it): the payment row is locked and only processed once.
 */
export async function confirmSubscriptionPayment(reference: string): Promise<{ ok: true; planName: string } | { ok: false; reason: string }> {
  const charge = await paystack.verify(reference);
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.reference, reference)).for("update");
    if (!payment || payment.purpose !== "subscription" || !payment.userId) return { ok: false as const, reason: "We couldn't find that payment." };
    const meta = (charge.metadata ?? {}) as { plan_code?: string };
    const plan = await tx.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.code, meta.plan_code ?? "") });
    if (!plan) return { ok: false as const, reason: "We couldn't match that payment to a plan." };
    if (payment.status === "succeeded") return { ok: true as const, planName: plan.name };

    const problem = chargeMatches(charge, { reference, amountMinor: payment.amountMinor });
    if (problem) {
      await tx
        .update(paymentTransactions)
        .set({ status: charge.status === "abandoned" || charge.status === "failed" ? "failed" : payment.status, rawVerification: slim(charge) })
        .where(eq(paymentTransactions.id, payment.id));
      return { ok: false as const, reason: charge.status === "success" ? "The payment didn't match. Contact us and we'll sort it out." : "The payment didn't go through." };
    }

    const now = new Date();
    const periodEnd = addPeriod(now, plan.billingInterval, plan.intervalCount);
    const [sub] = await tx
      .insert(subscriptions)
      .values({ userId: payment.userId, planId: plan.id, status: "active", startedAt: now, currentPeriodEnd: periodEnd })
      .returning();
    await tx.insert(subscriptionEntitlements).values(
      entitlementsForSet(plan.entitlementSetKey).map((k) => ({ subscriptionId: sub.id, entitlementKey: k, active: true, effectiveFrom: now, effectiveUntil: accessUntil(periodEnd) })),
    );
    await tx
      .update(paymentTransactions)
      .set({ status: "succeeded", subscriptionId: sub.id, providerReference: String(charge.id), verifiedAt: now, rawVerification: slim(charge) })
      .where(eq(paymentTransactions.id, payment.id));
    // A cancelled membership that is still running ends now that a new one has started.
    await tx
      .update(subscriptions)
      .set({ status: "cancelled" })
      .where(and(eq(subscriptions.userId, payment.userId), eq(subscriptions.status, "active"), eq(subscriptions.cancelAtPeriodEnd, true)));
    await trackServer("subscription_activated", { plan_type: plan.code, transaction_id: payment.id }, payment.userId);
    return { ok: true as const, planName: plan.name, firstTime: { userId: payment.userId, amountMinor: payment.amountMinor, periodEnd, subId: sub.id } };
  });
  if (result.ok && "firstTime" in result && result.firstTime) {
    const f = result.firstTime;
    await membershipEmail(f.userId, `membership-start-${f.subId}`, (firstName) =>
      membershipStartedEmail({ site: siteUrl(), firstName, planName: result.planName, amountMinor: f.amountMinor, renewsOn: f.periodEnd }),
    );
  }
  return result.ok ? { ok: true, planName: result.planName } : result;
}

async function membershipEmail(userId: string, key: string, build: (firstName: string | null) => Email) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.status === "deleted") return;
  const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId) });
  await sendEmail(user.email, build(profile?.firstName ?? null), key);
}

/** Renewal charges arrive by webhook with Paystack's own reference. Extend the member's access. */
async function applyRenewal(data: { reference: string; customer?: { email?: string }; plan?: { plan_code?: string } }) {
  const charge = await paystack.verify(data.reference);
  let renewed: { userId: string; planName: string; amountMinor: number; periodEnd: Date } | null = null;
  const outcome = await applyRenewalTx(charge, (r) => (renewed = r));
  if (renewed) {
    const r: { userId: string; planName: string; amountMinor: number; periodEnd: Date } = renewed;
    await membershipEmail(r.userId, `membership-renew-${charge.reference}`, (firstName) =>
      membershipRenewedEmail({ site: siteUrl(), firstName, planName: r.planName, amountMinor: r.amountMinor, renewsOn: r.periodEnd }),
    );
  }
  return outcome;
}

async function applyRenewalTx(charge: Awaited<ReturnType<typeof paystack.verify>>, onRenewed: (r: { userId: string; planName: string; amountMinor: number; periodEnd: Date }) => void) {
  const email = charge.customer?.email?.toLowerCase();
  const planCode = typeof charge.plan === "object" ? charge.plan?.plan_code : charge.plan;
  if (!email || !planCode || charge.status !== "success") return "ignored";
  return db.transaction(async (tx) => {
    const dup = await tx.query.paymentTransactions.findFirst({ where: eq(paymentTransactions.reference, charge.reference) });
    if (dup) return "ignored";
    const user = await tx.query.users.findFirst({ where: eq(users.email, email) });
    const plan = await tx.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.providerPlanCode, planCode) });
    if (!user || !plan || charge.amount !== plan.priceMinor) return "ignored";
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.planId, plan.id), inArray(subscriptions.status, ["active", "past_due"])))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!sub) return "ignored";
    const from = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
    const periodEnd = addPeriod(from, plan.billingInterval, plan.intervalCount);
    await tx.update(subscriptions).set({ status: "active", currentPeriodEnd: periodEnd }).where(eq(subscriptions.id, sub.id));
    await tx.update(subscriptionEntitlements).set({ active: true, effectiveUntil: accessUntil(periodEnd) }).where(eq(subscriptionEntitlements.subscriptionId, sub.id));
    await tx.insert(paymentTransactions).values({
      userId: user.id,
      purpose: "subscription",
      subscriptionId: sub.id,
      reference: charge.reference,
      providerReference: String(charge.id),
      amountMinor: charge.amount,
      status: "succeeded",
      verifiedAt: new Date(),
      rawVerification: slim(charge),
    });
    onRenewed({ userId: user.id, planName: plan.name, amountMinor: charge.amount, periodEnd });
    return "processed" as const;
  });
}

type WebhookEvent = { event: string; data: Record<string, unknown> & { id?: number | string; reference?: string; subscription_code?: string } };

/** Handles a verified Paystack webhook once. Duplicate deliveries are ignored. */
export async function handlePaystackEvent(evt: WebhookEvent, payloadHash: string) {
  const eventId = `${evt.event}:${evt.data.id ?? evt.data.subscription_code ?? evt.data.reference ?? payloadHash}`;
  const [row] = await db
    .insert(paymentWebhookEvents)
    .values({ provider: "paystack", eventId, eventType: evt.event, payloadHash, payload: evt })
    .onConflictDoNothing()
    .returning({ id: paymentWebhookEvents.id });
  if (!row) return; // already handled

  let status: "processed" | "ignored" | "failed" = "ignored";
  let error: string | null = null;
  try {
    if (evt.event === "charge.success" && evt.data.reference) {
      const ours = await db.query.paymentTransactions.findFirst({ where: eq(paymentTransactions.reference, String(evt.data.reference)) });
      if (ours?.purpose === "subscription") status = (await confirmSubscriptionPayment(ours.reference)).ok ? "processed" : "failed";
      else if (ours?.purpose === "order") status = (await confirmOrderPayment(ours.reference)).ok ? "processed" : "failed";
      else if (!ours) status = await applyRenewal(evt.data as Parameters<typeof applyRenewal>[0]);
    } else if (evt.event === "subscription.create" || evt.event === "subscription.not_renew" || evt.event === "subscription.disable") {
      status = await syncSubscriptionEvent(evt);
    } else if (evt.event === "invoice.payment_failed") {
      status = await markPastDue(evt);
    } else if (evt.event.startsWith("refund.")) {
      status = await applyRefundEvent(evt);
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message.slice(0, 500) : "Unknown error";
  }
  await db.update(paymentWebhookEvents).set({ status, error, processedAt: new Date() }).where(eq(paymentWebhookEvents.id, row.id));
}

async function memberSubscription(email: string | undefined, planCode: string | undefined) {
  if (!email || !planCode) return null;
  const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.providerPlanCode, planCode) });
  if (!user || !plan) return null;
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.planId, plan.id)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return sub ?? null;
}

async function syncSubscriptionEvent(evt: WebhookEvent) {
  const d = evt.data as { subscription_code?: string; customer?: { email?: string }; plan?: { plan_code?: string } };
  const sub = await memberSubscription(d.customer?.email, d.plan?.plan_code);
  if (!sub) return "ignored";
  if (evt.event === "subscription.create") {
    await db.update(subscriptions).set({ providerSubscriptionCode: d.subscription_code ?? null }).where(eq(subscriptions.id, sub.id));
  } else {
    // Stops renewing; access continues until the paid period ends.
    await db.update(subscriptions).set({ cancelAtPeriodEnd: true, cancelledAt: sub.cancelledAt ?? new Date() }).where(eq(subscriptions.id, sub.id));
  }
  return "processed";
}

async function markPastDue(evt: WebhookEvent) {
  const d = evt.data as { customer?: { email?: string }; subscription?: { plan?: { plan_code?: string } } };
  const sub = await memberSubscription(d.customer?.email, d.subscription?.plan?.plan_code);
  if (!sub || sub.status !== "active") return "ignored";
  await db.update(subscriptions).set({ status: "past_due" }).where(eq(subscriptions.id, sub.id));
  return "processed";
}

/** The member's current membership, for the profile page. */
export async function getMembership(userId: string) {
  const [row] = await db
    .select({ sub: subscriptions, plan: subscriptionPlans })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ["active", "past_due"])))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/** Stops renewal at Paystack. The member keeps access until the end of the period they paid for. */
export async function cancelMembership(user: SessionUser) {
  const m = await getMembership(user.id);
  if (!m) throw new BillingError("You don't have an active membership.");
  if (m.sub.cancelAtPeriodEnd) return m;
  const customer = await paystack.fetchCustomer(user.email);
  const live = (customer.subscriptions ?? []).filter((s) => s.status === "active" || s.status === "non-renewing" || s.status === "attention");
  const match = live.find((s) => s.subscription_code === m.sub.providerSubscriptionCode) ?? live.find((s) => s.plan?.plan_code === m.plan.providerPlanCode);
  if (match) await paystack.disableSubscription(match.subscription_code, match.email_token);
  await db.transaction(async (tx) => {
    await tx.update(subscriptions).set({ cancelAtPeriodEnd: true, cancelledAt: new Date() }).where(eq(subscriptions.id, m.sub.id));
  });
  await trackServer("subscription_cancelled", { plan_type: m.plan.code }, user.id);
  return m;
}

/** Keep only what we need from Paystack's verification response (no card details). */
function slim(c: { id?: number; status?: string; amount?: number; currency?: string; reference?: string; paid_at?: string | null }) {
  return { id: c.id, status: c.status, amount: c.amount, currency: c.currency, reference: c.reference, paid_at: c.paid_at };
}
