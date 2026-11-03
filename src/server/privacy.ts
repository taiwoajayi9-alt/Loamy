import "server-only";
import { and, asc, eq, getTableColumns, getTableName, inArray, is, ne, sql } from "drizzle-orm";
import { PgTable, type PgColumn } from "drizzle-orm/pg-core";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import {
  accountDeletionRequests,
  adminRoleAssignments,
  aiConversations,
  aiResponseFeedback,
  analyticsEvents,
  auditLogs,
  carts,
  consentRecords,
  deliveryAddresses,
  gardenPlants,
  gardens,
  growingPlans,
  identityLinks,
  notificationPreferences,
  notifications,
  orders,
  paymentTransactions,
  plantPhotos,
  plantSearchEvents,
  savedPlants,
  subscriptions,
  userLocations,
  userPreferences,
  userProfiles,
  users,
  userSpaces,
  whatsappConsents,
} from "@/db/schema";
import { ANALYTICS_POLICY_VERSION, ANON_ID_COOKIE, CONSENT_COOKIE } from "@/lib/analytics/events";
import { BUCKETS } from "@/lib/photos";
import type { SessionUser } from "./auth";
import { cancelMembership, getMembership } from "./billing";
import type { Actor } from "./plant-admin";
import { removeFrom } from "./storage";

export class PrivacyError extends Error {}

// ── Download my data ───────────────────────────────────────────

/**
 * Tables that hang off another table the person owns, by the column that links them.
 * The export follows these links so it includes, say, every care task in their garden.
 */
const CHILD_KEYS: Record<string, string> = {
  gardenId: "gardens",
  gardenPlantId: "garden_plants",
  planId: "growing_plans",
  stageId: "growing_plan_stages",
  scheduleId: "care_schedules",
  careTaskId: "care_tasks",
  conversationId: "ai_conversations",
  orderId: "orders",
  cartId: "carts",
  subscriptionId: "subscriptions",
  paymentTransactionId: "payment_transactions",
};

/** Staff-only tables that never belong in a member's export. */
const SKIP = new Set(["audit_logs", "payment_webhook_events"]);

function userTables() {
  return (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable) && !SKIP.has(getTableName(t)));
}

/**
 * Everything Loamy holds about one person, as plain JSON (their right of access under the NDPA).
 * Starts from every table with a userId column, then follows CHILD_KEYS until nothing new turns up.
 */
export async function exportUserData(userId: string) {
  const tables = userTables();
  const out: Record<string, Record<string, unknown>[]> = {};
  const ids = new Map<string, Set<string>>();
  const add = (name: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return false;
    const seen = ids.get(name) ?? new Set<string>();
    const fresh = rows.filter((r) => !seen.has(String(r.id ?? JSON.stringify(r))));
    if (!fresh.length) return false;
    for (const r of fresh) seen.add(String(r.id ?? JSON.stringify(r)));
    ids.set(name, seen);
    (out[name] ??= []).push(...fresh);
    return true;
  };

  for (const t of tables) {
    const cols = getTableColumns(t) as Record<string, PgColumn>;
    const col = getTableName(t) === "users" ? cols.id : cols.userId;
    if (!col) continue;
    add(getTableName(t), (await db.select().from(t).where(eq(col, userId))) as Record<string, unknown>[]);
  }

  // Follow links a few levels deep (garden → plant → schedule → task → completion is the longest).
  for (let pass = 0; pass < 5; pass++) {
    let grew = false;
    for (const t of tables) {
      const name = getTableName(t);
      const cols = getTableColumns(t) as Record<string, PgColumn>;
      for (const [key, parent] of Object.entries(CHILD_KEYS)) {
        const col = cols[key];
        const parentIds = ids.get(parent);
        if (!col || !parentIds?.size || name === parent) continue;
        const rows = (await db.select().from(t).where(inArray(col, [...parentIds]))) as Record<string, unknown>[];
        if (add(name, rows)) grew = true;
      }
    }
    if (!grew) break;
  }

  // Never hand out internal sign-in ids.
  for (const u of out.users ?? []) delete u.authProviderId;

  return {
    about: "Everything Loamy holds about your account, as of the time below. Card details are held by Paystack, never by Loamy.",
    exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b))),
  };
}

