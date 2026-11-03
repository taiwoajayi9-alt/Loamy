import "server-only";
import { aiDraftConfigured, aiDraftProvider, buildPlantDraftPrompt, parsePlantDraft, type PlantDraftInput, type PlantDraft } from "@/lib/ai/plant-draft";

export { aiDraftConfigured, aiDraftProvider };

/**
 * Asks an AI model for a first draft of a plant's six sections.
 * Drafts are always saved as unreviewed; an expert approves them before anyone sees them.
 * Uses DeepSeek when DEEPSEEK_API_KEY is set, otherwise Anthropic when ANTHROPIC_API_KEY is set.
 * Both are paid APIs, turned on by the owner.
 */
export async function draftPlantSections(input: PlantDraftInput): Promise<PlantDraft> {
  const { system, user } = buildPlantDraftPrompt(input);
  const provider = aiDraftProvider();
  if (provider === "deepseek") return parsePlantDraft(await callDeepSeek(system, user));
  if (provider === "anthropic") return parsePlantDraft(await callAnthropic(system, user));
  throw new Error("AI drafting is off. Add DEEPSEEK_API_KEY or ANTHROPIC_API_KEY to turn it on.");
}

/** DeepSeek's OpenAI-compatible chat API: https://api-docs.deepseek.com/ */
async function callDeepSeek(system: string, user: string): Promise<string> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: process.env.AI_DRAFT_MODEL || "deepseek-v4-pro",
      max_tokens: 4000,
      temperature: 0.6,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 401) throw new Error("AI drafting failed: DeepSeek didn't accept the API key.");
  if (res.status === 402) throw new Error("AI drafting failed: the DeepSeek account is out of credit.");
  if (!res.ok) throw new Error(`AI drafting failed (DeepSeek ${res.status}). Try again in a minute.`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.AI_DRAFT_MODEL || "claude-sonnet-5-5",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`AI drafting failed (Anthropic ${res.status}). Try again in a minute.`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}
