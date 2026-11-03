"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { trackServer } from "@/server/analytics";
import { toggleSaved } from "@/server/saved";

export async function toggleSaveAction(form: FormData) {
  const slug = z.string().regex(/^[a-z0-9-]{1,80}$/).parse(form.get("slug"));
  const user = await requireUser(`/plants/${slug}`);
  const result = await toggleSaved(user.id, slug);
  if (result?.saved) await trackServer("plant_saved", { plant_id: slug }, user.id);
  revalidatePath(`/plants/${slug}`);
  revalidatePath("/discover");
  redirect(`/plants/${slug}${result ? `?saved=${result.saved ? 1 : 0}` : ""}`);
}
