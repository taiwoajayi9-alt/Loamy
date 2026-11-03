"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireHelpDesk } from "@/server/help-admin";
import { setEscalationStatus } from "@/server/ask";

export async function helpStatusAction(form: FormData) {
  const id = z.string().uuid().parse(form.get("id"));
  const actor = await requireHelpDesk(`/admin/help/${id}`);
  await setEscalationStatus(actor.id, id, z.enum(["open", "in_progress", "resolved"]).parse(form.get("status")));
  revalidatePath("/admin/help");
  redirect(`/admin/help/${id}?notice=${encodeURIComponent("Updated.")}`);
}
