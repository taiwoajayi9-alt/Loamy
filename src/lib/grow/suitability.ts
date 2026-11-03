import type { Answers } from "./questions";

/**
 * Deterministic suitability: "Can I grow this here?"
 * Each plant has simple growing needs. Needs become rules (stored in plant_suitability_rules),
 * and rules are matched against a visitor's answers. No AI is involved in the verdict.
 * The needs for launch plants are a starting point and need expert review (ticket LMY-34).
 */

export type PlantNeeds = {
  /** The sun it does best in. */
  sun: "full" | "part" | "low";
  /** Smallest sensible container, or "ground" when it really wants the ground. */
  container: "small" | "medium" | "large" | "xlarge" | "ground";
  water: "low" | "medium" | "high";
  /** Happy indoors by a bright window. */
  indoorOk: boolean;
  /** Climbs or sprawls and needs support or space. */
  climbs?: boolean;
};

export type Outcome = "suitable" | "conditional" | "unsuitable";

/** A condition matches when every listed answer is one of the listed values. */
export type Condition = { all: { key: keyof Answers; in: string[] }[] };

export type Rule = { priority: number; condition: Condition; outcome: Outcome; reason: string };

export const CONTAINER_LABEL: Record<PlantNeeds["container"], string> = {
  small: "a small pot (about 2 to 5 litres)",
  medium: "a medium pot (about 10 to 15 litres)",
  large: "a large pot or grow bag (about 20 to 30 litres)",
  xlarge: "a very large pot (about 50 litres or more)",
  ground: "the ground, or a very large container (50 litres or more)",
};

/** Turns a plant's needs into rules. Highest priority first. */
export function rulesForNeeds(name: string, n: PlantNeeds): Rule[] {
  const rules: Rule[] = [];
  const big = n.container === "large" || n.container === "xlarge" || n.container === "ground";

  // Sun
  if (n.sun === "full") {
    rules.push({ priority: 100, condition: { all: [{ key: "sun", in: ["low"] }] }, outcome: "unsuitable", reason: `${name} needs plenty of direct sun. A spot with under 3 hours won't give it enough to grow well.` });
    rules.push({ priority: 60, condition: { all: [{ key: "sun", in: ["part"] }] }, outcome: "conditional", reason: `${name} does best with 6 hours of sun or more. With 3 to 6 hours it will still grow, just more slowly and with a smaller harvest.` });
  } else if (n.sun === "part") {
    rules.push({ priority: 60, condition: { all: [{ key: "sun", in: ["low"] }] }, outcome: "conditional", reason: `${name} likes at least a few hours of sun. In a shady spot it will grow slowly and look a bit thin. Move it to your brightest spot if you can.` });
    // Drought-lovers (like aloe) handle full sun; only warn the thirstier part-sun plants.
    if (n.water !== "low")
      rules.push({ priority: 30, condition: { all: [{ key: "sun", in: ["full"] }] }, outcome: "conditional", reason: `${name} can scorch in strong Lagos afternoon sun. Give it some shade after midday, or keep the soil a little moister.` });
  } else {
    rules.push({ priority: 30, condition: { all: [{ key: "sun", in: ["full"] }] }, outcome: "conditional", reason: `${name} prefers softer light. Keep it out of harsh afternoon sun or its leaves may burn.` });
  }

  // Space
  if (!n.indoorOk && big) {
    rules.push({ priority: 90, condition: { all: [{ key: "space", in: ["window"] }] }, outcome: "unsuitable", reason: `${name} grows too big for a windowsill. It needs a balcony, rooftop or compound.` });
  } else if (!n.indoorOk) {
    rules.push({ priority: 50, condition: { all: [{ key: "space", in: ["window"] }] }, outcome: "conditional", reason: `${name} can grow by a window only if the window gets direct sun for most of the day. Otherwise, a balcony is better.` });
  }

  // Container
  if (n.container === "ground") {
    rules.push({ priority: 40, condition: { all: [{ key: "method", in: ["pot", "grow_bag"] }] }, outcome: "conditional", reason: `${name} does best in the ground. In a container, use ${CONTAINER_LABEL.xlarge}${n.climbs ? " and give it something to climb" : ""}.` });
  } else if (n.climbs) {
    rules.push({ priority: 35, condition: { all: [{ key: "method", in: ["pot", "grow_bag", "ground"] }] }, outcome: "conditional", reason: `${name} climbs, so give it a trellis, fence or strings to grow up.` });
  }

  // Water
  if (n.water === "high") {
    rules.push({ priority: 45, condition: { all: [{ key: "water", in: ["hard"] }] }, outcome: "conditional", reason: `${name} needs watering most days, especially in the dry season. A hard-to-reach spot will make that tough. Pick a spot closer to water if you can.` });
  }

  return rules.sort((a, b) => b.priority - a.priority);
}

export function matches(c: Condition, answers: Answers): boolean {
  return c.all.every((clause) => clause.in.includes(answers[clause.key] ?? ""));
}

const RANK: Record<Outcome, number> = { suitable: 0, conditional: 1, unsuitable: 2 };

/** The verdict is the worst matching outcome; every matching reason is shown. */
export function evaluate(rules: Rule[], answers: Answers): { outcome: Outcome; reasons: string[] } {
  const hit = [...rules].sort((a, b) => b.priority - a.priority).filter((r) => matches(r.condition, answers));
  const outcome = hit.reduce<Outcome>((worst, r) => (RANK[r.outcome] > RANK[worst] ? r.outcome : worst), "suitable");
  // When it's a no, lead with the reasons that make it a no.
  const reasons = (outcome === "unsuitable" ? hit.filter((r) => r.outcome === "unsuitable") : hit).map((r) => r.reason);
  return { outcome, reasons };
}

export const OUTCOME_HEADLINE: Record<Outcome, (plant: string) => string> = {
  suitable: (p) => `Yes, you can grow ${p.toLowerCase()} there.`,
  conditional: (p) => `Yes, you can grow ${p.toLowerCase()} there, with a few tweaks.`,
  unsuitable: (p) => `${p} won't be happy there.`,
};
