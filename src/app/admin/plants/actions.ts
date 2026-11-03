"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { canEditPlants } from "@/lib/plant-workflow";
import { runDraftAll } from "@/server/ai/draft-all";
import { aiDraftConfigured } from "@/server/ai/plant-draft";
import { getDraftAllStatus, logDraftAll, plantsNeedingDraft, requirePlantLibrary } from "@/server/plant-admin";

const back = (key: "notice" | "error", msg: string) => redirect(`/admin/plants?${key}=${encodeURIComponent(msg)}`);

/** Starts drafting every plant that still has empty sections. Runs in the background. */
export async function draftAllAction() {
  const actor = await requirePlantLibrary("/admin/plants");
  if (!canEditPlants(actor.roles)) back("error", "You don't have permission to draft plants.");
  if (!aiDraftConfigured()) back("error", "AI drafting is off. Add a Gemini or DeepSeek key to .env.local to turn it on.");
  const status = await getDraftAllStatus();
  if (status.state === "running") back("error", "A drafting run is already going. Wait for it to finish.");

  const list = (await plantsNeedingDraft()).map((p) => ({ id: p.id, name: p.commonName }));
  if (!list.length) back("notice", "Every plant already has all six sections started. Nothing to draft.");

  await logDraftAll(actor, "plant.ai_draft_all.start", "all", { plants: list });
  after(() => runDraftAll(actor, list));
  revalidatePath("/admin/plants");
  back("notice", `Drafting ${list.length} plant${list.length === 1 ? "" : "s"}. This page updates as each one finishes.`);
}
