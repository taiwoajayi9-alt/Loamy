"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addPlantImage, getPlantImages, makePlantCover, NotAllowed, requirePlantLibrary, WorkflowError } from "@/server/plant-admin";

export type BulkResult = { ok: boolean; message: string };

/** Uploads one photo for one plant. Called once per file by the bulk uploader. */
export async function bulkPlantPhotoAction(form: FormData): Promise<BulkResult> {
  const actor = await requirePlantLibrary("/admin/plants/photos");
  try {
    const plantId = z.string().uuid().parse(form.get("plantId"));
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Empty file." };
    const alt = z.string().trim().min(3).max(200).parse(form.get("altText"));
    await addPlantImage(actor, plantId, file, alt, null);
    if (form.get("cover") === "1") {
      const imgs = await getPlantImages(plantId);
      const newest = [...imgs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (newest) await makePlantCover(actor, plantId, newest.id);
    }
    revalidatePath("/admin/plants");
    revalidatePath("/discover");
    return { ok: true, message: "Uploaded" };
  } catch (err) {
    if (err instanceof NotAllowed || err instanceof WorkflowError) return { ok: false, message: err.message };
    if (err instanceof Error && /Upload failed|uploads are off/.test(err.message)) return { ok: false, message: err.message };
    console.error("[bulk photos]", err);
    return { ok: false, message: "Something went wrong. Try this one again." };
  }
}
