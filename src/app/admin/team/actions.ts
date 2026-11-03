"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ROLES } from "@/lib/team";
import { grantRole, requireTeamAdmin, revokeRole, TeamError } from "@/server/team-admin";

const back = (key: "notice" | "error", msg: string): never => redirect(`/admin/team?${key}=${encodeURIComponent(msg)}`);
const role = z.enum(ROLES);

export async function addTeamMemberAction(form: FormData) {
  const actor = await requireTeamAdmin("/admin/team");
  const email = z.string().trim().email("Enter their email address.").safeParse(form.get("email"));
  const r = role.safeParse(form.get("role"));
  if (!email.success) back("error", email.error.issues[0].message);
  if (!r.success) back("error", "Pick a role.");
  let msg = "";
  try {
    const result = await grantRole(actor, email.data!, r.data!);
    msg = result === "added" ? `Added ${email.data}. They’ll see Admin the next time they open Loamy.` : `${email.data} already has that role.`;
  } catch (err) {
    if (err instanceof TeamError) back("error", err.message);
    throw err;
  }
  revalidatePath("/admin/team");
  back("notice", msg);
}

export async function removeRoleAction(form: FormData) {
  const actor = await requireTeamAdmin("/admin/team");
  const userId = z.string().uuid().parse(form.get("userId"));
  const r = role.parse(form.get("role"));
  try {
    await revokeRole(actor, userId, r);
  } catch (err) {
    if (err instanceof TeamError) back("error", err.message);
    throw err;
  }
  revalidatePath("/admin/team");
  back("notice", userId === actor.id ? "Role removed from your account." : "Role removed.");
}