// ── Analytics choice ───────────────────────────────────────────

export async function analyticsChoice(): Promise<"granted" | "denied" | null> {
  const v = (await cookies()).get(CONSENT_COOKIE)?.value;
  return v === "granted" || v === "denied" ? v : null;
}

/** Changes the analytics choice from the profile, and records it against the account. */
export async function setAnalyticsChoice(userId: string, allow: boolean) {
  const jar = await cookies();
  const opts = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 };
  jar.set(CONSENT_COOKIE, allow ? "granted" : "denied", opts);
  if (allow && !jar.get(ANON_ID_COOKIE)) jar.set(ANON_ID_COOKIE, crypto.randomUUID(), opts);
  if (!allow) jar.delete(ANON_ID_COOKIE);
  await db.insert(consentRecords).values({
    userId,
    consentType: "analytics",
    status: allow ? "granted" : "revoked",
    source: "profile",
    policyVersion: ANALYTICS_POLICY_VERSION,
  });
}

// ── Delete my account ──────────────────────────────────────────

export async function openDeletionRequest(userId: string) {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, "requested")))
    .limit(1);
  return row ?? null;
}

/**
 * The member asks for their account to be deleted. Membership renewal stops straight away so they're
 * never charged again; the team completes the deletion (usually within a week, always within 30 days).
 */
export async function requestDeletion(user: SessionUser, reason: string | null) {
  if (await openDeletionRequest(user.id)) return;
  let renewalNote = "";
  if (await getMembership(user.id)) {
    try {
      await cancelMembership(user);
      renewalNote = "Membership renewal stopped.";
    } catch (err) {
      renewalNote = `Couldn't stop renewal automatically (${err instanceof Error ? err.message : "error"}). Cancel it in Paystack.`;
    }
  }
  await db.transaction(async (tx) => {
    await tx.insert(accountDeletionRequests).values({ userId: user.id, notes: [reason ? `Reason: ${reason}` : null, renewalNote || null].filter(Boolean).join("\n") || null });
    await tx.update(users).set({ status: "deletion_requested" }).where(eq(users.id, user.id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "account.deletion_requested", entityType: "user", entityId: user.id });
  });
}

export async function cancelDeletionRequest(userId: string) {
  await db.transaction(async (tx) => {
    const cancelled = await tx
      .update(accountDeletionRequests)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, "requested")))
      .returning({ id: accountDeletionRequests.id });
    if (!cancelled.length) return;
    await tx.update(users).set({ status: "active" }).where(eq(users.id, userId));
    await tx.insert(auditLogs).values({ actorId: userId, action: "account.deletion_cancelled", entityType: "user", entityId: userId });
  });
}

export async function listDeletionRequests() {
  return db
    .select({
      id: accountDeletionRequests.id,
      userId: accountDeletionRequests.userId,
      status: accountDeletionRequests.status,
      requestedAt: accountDeletionRequests.requestedAt,
      completedAt: accountDeletionRequests.completedAt,
      notes: accountDeletionRequests.notes,
      email: users.email,
      orders: sql<number>`(select count(*) from ${orders} where ${orders.userId} = ${accountDeletionRequests.userId})`.mapWith(Number),
    })
    .from(accountDeletionRequests)
    .innerJoin(users, eq(users.id, accountDeletionRequests.userId))
    .orderBy(asc(accountDeletionRequests.requestedAt));
}

/** Deletes the person's sign-in from Supabase Auth so they can't log in to the old account. */
async function deleteAuthUser(authProviderId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return false;
  const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(authProviderId)}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.ok || res.status === 404;
}

/**
 * Completes a deletion request. Personal data is deleted; order and payment records are kept for
 * tax and accounting, but with the name, phone and address removed. The account row stays as an
 * anonymous placeholder so those records still add up.
 */
