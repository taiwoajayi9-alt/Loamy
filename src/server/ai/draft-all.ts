import "server-only";
import { db } from "@/db/client";
import { plantCategories, plants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyAiDraft, attachAiSources, logDraftAll, type Actor } from "@/server/plant-admin";
import { draftPlantSections, suggestPlantSources } from "./plant-draft";

/** Errors that will fail for every plant, so the run stops instead of burning through the list. */
const FATAL = /didn't accept the API key|out of credit|doesn't recognise the model|drafting is off/i;

export type DraftJob = { id: string; name: string; draft?: boolean; sources?: boolean };

/**
 * Drafts each plant in turn, filling only empty sections, then suggests checked sources for plants
 * that have none. Runs after the response is sent (next/server `after`), one plant at a time to stay
 * inside rate limits. Progress is written to the audit log; see getDraftAllStatus.
 */
export async function runDraftAll(actor: Actor, list: DraftJob[]) {
  for (const p of list) {
    try {
      const [row] = await db
        .select({ commonName: plants.commonName, botanicalName: plants.botanicalName, localNames: plants.localNames, tagline: plants.tagline, category: plantCategories.name })
        .from(plants)
        .innerJoin(plantCategories, eq(plantCategories.id, plants.categoryId))
        .where(eq(plants.id, p.id));
      if (!row) throw new Error("Plant not found.");
      // Older jobs had no flags and meant "draft".
      if (p.draft ?? true) await applyAiDraft(actor, p.id, await draftPlantSections(row), { onlyEmpty: true });
      if (p.sources) {
        const added = await attachAiSources(actor, p.id, await suggestPlantSources(row));
        if (!(p.draft ?? true)) await logDraftAll(actor, "plant.ai_draft", p.id, { sourcesOnly: true, added });
      }
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
