import "server-only";
import { aiDraftConfigured, aiDraftProvider, buildPlantDraftPrompt, parsePlantDraft, type PlantDraftInput, type PlantDraft } from "@/lib/ai/plant-draft";

export { aiDraftConfigured, aiDraftProvider };

/**
 * Asks an AI model for a first draft of a plant's six sections.
 * Drafts are always saved as unreviewed; an expert approves them before anyone sees them.
 * Provider: Gemini (GEMINI_API_KEY, free tier), DeepSeek (DEEPSEEK_API_KEY) or Anthropic (ANTHROPIC_API_KEY).
 */
export async function draftPlantSections(input: PlantDraftInput): Promise<PlantDraft> {
  const { system, user } = buildPlantDraftPrompt(input);
  const provider = aiDraftProvider();
  const model = process.env.AI_DRAFT_MODEL;
  if (provider === "gemini")
    return parsePlantDraft(
      await callOpenAiCompatible("Gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", process.env.GEMINI_API_KEY!, model || "gemini-flash-latest", system, user, {
        // Gemini Flash "thinks" before answering; keep that short so the six sections fit in the reply.
        reasoning_effort: "low",
      }),
    );
  if (provider === "deepseek")
    return parsePlantDraft(
      await callOpenAiCompatible("DeepSeek", "https://api.deepseek.com/chat/completions", process.env.DEEPSEEK_API_KEY!, model || "deepseek-v4-pro", system, user),
    );
  if (provider === "anthropic") return parsePlantDraft(await callAnthropic(model || "claude-sonnet-5-5", system, user));
  throw new Error("AI drafting is off. Add GEMINI_API_KEY (free) or DEEPSEEK_API_KEY to turn it on.");
}

/** Gemini and DeepSeek both accept the OpenAI chat-completions format. */
async function callOpenAiCompatible(
  name: string,
  url: string,
  key: string,
  model: string,
  system: string,
  user: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      temperature: 0.6,
      ...extra,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const detail = await res.text().catch(() => "");
    if (/model/i.test(detail) && /not found|not supported|invalid/i.test(detail))
      throw new Error(`AI drafting failed: ${name} doesn't recognise the model "${model}". Set AI_DRAFT_MODEL in .env.local.`);
    if (res.status === 400 && !/api.?key/i.test(detail))
      throw new Error(`AI drafting failed: ${name} said: ${detail.replace(/\s+/g, " ").slice(0, 200)}`);
    throw new Error(`AI drafting failed: ${name} didn't accept the API key.`);
  }
  if (res.status === 404) throw new Error(`AI drafting failed: ${name} doesn't recognise the model "${model}". Set AI_DRAFT_MODEL in .env.local.`);
  if (res.status === 402) throw new Error(`AI drafting failed: the ${name} account is out of credit.`);
  if (res.status === 429) throw new Error(`AI drafting failed: ${name}'s free limit was reached. Wait a minute (or until tomorrow) and try again.`);
  if (!res.ok) throw new Error(`AI drafting failed (${name} ${res.status}). Try again in a minute.`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(model: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 4000, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`AI drafting failed (Anthropic ${res.status}). Try again in a minute.`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}
