import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { getRoles, type Actor } from "./plant-admin";

export function canHelp(roles: string[]) {
  return roles.some((r) => r === "super_admin" || r === "support_admin" || r === "plant_expert");
}

/** Support admins, plant experts and super admins can read and answer help requests. */
export async function requireHelpDesk(nextPath: string): Promise<Actor> {
  const user = await requireUser(nextPath);
  const roles = await getRoles(user.id);
  if (!canHelp(roles)) redirect("/admin");
  return { ...user, roles };
}
