"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PILLAR_TYPES, type PillarType } from "@/lib/plant-workflow";
import { LAUNCH_PLANTS } from "@/db/launch-catalogue";
import { aiDraftConfigured, draftCareRoutine, draftPlantSections } from "@/server/ai/plant-draft";
import {
  addCareTemplate,
  addSource,
  applyAiCareDraft,
  retireCareTemplate,
  reviewCareTemplate,
  updateCareTemplate,
  applyAiDraft,
  getAdminPlant,
  NotAllowed,
  removeReference,
  requirePlantLibrary,
  reviewSection,
  saveSection,
  setPlantPublished,
  submitSection,
  updatePlantBasics,
  WorkflowError,
} from "@/server/plant-admin";

const uuid = z.string().uuid();
const pillar = z.enum(PILLAR_TYPES as [PillarType, ...PillarType[]]);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

/** Runs an admin action and comes back to the plant page with a notice or an error. */
async function run(plantId: string, anchor: string, fn: () => Promise<string>) {
  const path = `/admin/plants/${plantId}`;
  let to: string;
  try {
    const notice = await fn();
    to = `${path}?notice=${encodeURIComponent(notice)}#${anchor}`;
  } catch (err) {
    const msg =
      err instanceof NotAllowed || err instanceof WorkflowError || err instanceof z.ZodError
        ? err instanceof z.ZodError
          ? err.issues[0]?.message ?? "Check the form and try again."
          : err.message
        : err instanceof Error && err.message.startsWith("AI ")
          ? err.message
          : "Something went wrong. Try again.";
    if (!(err instanceof NotAllowed || err instanceof WorkflowError || err instanceof z.ZodError)) console.error("[admin/plants]", err);
    to = `${path}?error=${encodeURIComponent(msg)}#${anchor}`;
  }
  revalidatePath(path);
  revalidatePath("/admin/plants");
  redirect(to);
}

function ids(form: FormData) {
  return { plantId: uuid.parse(form.get("plantId")), type: pillar.parse(form.get("type")) };
}

export async function saveBasicsAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "basics", async () => {
    const data = z
      .object({
        commonName: z.string().trim().min(1, "Add the plant's name.").max(80),
        botanicalName: optText(120),
        localNames: z
          .string()
          .max(300)
          .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10)),
        categoryId: uuid,
        tagline: optText(140),
        summaryLine: optText(80),
      })
      .parse(Object.fromEntries(form));
    await updatePlantBasics(actor, plantId, data);
    return "Saved.";
  });
}

export async function saveSectionAction(form: FormData) {
  const { plantId, type } = ids(form);
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, type, async () => {
    const title = z.string().trim().min(1, "Add a heading.").max(80).parse(form.get("title"));
    const body = z.string().trim().min(20, "Write a little more before saving.").max(6000).parse(form.get("body"));
    await saveSection(actor, plantId, type, title, body);
    if (form.get("intent") === "submit") {
      await submitSection(actor, plantId, type);
      return "Saved and sent for review.";
    }
    return "Draft saved.";
  });
}

export async function reviewSectionAction(form: FormData) {
  const { plantId, type } = ids(form);
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, type, async () => {
    const decision = z.enum(["approve", "request_changes"]).parse(form.get("decision"));
    const note = optText(1000).parse(form.get("note") ?? "");
    if (decision === "request_changes" && !note) throw new WorkflowError("Say what needs changing, so the writer knows what to fix.");
    await reviewSection(actor, plantId, type, decision, note);
    return decision === "approve" ? "Approved." : "Sent back with your notes.";
  });
}

export async function addSourceAction(form: FormData) {
  const { plantId, type } = ids(form);
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, type, async () => {
    const input = z
      .object({
        title: z.string().trim().min(1, "Add the source's title.").max(200),
        publisher: optText(120),
        url: z
          .string()
          .trim()
          .max(500)
          .transform((v) => (v === "" ? null : v))
          .refine((v) => v === null || /^https?:\/\//.test(v), "Links must start with http:// or https://"),
        sourceType: z.enum(["research", "extension_service", "book", "expert_interview", "website"]),
        note: optText(300),
      })
      .parse({
        title: form.get("title"),
        publisher: form.get("publisher") ?? "",
        url: form.get("url") ?? "",
        sourceType: form.get("sourceType"),
        note: form.get("note") ?? "",
      });
    await addSource(actor, plantId, type, input);
    return "Source added.";
  });
}

