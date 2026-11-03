import { describe, expect, it } from "vitest";
import { LAUNCH_PLANTS } from "@/db/launch-catalogue";
import { normaliseAnswers, parseAnswers, visibleQuestions } from "@/lib/grow/questions";
import { evaluate, rulesForNeeds } from "@/lib/grow/suitability";

const plant = (slug: string) => LAUNCH_PLANTS.find((p) => p.slug === slug)!;
const verdict = (slug: string, answers: Record<string, string>) => {
  const p = plant(slug);
  return evaluate(rulesForNeeds(p.commonName, p.needs), normaliseAnswers(answers));
};

describe("questions", () => {
  it("only asks about growing in the ground for a compound", () => {
    expect(visibleQuestions({ space: "balcony" }).map((q) => q.key)).toEqual(["space", "sun", "water", "experience"]);
    expect(visibleQuestions({ space: "compound" }).map((q) => q.key)).toContain("method");
  });
  it("validates answers on the server and assumes a pot when not asked", () => {
    expect(parseAnswers({ space: "balcony", sun: "full", water: "easy", experience: "new" })).toEqual({ space: "balcony", sun: "full", water: "easy", experience: "new", method: "pot" });
    expect(() => parseAnswers({ space: "balcony" })).toThrow();
    expect(() => parseAnswers({ space: "moon", sun: "full", water: "easy", experience: "new" })).toThrow();
    // A stale "ground" answer is dropped when the space isn't a compound.
    expect(parseAnswers({ space: "balcony", sun: "full", water: "easy", experience: "new", method: "ground" }).method).toBe("pot");
  });
});

describe("can I grow this here?", () => {
  it("says yes when the spot matches", () => {
    expect(verdict("ata-rodo", { space: "balcony", sun: "full", water: "easy", experience: "new" })).toEqual({ outcome: "suitable", reasons: [] });
    expect(verdict("snake-plant", { space: "window", sun: "low", water: "hard", experience: "new" }).outcome).toBe("suitable");
  });
  it("says yes with tweaks, and explains why", () => {
    const v = verdict("sweet-basil", { space: "balcony", sun: "part", water: "easy", experience: "new" });
    expect(v.outcome).toBe("conditional");
    expect(v.reasons[0]).toMatch(/6 hours/);
  });
  it("says no for a sun-lover in shade or a big plant on a windowsill", () => {
    expect(verdict("cherry-tomato", { space: "balcony", sun: "low", water: "easy", experience: "new" }).outcome).toBe("unsuitable");
    const lime = verdict("dwarf-lime", { space: "window", sun: "full", water: "easy", experience: "new" });
    expect(lime.outcome).toBe("unsuitable");
    expect(lime.reasons.join(" ")).toMatch(/too big for a windowsill/);
  });
  it("flags thirsty plants in hard-to-water spots and climbers needing support", () => {
    expect(verdict("waterleaf", { space: "balcony", sun: "part", water: "hard", experience: "new" }).reasons.join(" ")).toMatch(/watering most days/);
    expect(verdict("ugu", { space: "compound", sun: "full", method: "pot", water: "easy", experience: "new" }).reasons.join(" ")).toMatch(/in the ground.*climb/);
  });
  it("every launch plant has needs and fits at least one common Lagos balcony", () => {
    for (const p of LAUNCH_PLANTS) {
      const sunny = evaluate(rulesForNeeds(p.commonName, p.needs), normaliseAnswers({ space: "compound", sun: p.needs.sun, method: p.needs.container === "ground" ? "ground" : "pot", water: "easy", experience: "some" }));
      expect(sunny.outcome, p.slug).not.toBe("unsuitable");
    }
  });
});
