import "server-only";
import { db } from "@/db/client";
import { plantCategories, plants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyAiDraft, logDraftAll, type Actor } from "@/server/plant-admin";
import { draftPlantSections } from "./plant-draft";

/** Errors that will fail for every plant, so the run stops instead of burning through the list. */
const FATAL = /didn't accept the API key|out of credit|doesn't recognise the model|drafting is off/i;

/**
 * Drafts each plant in turn, filling only empty sections. Runs after the response is sent
 * (next/server `after`), one plant at a time to stay inside free-tier and rate limits.
 * Progress is written to the audit log; see getDraftAllStatus.
 */
export async function runDraftAll(actor: Actor, list: { id: string; name: string }[]) {
  for (const p of list) {
    try {
      const [row] = await db
        .select({ commonName: plants.commonName, botanicalName: plants.botanicalName, localNames: plants.localNames, tagline: plants.tagline, category: plantCategories.name })
        .from(plants)
        .innerJoin(plantCategories, eq(plantCategories.id, plants.categoryId))
        .where(eq(plants.id, p.id));
      if (!row) throw new Error("Plant not found.");
      const draft = await draftPlantSections(row);
      await applyAiDraft(actor, p.id, draft, { onlyEmpty: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logDraftAll(actor, "plant.ai_draft_failed", p.id, { message });
      if (FATAL.test(message)) {
        await logDraftAll(actor, "plant.ai_draft_all.stopped", p.id, { reason: message });
        return;
      }
    }
  }
  await logDraftAll(actor, "plant.ai_draft_all.finished", "all", null);
}
