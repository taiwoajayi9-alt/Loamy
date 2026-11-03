import { describe, expect, it } from "vitest";
import { buildAskPrompt, mentionedPlants, tidyAnswer } from "@/lib/ai/ask";

describe("Ask Loamy prompt", () => {
  const base = { question: "Why are my leaves yellow?", focus: null, gardenPlants: [], knowledge: [], care: [], history: [] };
  it("sets the safety rules", () => {
    const { system } = buildAskPrompt(base);
    expect(system).toMatch(/cannot see the plant/i);
    expect(system).toMatch(/No medical or health claims/);
    expect(system).toMatch(/No prices/);
    expect(system).toMatch(/Ask the Loamy team/);
    expect(system).toMatch(/too vague.*don't guess/);
  });
  it("says when there's no reviewed knowledge", () => {
    expect(buildAskPrompt(base).user).toMatch(/none reviewed yet/);
  });
  it("includes the member's plant records and reviewed knowledge", () => {
    const { user } = buildAskPrompt({
      ...base,
      focus: { name: "Balcony basil", commonName: "Sweet basil", daysGrowing: 21, stage: "Seedling", method: "pot", space: "balcony", sun: "part", water: "easy", recent: ["Check the soil (2026-11-02)"], openTasks: ["Pinch the tips"] },
      knowledge: [{ id: "s1", plant: "Sweet basil", label: "Let's grow it", title: "Getting started", body: "Water when the top 2 cm is dry." }],
      history: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" }],
    });
    expect(user).toContain("Balcony basil (Sweet basil)");
    expect(user).toContain("Growing for 21 days");
    expect(user).toContain("3 to 6 hours of sun");
    expect(user).toContain("Water when the top 2 cm is dry.");
    expect(user).toContain("Member: Hi");
    expect(user.trim().endsWith("Why are my leaves yellow?")).toBe(true);
  });
});

describe("answers and retrieval", () => {
  it("softens any claim to have seen the plant", () => {
    expect(tidyAnswer("Loamy: I can see your plant is thirsty.")).toBe("From what you’ve described your plant is thirsty.");
  });
  it("finds plants named in a question, including local names", () => {
    const plants = [{ id: "a", names: ["Scent leaf", "Efirin"] }, { id: "b", names: ["Mint"] }, { id: "c", names: ["Ugu"] }];
    expect(mentionedPlants("My efirin is wilting", plants)).toEqual(["a"]);
    expect(mentionedPlants("Can I grow mint and ugu together?", plants)).toEqual(["b", "c"]);
    expect(mentionedPlants("Peppermint tea?", plants)).toEqual([]);
  });
});
