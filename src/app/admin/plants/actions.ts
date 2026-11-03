"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { canEditPlants } from "@/lib/plant-workflow";
import { runDraftAll, type DraftJob } from "@/server/ai/draft-all";
import { aiDraftConfigured } from "@/server/ai/plant-draft";
import { getDraftAllStatus, logDraftAll, approveAndPublishAll, plantsNeedingCare, plantsNeedingDraft, plantsNeedingSources, requirePlantLibrary, submitAllDrafts } from "@/server/plant-admin";

const back = (key: "notice" | "error", msg: string) => redirect(`/admin/plants?${key}=${encodeURIComponent(msg)}`);

/** Starts drafting every plant that still has empty sections. Runs in the background. */
export async function draftAllAction() {
  const actor = await requirePlantLibrary("/admin/plants");
  if (!canEditPlants(actor.roles)) back("error", "You don't have permission to draft plants.");
  if (!aiDraftConfigured()) back("error", "AI drafting is off. Add a Gemini or DeepSeek key to .env.local to turn it on.");
  const status = await getDraftAllStatus();
  if (status.state === "running") back("error", "A drafting run is already going. Wait for it to finish.");

  const [toDraft, toSource, toCare] = await Promise.all([plantsNeedingDraft(), plantsNeedingSources(), plantsNeedingCare()]);
  const byId = new Map<string, DraftJob>();
  const job = (p: { id: string; commonName: string }) => byId.get(p.id) ?? { id: p.id, name: p.commonName, draft: false };
  for (const p of toDraft) byId.set(p.id, { ...job(p), draft: true });
  for (const p of toSource) byId.set(p.id, { ...job(p), sources: true });
  for (const p of toCare) byId.set(p.id, { ...job(p), care: true });
  const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) back("notice", "Every plant already has its sections, care routine and sources. Nothing to do.");

  await logDraftAll(actor, "plant.ai_draft_all.start", "all", { plants: list });
  after(() => runDraftAll(actor, list));
  revalidatePath("/admin/plants");
  back("notice", `Drafting ${list.length} plant${list.length === 1 ? "" : "s"}. This page updates as each one finishes.`);
}

/** Sends every plant's draft sections to the expert in one go. */
export async function submitAllPlantsAction() {
  const actor = await requirePlantLibrary("/admin/plants");
  if (!canEditPlants(actor.roles)) back("error", "You don't have permission to do that.");
  const n = await submitAllDrafts(actor);
  revalidatePath("/admin/plants");
  back("notice", n ? `Sent ${n} draft section${n === 1 ? "" : "s"} for review.` : "No drafts to send.");
}

/** Owner-only: approve everything waiting and publish every plant that's ready. */
export async function approvePublishAllAction(form: FormData) {
  const actor = await requirePlantLibrary("/admin/plants");
  if (!actor.roles.includes("super_admin")) back("error", "Only the owner can do this.");
  if (form.get("confirm") !== "yes") back("error", "Tick the box to confirm you’ve read the plants.");
  const { published, notReady } = await approveAndPublishAll(actor);
  revalidatePath("/admin/plants");
  revalidatePath("/discover");
  const left = notReady.length ? ` Not live yet: ${notReady.map((n) => `${n.name} (${n.missing.join(", ").toLowerCase()})`).join("; ")}.` : "";
  back(published.length ? "notice" : "error", `${published.length ? `Published ${published.length}: ${published.join(", ")}.` : "Nothing was ready to publish."}${left}`);
}
