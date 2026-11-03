/** Admin roles, in plain words for the Team page. Pure: no database access. */

export const ROLES = ["super_admin", "plant_expert", "content_admin", "commerce_admin", "support_admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; can: string }> = {
  super_admin: { label: "Owner (super admin)", can: "Everything, including the team, approving plants and privacy requests." },
  plant_expert: { label: "Plant expert", can: "Reviews and approves plant content and care routines. Answers help requests." },
  content_admin: { label: "Content writer", can: "Writes and edits plant content and photos, and sends it for review. Can’t approve." },
  commerce_admin: { label: "Shop manager", can: "Products, prices, stock, orders, delivery and promo codes." },
  support_admin: { label: "Support", can: "Answers help requests and handles account deletion requests." },
};

export const canManageTeam = (roles: readonly string[]) => roles.includes("super_admin");

/** Privacy requests (account deletion) are handled by the owner or support. */
export const canHandlePrivacy = (roles: readonly string[]) => roles.includes("super_admin") || roles.includes("support_admin");

/**
 * Whether removing `role` from a person is allowed. Loamy must always keep at least one super admin,
 * so nobody (including the last owner themself) can remove the final one.
 */
export function removalProblem(role: Role, superAdminCount: number): string | null {
  if (role === "super_admin" && superAdminCount <= 1) return "Loamy needs at least one owner. Make someone else an owner first.";
  return null;
}
