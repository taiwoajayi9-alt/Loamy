"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PILLAR_TYPES, type PillarType } from "@/lib/plant-workflow";
import { LAUNCH_PLANTS } from "@/db/launch-catalogue";
import { aiDraftConfigured, draftCareRoutine, draftPlantSections, suggestPlantSources } from "@/server/ai/plant-draft";
import {
  addCareTemplate,
  addPlantImage,
  makePlantCover,
  removePlantImage,
  addSource,
  applyAiCareDraft,
  approveAllForPlant,
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
  submitAllDrafts,
  submitSection,
  updatePlantBasics,
  attachAiSources,
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
    return `AI drafted ${filled.length} section${filled.length === 1 ? "" : "s"} and sent ${filled.length === 1 ? "it" : "them"} for review${skipped.length ? `. ${skipped.length} left untouched` : ""}.`;
  });
}

/** AI suggests reference pages; only links that open are kept, labelled for the expert to confirm. */
export async function aiSourcesAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "sections", async () => {
    if (!aiDraftConfigured()) throw new WorkflowError("AI is off. Add a Gemini or DeepSeek key to .env.local to turn it on.");
    const data = await getAdminPlant(plantId);
    if (!data) throw new WorkflowError("Plant not found.");
    if (!data.sections.length) throw new WorkflowError("Draft the sections first, then find sources for them.");
    let found;
    try {
      found = await suggestPlantSources({
        commonName: data.plant.commonName,
        botanicalName: data.plant.botanicalName,
        localNames: data.plant.localNames,
        category: "",
        tagline: null,
      });
    } catch (err) {
      throw new WorkflowError(err instanceof Error ? err.message : "AI couldn't find sources. Try again.");
    }
    if (!found.length) return "AI's suggested links didn't open, so none were added. Try again, or add a source yourself.";
    const added = await attachAiSources(actor, plantId, found);
    return added
      ? `Added ${added} source${added === 1 ? "" : "s"}. Each link was checked and opens. Confirm they back the text when you review.`
      : "Those sources are already on this plant.";
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

export async function submitAllAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "sections", async () => {
    const n = await submitAllDrafts(actor, plantId);
    return n ? `Sent ${n} section${n === 1 ? "" : "s"} for review.` : "No drafts to send. Sections are already waiting for review or approved.";
  });
}

export async function approveAllAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "sections", async () => {
    if (form.get("confirm") !== "yes") throw new WorkflowError("Tick the box to confirm you've read this plant's content.");
    const { sections, care } = await approveAllForPlant(actor, plantId);
    if (!sections && !care) return "Nothing was waiting for review.";
    return `Approved ${sections} section${sections === 1 ? "" : "s"} and ${care} care task${care === 1 ? "" : "s"}. Add a source, then publish.`;
  });
}

// ── Plant photos ───────────────────────────────────────────────

export async function addPlantImageAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "photos", async () => {
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new WorkflowError("Choose a photo first.");
    const alt = z.string().trim().min(3, "Describe the photo in a few words, for people using screen readers.").max(200).parse(form.get("altText"));
    await addPlantImage(actor, plantId, file, alt, optText(140).parse(form.get("caption") ?? ""));
    return "Photo added.";
  });
}

export async function plantImageAction(form: FormData) {
  const plantId = uuid.parse(form.get("plantId"));
  const actor = await requirePlantLibrary(`/admin/plants/${plantId}`);
  await run(plantId, "photos", async () => {
    const imageId = uuid.parse(form.get("imageId"));
    if (form.get("op") === "cover") {
      await makePlantCover(actor, plantId, imageId);
      return "Cover photo updated.";
    }
    await removePlantImage(actor, plantId, imageId);
    return "Photo removed.";
  });
}
