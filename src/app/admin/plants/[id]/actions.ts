"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PILLAR_TYPES, type PillarType } from "@/lib/plant-workflow";
import { aiDraftConfigured, draftPlantSections } from "@/server/ai/plant-draft";
import {
  addSource,
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