export async function removeSourceAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  const anchor = pillar.safeParse(form.get("type")).data ?? "sections";
  await run(plantId, anchor, async () => {
    await removeReference(actor, plantId, uuid.parse(form.get("referenceId")));
    return "Source removed.";
  });
}

export async function aiDraftAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "sections", async () => {
    if (!aiDraftConfigured()) throw new WorkflowError("AI drafting is off. Add a Gemini or DeepSeek key to .env.local to turn it on.");
    const data = await getAdminPlant(plantId);
    if (!data) throw new WorkflowError("Plant not found.");
    const category = data.categories.find((c) => c.id === data.plant.categoryId)?.name ?? "Plant";
    const draft = await draftPlantSections({
      commonName: data.plant.commonName,
      botanicalName: data.plant.botanicalName,
      localNames: data.plant.localNames,
      category,
      tagline: data.plant.tagline,
    });
    const { filled, skipped } = await applyAiDraft(actor, plantId, draft);
    if (!filled.length) return "Nothing to draft. Every section is approved or waiting for review.";
    return `AI drafted ${filled.length} section${filled.length === 1 ? "" : "s"}${skipped.length ? `, left ${skipped.length} untouched` : ""}. Read each one before sending it for review.`;
  });
}

export async function publishAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  const publish = form.get("publish") === "1";
  await run(plantId, "publish", async () => {
    await setPlantPublished(actor, plantId, publish);
    return publish ? "Published. It's now live on Discover." : "Unpublished. It's hidden from customers.";
  });
}

// ── Care routine ───────────────────────────────────────────────

const careSchema = z.object({
  taskType: z.enum(["soil_check", "watering", "feeding", "pruning", "repotting", "pest_inspection", "general_inspection", "harvesting", "custom"]),
  title: z.string().trim().min(3, "Give the task a short title.").max(70),
  instructions: z.string().trim().min(20, "Explain the task in a sentence or two.").max(600),
  everyDays: z.coerce.number({ invalid_type_error: "How often, in days?" }).int().min(1, "At least every 1 day.").max(365),
  startAfterDays: z.coerce.number().int().min(0).max(365).catch(0),
});

export async function saveCareAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "care", async () => {
    const input = careSchema.parse(Object.fromEntries(form));
    const id = form.get("careId");
    if (id) {
      await updateCareTemplate(actor, plantId, uuid.parse(id), input);
      return "Care task saved. It needs approval before members see it.";
    }
    await addCareTemplate(actor, plantId, input);
    return "Care task added. It needs approval before members see it.";
  });
}

export async function reviewCareAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "care", async () => {
    const approve = form.get("decision") === "approve";
    const note = optText(500).parse(form.get("note") ?? "");
    if (!approve && !note) throw new WorkflowError("Say what needs changing, so the writer knows what to fix.");
    await reviewCareTemplate(actor, plantId, uuid.parse(form.get("careId")), approve, note);
    return approve ? "Care task approved." : "Sent back with your notes.";
  });
}

export async function retireCareAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "care", async () => {
    await retireCareTemplate(actor, plantId, uuid.parse(form.get("careId")));
    return "Care task retired. Members won't get it from now on.";
  });
}

export async function aiCareDraftAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "care", async () => {
    if (!aiDraftConfigured()) throw new WorkflowError("AI drafting is off. Add a Gemini or DeepSeek key to .env.local to turn it on.");
    const data = await getAdminPlant(plantId);
    if (!data) throw new WorkflowError("Plant not found.");
    const category = data.categories.find((c) => c.id === data.plant.categoryId)?.name ?? "Plant";
    const needs = LAUNCH_PLANTS.find((p) => p.slug === data.plant.slug)?.needs;
    const draft = await draftCareRoutine({
      commonName: data.plant.commonName,
      botanicalName: data.plant.botanicalName,
      localNames: data.plant.localNames,
      category,
      tagline: data.plant.tagline,
      needs: needs ? `sun ${needs.sun}, container ${needs.container}, water ${needs.water}${needs.climbs ? ", climbs" : ""}` : undefined,
    });
    await applyAiCareDraft(actor, plantId, draft.tasks);
    return `AI drafted ${draft.tasks.length} care tasks. Read each one before approving.`;
  });
}
