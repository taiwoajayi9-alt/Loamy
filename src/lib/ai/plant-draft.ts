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

// ── Care routine drafts ────────────────────────────────────────

const CARE_TYPES = ["soil_check", "watering", "feeding", "pruning", "repotting", "pest_inspection", "general_inspection", "harvesting", "custom"] as const;

const careTaskSchema = z.object({
  taskType: z.enum(CARE_TYPES),
  title: z.string().trim().min(3).max(70),
  instructions: z.string().trim().min(20).max(600),
  everyDays: z.number().int().min(1).max(90),
  startAfterDays: z.number().int().min(0).max(180).default(0),
});
const careDraftSchema = z.object({ tasks: z.array(careTaskSchema).min(1).max(8) });
export type CareDraft = z.infer<typeof careDraftSchema>;

export function buildCareRoutinePrompt(p: PlantDraftInput & { needs?: string }): { system: string; user: string } {
  const system = [
    "You write care routines for Loamy, a home gardening app for beginners in Lagos, Nigeria (hot, humid, long rainy season, dry harmattan season).",
    "A care routine is 3 to 6 repeating tasks for a plant grown in a pot, grow bag or small bed. Each task has a short title, plain instructions (one to three sentences), how often it repeats in days, and how many days after planting it starts.",
    "Rules:",
    "- Prefer 'check the soil, then water if dry' over fixed watering. Never tell people to water on a strict timer.",
    "- Mention the rainy and dry season where it changes what to do.",
    "- No prices, brands, chemicals or pesticides by name. Suggest gentle options like hand-picking pests or a mild soap spray.",
    "- No medical claims. If unsure, leave it out: an expert reviews every task.",
    `- taskType must be one of: ${CARE_TYPES.join(", ")}.`,
    'Reply with JSON only: {"tasks":[{"taskType":"soil_check","title":"...","instructions":"...","everyDays":1,"startAfterDays":0}]}',
  ].join("\n");
  const facts = [
    `Plant: ${p.commonName}`,
    p.botanicalName ? `Botanical name: ${p.botanicalName}` : null,
    p.localNames.length ? `Local names: ${p.localNames.join(", ")}` : null,
    `Category: ${p.category}`,
    p.needs ? `Growing needs: ${p.needs}` : null,
  ].filter(Boolean);
  return { system, user: `${facts.join("\n")}\n\nWrite the care routine.` };
}

export function parseCareRoutine(text: string): CareDraft {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI reply had no care routine in it. Try again.");
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The AI reply wasn't readable. Try again.");
  }
  const parsed = careDraftSchema.safeParse(json);
  if (!parsed.success) throw new Error("The AI care routine wasn't in the right shape. Try again.");
  return parsed.data;
}

// ── Source suggestions ─────────────────────────────────────────

export const SOURCE_TYPES = ["research", "extension_service", "book", "expert_interview", "website"] as const;

const sourceSchema = z.object({
  title: z.string().trim().min(3).max(200),
  publisher: z.string().trim().max(120).nullish(),
  url: z.string().trim().url().max(500),
  sourceType: z.enum(SOURCE_TYPES).catch("website"),
});
const sourcesSchema = z.object({ sources: z.array(z.unknown()).max(10) });
export type SuggestedSource = { title: string; publisher: string | null; url: string; sourceType: (typeof SOURCE_TYPES)[number] };

/** Marks AI-suggested references so reviewers can tell them apart from ones a person added. */
export const AI_SOURCE_NOTE = "Suggested by AI, link checked. Confirm it backs this text before approving.";

export function buildSourcesPrompt(p: PlantDraftInput): { system: string; user: string } {
  const system = [
    "You suggest reference sources for plant profiles in Loamy, a home gardening app for Lagos, Nigeria.",
    "Suggest 3 to 5 real, well-known, publicly available web pages about growing this plant: for example FAO (including Ecocrop), PROTA4U, IITA, NIHORT, university or government extension services, the Royal Horticultural Society, Missouri Botanical Garden, Kew (POWO) or Wikipedia as a last resort.",
    "Rules:",
    "- Only suggest pages you are confident exist. Never invent a URL. A publisher's search or species page you are sure of is better than a guessed deep link.",
    "- Prefer sources about growing the plant in the tropics or West Africa.",
    "- No shops, seed sellers, blogs selling products, or social media.",
    `- sourceType is one of: ${SOURCE_TYPES.join(", ")}.`,
    'Reply with JSON only: {"sources":[{"title":"...","publisher":"...","url":"https://...","sourceType":"extension_service"}]}',
  ].join("\n");
  const facts = [
    `Plant: ${p.commonName}`,
    p.botanicalName ? `Botanical name: ${p.botanicalName}` : null,
    p.localNames.length ? `Local names: ${p.localNames.join(", ")}` : null,
  ].filter(Boolean);
  return { system, user: `${facts.join("\n")}\n\nSuggest the sources.` };
}

/** Keeps well-formed https suggestions only, drops shops and duplicates. Bad entries are skipped, not fatal. */
export function parseSources(text: string): SuggestedSource[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI reply had no sources in it. Try again.");
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The AI reply wasn't readable. Try again.");
  }
  const list = sourcesSchema.safeParse(json);
  if (!list.success) throw new Error("The AI sources weren't in the right shape. Try again.");
  const seen = new Set<string>();
  const out: SuggestedSource[] = [];
  for (const raw of list.data.sources) {
    const s = sourceSchema.safeParse(raw);
    if (!s.success) continue;
    const url = s.data.url;
    if (!url.startsWith("https://")) continue;
    if (/amazon\.|jumia\.|konga\.|temu\.|aliexpress\.|ebay\.|etsy\.|facebook\.|instagram\.|tiktok\.|youtube\.|pinterest\./i.test(url)) continue;
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: s.data.title, publisher: s.data.publisher ?? null, url, sourceType: s.data.sourceType });
  }
  return out.slice(0, 5);
}
