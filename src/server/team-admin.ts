import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { adminRoleAssignments, auditLogs, userProfiles, users } from "@/db/schema";
import { canManageTeam, removalProblem, ROLES, type Role } from "@/lib/team";
import { requireUser } from "./auth";
import { getRoles, type Actor } from "./plant-admin";

export class TeamError extends Error {}

export async function requireTeamAdmin(nextPath: string): Promise<Actor> {
  const user = await requireUser(nextPath);
  const roles = await getRoles(user.id);
  if (!canManageTeam(roles)) redirect("/admin");
  return { ...user, roles };
}

export type TeamMember = { userId: string; email: string; name: string | null; roles: Role[]; since: Date };

export async function listTeam(): Promise<TeamMember[]> {
  const rows = await db
    .select({ userId: users.id, email: users.email, first: userProfiles.firstName, last: userProfiles.lastName, role: adminRoleAssignments.role, at: adminRoleAssignments.createdAt })
    .from(adminRoleAssignments)
    .innerJoin(users, eq(users.id, adminRoleAssignments.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .orderBy(asc(users.email));
  const byUser = new Map<string, TeamMember>();
  for (const r of rows) {
    const m = byUser.get(r.userId) ?? { userId: r.userId, email: r.email, name: [r.first, r.last].filter(Boolean).join(" ") || null, roles: [], since: r.at };
    m.roles.push(r.role as Role);
    if (r.at < m.since) m.since = r.at;
    byUser.set(r.userId, m);
  }
  for (const m of byUser.values()) m.roles.sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));
  return [...byUser.values()];
}

/** Gives a role to someone who already has a Loamy account. */
export async function grantRole(actor: Actor, email: string, role: Role): Promise<"added" | "already"> {
  if (!canManageTeam(actor.roles)) throw new TeamError("Only the owner can change the team.");
  const clean = email.trim().toLowerCase();
  const person = await db.query.users.findFirst({ where: eq(users.email, clean) });
  if (!person || person.status === "deleted") {
    throw new TeamError(`There’s no Loamy account for ${clean} yet. Ask them to sign up at Loamy (it’s free), then add them here.`);
  }
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(adminRoleAssignments).values({ userId: person.id, role, grantedBy: actor.id }).onConflictDoNothing().returning();
    if (!row) return "already";
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "admin_role.grant", entityType: "user", entityId: person.id, after: { role, email: clean } });
    return "added";
  });
}

export async function revokeRole(actor: Actor, userId: string, role: Role): Promise<void> {
  if (!canManageTeam(actor.roles)) throw new TeamError("Only the owner can change the team.");
  await db.transaction(async (tx) => {
    // Lock the owner rows so two people can't remove the last two owners at the same moment.
    const owners = await tx.select({ id: adminRoleAssignments.id }).from(adminRoleAssignments).where(eq(adminRoleAssignments.role, "super_admin")).for("update");
    const problem = removalProblem(role, owners.length);
    if (problem) throw new TeamError(problem);
    const removed = await tx
      .delete(adminRoleAssignments)
      .where(and(eq(adminRoleAssignments.userId, userId), eq(adminRoleAssignments.role, role)))
      .returning({ id: adminRoleAssignments.id });
    if (!removed.length) throw new TeamError("They don’t have that role any more.");
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "admin_role.revoke", entityType: "user", entityId: userId, before: { role } });
  });
}

/** Recent team changes for the page footer. */
export async function recentTeamChanges(limit = 10) {
  const rows = await db
    .select({ action: auditLogs.action, entityId: auditLogs.entityId, before: auditLogs.before, after: auditLogs.after, at: auditLogs.createdAt, actorId: auditLogs.actorId })
    .from(auditLogs)
    .where(inArray(auditLogs.action, ["admin_role.grant", "admin_role.revoke"]))
    .orderBy(sql`${auditLogs.createdAt} desc`)
    .limit(limit);
  const ids = [...new Set(rows.flatMap((r) => [r.entityId, r.actorId].filter((x): x is string => Boolean(x))))];
  const people = ids.length ? await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids)) : [];
  const email = new Map(people.map((p) => [p.id, p.email]));
  return rows.map((r) => ({
    at: r.at,
    granted: r.action === "admin_role.grant",
    role: ((r.after ?? r.before) as { role?: Role } | null)?.role ?? null,
    who: email.get(r.entityId) ?? "a deleted account",
    by: r.actorId ? (email.get(r.actorId) ?? "someone") : "the setup script",
  }));
}