export async function completeDeletion(actor: Actor, requestId: string, deps = { deleteAuthUser, removePhoto: (p: string) => removeFrom(BUCKETS.garden, p) }) {
  const [req] = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.id, requestId));
  if (!req || req.status !== "requested") throw new PrivacyError("This request is already closed.");
  const user = await db.query.users.findFirst({ where: eq(users.id, req.userId) });
  if (!user) throw new PrivacyError("Account not found.");
  if (await db.query.adminRoleAssignments.findFirst({ where: and(eq(adminRoleAssignments.userId, user.id), eq(adminRoleAssignments.role, "super_admin")) })) {
    const owners = await db.select({ id: adminRoleAssignments.id }).from(adminRoleAssignments).where(and(eq(adminRoleAssignments.role, "super_admin"), ne(adminRoleAssignments.userId, user.id)));
    if (!owners.length) throw new PrivacyError("This is Loamy's only owner account. Make someone else an owner first.");
  }

  // Stop any renewal before the subscription rows go.
  if (await getMembership(user.id)) {
    try {
      await cancelMembership({ id: user.id, email: user.email, authProviderId: user.authProviderId });
    } catch (err) {
      throw new PrivacyError(`Couldn't stop their membership renewal (${err instanceof Error ? err.message : "error"}). Cancel it in Paystack, then try again.`);
    }
  }

  const photos = await db
    .select({ path: plantPhotos.storagePath })
    .from(plantPhotos)
    .innerJoin(gardenPlants, eq(gardenPlants.id, plantPhotos.gardenPlantId))
    .innerJoin(gardens, eq(gardens.id, gardenPlants.gardenId))
    .where(eq(gardens.userId, user.id));

  await db.transaction(async (tx) => {
    const mine = <T extends PgTable & { userId: PgColumn }>(t: T) => tx.delete(t).where(eq(t.userId, user.id));
    // Garden, plans and Ask Loamy (their children go with them).
    await mine(gardens);
    await mine(growingPlans);
    await mine(aiConversations);
    await mine(aiResponseFeedback);
    // Shop basket and saved addresses. Orders keep a snapshot, cleared below.
    await mine(carts);
    await mine(deliveryAddresses);
    // Profile, preferences and everything else personal.
    for (const t of [savedPlants, notifications, whatsappConsents, notificationPreferences, userPreferences, userLocations, userSpaces, identityLinks, adminRoleAssignments]) {
      await mine(t as PgTable & { userId: PgColumn });
    }
    await tx.delete(subscriptions).where(eq(subscriptions.userId, user.id));
    await tx.update(userProfiles).set({ firstName: null, lastName: null, phone: null, avatarUrl: null }).where(eq(userProfiles.userId, user.id));
    // Records kept for tax and accounting, with the personal details removed.
    await tx
      .update(orders)
      .set({ buyerContactSnapshot: { removed: "Customer deleted their account" }, deliveryNotes: null, supportNotes: null })
      .where(eq(orders.userId, user.id));
    await tx.update(paymentTransactions).set({ userId: null }).where(eq(paymentTransactions.userId, user.id));
    await tx.update(analyticsEvents).set({ userId: null }).where(eq(analyticsEvents.userId, user.id));
    await tx.update(plantSearchEvents).set({ userId: null }).where(eq(plantSearchEvents.userId, user.id));
    await tx
      .update(users)
      .set({ email: `deleted-${user.id}@deleted.loamy.invalid`, authProviderId: `deleted:${user.id}`, status: "deleted" })
      .where(eq(users.id, user.id));
    await tx.update(accountDeletionRequests).set({ status: "completed", completedAt: new Date() }).where(eq(accountDeletionRequests.id, req.id));
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "account.deleted", entityType: "user", entityId: user.id, after: { photos: photos.length } });
  });

  // Outside the transaction: these can't be rolled back, and a failure here shouldn't undo the above.
  for (const p of photos) await deps.removePhoto(p.path).catch(() => undefined);
  const signInRemoved = await deps.deleteAuthUser(user.authProviderId).catch(() => false);
  if (!signInRemoved) {
    await db
      .update(accountDeletionRequests)
      .set({
        notes: sql`coalesce(${accountDeletionRequests.notes} || E'\n', '') || ${`Sign-in not removed automatically. In Supabase → Authentication → Users, delete user ${user.authProviderId}.`}`,
      })
      .where(eq(accountDeletionRequests.id, req.id));
  }
  return { signInRemoved, photos: photos.length };
}
