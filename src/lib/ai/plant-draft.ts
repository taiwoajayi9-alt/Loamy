import { z } from "zod";
import { PILLARS, PILLAR_TYPES, type PillarType } from "@/lib/plant-workflow";

/** Prompt building and response parsing for AI plant drafts. Pure, so it can be tested without the API. */

export type PlantDraftInput = {
  commonName: string;
  botanicalName: string | null;
  localNames: string[];
  category: string;
  tagline: string | null;
};

export type AiProvider = "gemini" | "deepseek" | "anthropic";

/**
 * Which AI service drafts plant content.
 * AI_PROVIDER picks one explicitly; otherwise the first key found wins: Gemini (free tier), DeepSeek, Anthropic.
 */
export function aiDraftProvider(): AiProvider | null {
  const keyFor: Record<AiProvider, string | undefined> = {
    gemini: process.env.GEMINI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };
  const chosen = process.env.AI_PROVIDER as AiProvider | undefined;
  if (chosen && chosen in keyFor) return keyFor[chosen] ? chosen : null;
  return (["gemini", "deepseek", "anthropic"] as const).find((p) => keyFor[p]) ?? null;
}

export const aiDraftConfigured = () => aiDraftProvider() !== null;

const sectionSchema = z.object({
  type: z.enum(PILLAR_TYPES as [PillarType, ...PillarType[]]),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(40).max(4000),
});

const draftSchema = z.object({
  sections: z.array(sectionSchema).min(1).max(6),
});

export type PlantDraft = { sections: z.infer<typeof sectionSchema>[] };

/** Words that suggest the model strayed into pricing or medical claims. Flagged for the reviewer, not silently dropped. */
const RED_FLAGS = [/₦|\bnaira\b|\bprice\b|\bcosts?\b/i, /\bcures?\b|\btreats?\b|\bprevents? (?:cancer|diabetes|disease)\b|\bdosage\b/i];

export function draftWarnings(body: string): string[] {
  const w: string[] = [];
  if (RED_FLAGS[0].test(body)) w.push("Mentions prices or money. Loamy never prices in plant content.");
  if (RED_FLAGS[1].test(body)) w.push("Sounds like a medical claim. Keep it to general wellbeing.");
  return w;
}

export function buildPlantDraftPrompt(p: PlantDraftInput): { system: string; user: string } {
  const system = [
    "You write plant profiles for Loamy, a home gardening app for people in Lagos, Nigeria.",
    "Voice: warm, plain English, encouraging, short sentences, no jargon. Write for beginners growing on balconies, windowsills, rooftops and small compounds.",
    "Lagos context: hot and humid all year, a long rainy season (roughly April to October) and a drier season with harmattan haze. Name these where they matter.",
    "Rules:",
    "- Never mention prices, costs, brands or where to buy.",
    "- No medical claims. Describe traditional and everyday uses as things people do, not as cures or treatments.",
    "- If you are unsure of a fact, leave it out. An expert will review every word before publishing.",
    "- Each section body is 60 to 180 words. Use short paragraphs. Use a simple '- ' list only where it really helps.",
    'Reply with JSON only, no other text: {"sections":[{"type":"<type>","title":"<short heading>","body":"<text>"}]}',
    `Use exactly these six types, in this order: ${PILLARS.map((x) => `${x.type} (${x.label}: ${x.hint})`).join("; ")}.`,
  ].join("\n");

  const facts = [
    `Plant: ${p.commonName}`,
    p.botanicalName ? `Botanical name: ${p.botanicalName}` : null,
    p.localNames.length ? `Local names: ${p.localNames.join(", ")}` : null,
    `Category: ${p.category}`,
    p.tagline ? `Tagline: ${p.tagline}` : null,
  ].filter(Boolean);

  return { system, user: `${facts.join("\n")}\n\nWrite the six sections.` };
}

/** Pulls the JSON object out of the model's reply and validates it. Duplicate section types keep the first. */
export function parsePlantDraft(text: string): PlantDraft {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI reply had no draft in it. Try again.");
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The AI reply wasn't readable. Try again.");
  }
  const parsed = draftSchema.safeParse(json);
  if (!parsed.success) throw new Error("The AI draft didn't match the six sections. Try again.");
  const seen = new Set<PillarType>();
  return { sections: parsed.data.sections.filter((s) => (seen.has(s.type) ? false : (seen.add(s.type), true))) };
}
