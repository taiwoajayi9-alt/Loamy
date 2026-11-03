"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canHandlePrivacy } from "@/lib/team";
import { requireUser } from "@/server/auth";
import { getRoles } from "@/server/plant-admin";
import { completeDeletion, PrivacyError } from "@/server/privacy";

const back = (key: "notice" | "error", msg: string): never => redirect(`/admin/privacy?${key}=${encodeURIComponent(msg)}`);

export async function completeDeletionAction(form: FormData) {
  const user = await requireUser("/admin/privacy");
  const roles = await getRoles(user.id);
  if (!canHandlePrivacy(roles)) redirect("/admin");
  if (form.get("confirm") !== "yes") back("error", "Tick the box to confirm.");
  const id = z.string().uuid().parse(form.get("id"));
  let msg = "";
  try {
    const r = await completeDeletion({ ...user, roles }, id);
    msg = r.signInRemoved
      ? "Account deleted. Their sign-in is removed too."
      : "Account data deleted. Their sign-in couldn’t be removed automatically; see the note on the request.";
  } catch (err) {
    if (err instanceof PrivacyError) back("error", err.message);
    throw err;
  }
  revalidatePath("/admin/privacy");
  back("notice", msg);
}
