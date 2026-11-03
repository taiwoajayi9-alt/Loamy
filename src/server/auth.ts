import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import {
  adminRoleAssignments,
  consentRecords,
  subscriptionEntitlements,
  subscriptions,
  userProfiles,
  users,
} from "@/db/schema";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasEntitlement } from "./entitlements";

export const POLICY_VERSION = "2026-11-03";

export type SessionUser = { id: string; email: string; authProviderId: string };

/**
 * Returns the signed-in Loamy user, creating the app-side `users` row on first sign-in.
 * Identity comes from Supabase Auth (verified server-side with getUser), never from the client.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!env.authConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const existing = await db.query.users.findFirst({ where: eq(users.authProviderId, user.id) });
  if (existing) return { id: existing.id, email: existing.email, authProviderId: existing.authProviderId };

  // First sign-in: create the account row, profile and the consents given at registration.
  const meta = (user.user_metadata ?? {}) as { first_name?: string; accepted_terms_at?: string };
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({ email: user.email!, authProviderId: user.id })
      .onConflictDoNothing({ target: users.authProviderId })
      .returning();
    const appUser = row ?? (await tx.query.users.findFirst({ where: eq(users.authProviderId, user.id) }))!;
    if (row) {
      await tx.insert(userProfiles).values({ userId: appUser.id, firstName: meta.first_name ?? null });
      if (meta.accepted_terms_at) {
        await tx.insert(consentRecords).values([
          { userId: appUser.id, consentType: "terms", status: "granted", source: "registration", policyVersion: POLICY_VERSION },
          { userId: appUser.id, consentType: "privacy_notice", status: "granted", source: "registration", policyVersion: POLICY_VERSION },
        ]);
      }
    }
    return appUser;
  });

  return { id: created.id, email: created.email, authProviderId: created.authProviderId };
});

/** Use in server code for signed-in pages. Redirects visitors to login and returns them afterwards. */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** Server-side subscription check. Free accounts never reach subscriber features. */
export async function userHasEntitlement(userId: string, key: string): Promise<boolean> {
  const rows = await db
    .select({
      entitlementKey: subscriptionEntitlements.entitlementKey,
      active: subscriptionEntitlements.active,
      effectiveFrom: subscriptionEntitlements.effectiveFrom,
      effectiveUntil: subscriptionEntitlements.effectiveUntil,
    })
    .from(subscriptionEntitlements)
    .innerJoin(subscriptions, eq(subscriptions.id, subscriptionEntitlements.subscriptionId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
  return hasEntitlement(rows, key);
}

export async function requireEntitlement(nextPath: string, key: string): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (!(await userHasEntitlement(user.id, key))) redirect("/discover?unlock=1");
  return user;
}

export async function requireAdmin(nextPath: string, roles: string[] = []): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  const assigned = await db.select().from(adminRoleAssignments).where(eq(adminRoleAssignments.userId, user.id));
  const ok = assigned.some((a) => a.role === "super_admin" || roles.length === 0 || roles.includes(a.role));
  if (!ok) redirect("/");
  return user;
}
