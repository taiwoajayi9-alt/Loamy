import "server-only";
import { aiDraftConfigured, buildPlantDraftPrompt, parsePlantDraft, type PlantDraftInput, type PlantDraft } from "@/lib/ai/plant-draft";

export { aiDraftConfigured };

/**
 * Asks Claude for a first draft of a plant's six sections.
 * Drafts are always saved as unreviewed; an expert approves them before anyone sees them.
 * Off unless ANTHROPIC_API_KEY is set (a paid API — owner approval needed to turn on).
 */
export async function draftPlantSections(input: PlantDraftInput): Promise<PlantDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI drafting is off. Add ANTHROPIC_API_KEY to turn it on.");
  const { system, user } = buildPlantDraftPrompt(input);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.AI_DRAFT_MODEL || "claude-sonnet-5-5",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`AI drafting failed (${res.status}).`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  return parsePlantDraft(text);
}
