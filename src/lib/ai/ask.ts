/**
 * Ask Loamy: prompt building and limits. Pure, so the rules are testable without the AI.
 * Answers are grounded in reviewed (approved + published) plant content and the member's own records.
 * Ask Loamy never claims to see or diagnose a plant, gives no medical claims and never sets prices.
 */

export const DAILY_QUESTION_LIMIT = 30;
export const MAX_QUESTION_CHARS = 800;
export const HISTORY_TURNS = 8;

export type KnowledgeSection = { id: string; plant: string; label: string; title: string; body: string };
export type CareTaskInfo = { plant: string; title: string; instructions: string; rule: string };
export type MemberPlant = {
  name: string;
  commonName: string;
  daysGrowing: number | null;
  stage: string | null;
  method: string | null;
  space: string | null;
  sun: string | null;
  water: string | null;
  recent: string[];
  openTasks: string[];
};
export type Turn = { role: "user" | "assistant"; content: string };

const SUN: Record<string, string> = { full: "6+ hours of direct sun", part: "3 to 6 hours of sun", low: "under 3 hours of sun" };
const WATER: Record<string, string> = { easy: "water is easy to reach", some: "carries water a short way", hard: "water is hard to reach" };

export function buildAskPrompt(input: {
  question: string;
  focus: MemberPlant | null;
  gardenPlants: string[];
  knowledge: KnowledgeSection[];
  care: CareTaskInfo[];
  history: Turn[];
}): { system: string; user: string } {
  const system = [
    "You are Ask Loamy, the gardening companion in the Loamy app for home growers in Lagos, Nigeria.",
    "Voice: warm, calm, plain English, short paragraphs. Encouraging and honest. Celebrate progress, not perfection.",
    "Lagos context: hot and humid all year; long rainy season (roughly April to October); drier season with harmattan haze.",
    "",
    "Ground rules:",
    "1. Base your answer on the LOAMY KNOWLEDGE and MEMBER RECORDS below. These are reviewed by Loamy's plant experts. If they don't cover the question, say so plainly, give only general, low-risk advice, and suggest asking the Loamy team.",
    "2. You cannot see the plant. Never say you can see, identify or diagnose it. Offer possibilities as possibilities ('it may be...', 'one common cause is...'), then say exactly what to check next.",
    "3. No medical or health claims. Traditional uses are things people do, not cures or treatments.",
    "4. No prices, brands, chemical pesticides or fertiliser brand names. Prefer gentle options (hand-picking pests, mild soap spray, compost).",
    "5. Prefer 'check the soil first' over fixed watering amounts. Timelines are approximate, never promises.",
    "6. If something sounds urgent or beyond home care (spreading disease, most of the plant dying, safety worries), say so and suggest tapping 'Ask the Loamy team'.",
    "7. Keep answers under about 180 words. Use a short '- ' list only when steps help. End with one clear next step when it makes sense.",
    "8. Stay on gardening, the member's plants, harvesting and cooking with what they grow. Politely decline anything else.",
    "9. If the question is too vague to answer safely (for example 'what's wrong with my plant?' with no details), don't guess: ask one or two short questions about what they can see, such as which leaves, what colour, and how wet the soil is.",
  ].join("\n");

  const parts: string[] = [];
  if (input.focus) {
    const f = input.focus;
    parts.push(
      [
        `MEMBER RECORDS (the plant they're asking about): ${f.name}${f.name !== f.commonName ? ` (${f.commonName})` : ""}`,
        f.daysGrowing != null ? `- Growing for ${f.daysGrowing} day${f.daysGrowing === 1 ? "" : "s"}` : null,
        f.stage ? `- Current stage they set: ${f.stage}` : null,
        f.method || f.space ? `- Growing ${f.method === "ground" ? "in the ground" : f.method === "grow_bag" ? "in a grow bag" : "in a pot"}${f.space ? ` on/in a ${f.space}` : ""}` : null,
        f.sun ? `- Spot gets ${SUN[f.sun] ?? f.sun}` : null,
        f.water ? `- Watering: ${WATER[f.water] ?? f.water}` : null,
        f.recent.length ? `- Recent care they logged: ${f.recent.join("; ")}` : "- No care logged yet",
        f.openTasks.length ? `- Care tasks due now: ${f.openTasks.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (input.gardenPlants.length) parts.push(`Plants in their garden: ${input.gardenPlants.join(", ")}.`);
  if (input.knowledge.length)
    parts.push(
      "LOAMY KNOWLEDGE (reviewed):\n" +
        input.knowledge.map((k) => `[${k.plant} · ${k.label}] ${k.title}\n${k.body.slice(0, 1500)}`).join("\n\n"),
    );
  else parts.push("LOAMY KNOWLEDGE: none reviewed yet for this question.");
  if (input.care.length) parts.push("CARE ROUTINE (reviewed):\n" + input.care.map((c) => `- [${c.plant}] ${c.title} (${c.rule}): ${c.instructions}`).join("\n"));
  if (input.history.length)
    parts.push("CONVERSATION SO FAR:\n" + input.history.map((t) => `${t.role === "user" ? "Member" : "Loamy"}: ${t.content.slice(0, 1200)}`).join("\n"));
  parts.push(`MEMBER'S QUESTION:\n${input.question}`);
  return { system, user: parts.join("\n\n") };
}

/** Phrases the model must not use; if present, the answer is softened before it's shown. */
const SEEING = /\b(I can see|I see that your|looking at your (plant|photo)|from the photo|I've diagnosed|I diagnose|your plant has been diagnosed)\b/i;

export function tidyAnswer(text: string): string {
  let out = text.trim().replace(/^Loamy:\s*/i, "");
  if (SEEING.test(out)) out = out.replace(SEEING, "From what you’ve described");
  return out.slice(0, 4000);
}

/** Simple retrieval: which plants does the question mention by name or local name? */
export function mentionedPlants(question: string, plants: { id: string; names: string[] }[]): string[] {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ")} `;
  return plants.filter((p) => p.names.some((n) => n.length >= 3 && q.includes(` ${n.toLowerCase()}`))).map((p) => p.id);
}

/** Section order by how often each pillar answers care questions. */
export const SECTION_PRIORITY = ["lets_grow", "could_you_grow_it", "journey", "enjoy", "meet", "good_for_you"] as const;
