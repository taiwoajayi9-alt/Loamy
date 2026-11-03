import { z } from "zod";

/**
 * "Can I grow this here?" questions. One core set for every plant at launch;
 * per-plant questions from plant_questions can extend it later.
 * Pure and shared by the browser (the stepper) and the server (validation).
 */

export type Option = { value: string; label: string; hint?: string };
export type Question = {
  key: "space" | "sun" | "method" | "water" | "experience";
  prompt: (plant: string) => string;
  help?: string;
  options: Option[];
  /** Only ask when an earlier answer matches. */
  showIf?: Partial<Record<string, string[]>>;
};

export const CORE_QUESTIONS: Question[] = [
  {
    key: "space",
    prompt: (p) => `Where would your ${p} grow?`,
    options: [
      { value: "balcony", label: "Balcony" },
      { value: "window", label: "Indoors, by a window" },
      { value: "rooftop", label: "Rooftop or terrace" },
      { value: "compound", label: "Compound or garden" },
    ],
  },
  {
    key: "sun",
    prompt: () => "How much direct sun does that spot get?",
    help: "A rough guess is fine. Watch the spot for a day if you're not sure.",
    options: [
      { value: "full", label: "6 hours or more", hint: "Bright sun most of the day" },
      { value: "part", label: "3 to 6 hours", hint: "Sun for part of the day" },
      { value: "low", label: "Under 3 hours", hint: "Mostly shade or indirect light" },
    ],
  },
  {
    key: "method",
    prompt: () => "How would you like to grow it?",
    options: [
      { value: "pot", label: "In a pot" },
      { value: "grow_bag", label: "In a grow bag" },
      { value: "ground", label: "In the ground" },
    ],
    showIf: { space: ["compound"] },
  },
  {
    key: "water",
    prompt: () => "How easy is it to water there?",
    options: [
      { value: "easy", label: "Easy", hint: "Tap or water close by" },
      { value: "some", label: "Some effort", hint: "I carry water a short way" },
      { value: "hard", label: "Hard", hint: "Water is far or I travel often" },
    ],
  },
  {
    key: "experience",
    prompt: () => "Have you grown plants before?",
    options: [
      { value: "new", label: "This is my first" },
      { value: "some", label: "A few" },
      { value: "lots", label: "Lots" },
    ],
  },
];

export type Answers = Partial<Record<Question["key"], string>>;

export function isVisible(q: Question, answers: Answers): boolean {
  if (!q.showIf) return true;
  return Object.entries(q.showIf).every(([k, vals]) => vals?.includes(answers[k as Question["key"]] ?? ""));
}

/** The questions to ask, in order, given the answers so far. */
export function visibleQuestions(answers: Answers): Question[] {
  return CORE_QUESTIONS.filter((q) => isVisible(q, answers));
}

/** Fills in answers that are implied when a question is skipped (no compound = no ground). */
export function normaliseAnswers(answers: Answers): Answers {
  const out: Answers = {};
  for (const q of CORE_QUESTIONS) if (isVisible(q, answers) && answers[q.key]) out[q.key] = answers[q.key];
  if (!out.method) out.method = "pot";
  return out;
}

/** Server-side validation: every visible question answered with one of its options. */
export function parseAnswers(raw: Record<string, unknown>): Answers {
  const answers: Answers = {};
  for (const q of CORE_QUESTIONS) {
    const v = raw[q.key];
    if (typeof v === "string" && q.options.some((o) => o.value === v)) answers[q.key] = v;
  }
  for (const q of visibleQuestions(answers)) {
    if (!answers[q.key]) throw new z.ZodError([{ code: "custom", path: [q.key], message: "Answer every question to see your plan." }]);
  }
  return normaliseAnswers(answers);
}

export function answerLabel(key: Question["key"], value: string | undefined): string {
  const q = CORE_QUESTIONS.find((x) => x.key === key);
  return q?.options.find((o) => o.value === value)?.label ?? (key === "method" && value === "pot" ? "In a pot" : "—");
}
