import { describe, expect, it } from "vitest";
import { buildPlantDraftPrompt, draftWarnings, parsePlantDraft } from "@/lib/ai/plant-draft";

const body = "Scent leaf is a bushy herb that grows happily in Lagos heat. ".repeat(2);

describe("AI plant drafts", () => {
  it("tells the model the rules: Lagos, no prices, no medical claims, JSON only", () => {
    const { system, user } = buildPlantDraftPrompt({ commonName: "Scent leaf", botanicalName: "Ocimum gratissimum", localNames: ["Efirin"], category: "Herbs", tagline: null });
    expect(system).toMatch(/Lagos/);
    expect(system).toMatch(/Never mention prices/);
    expect(system).toMatch(/No medical claims/);
    expect(system).toMatch(/JSON only/);
    expect(user).toContain("Efirin");
  });

  it("parses JSON even with text around it, and drops duplicate sections", () => {
    const reply = `Here you go:\n{"sections":[{"type":"meet","title":"Meet scent leaf","body":"${body}"},{"type":"meet","title":"Again","body":"${body}"},{"type":"enjoy","title":"Enjoy","body":"${body}"}]}`;
    const d = parsePlantDraft(reply);
    expect(d.sections.map((s) => s.type)).toEqual(["meet", "enjoy"]);
    expect(d.sections[0].title).toBe("Meet scent leaf");
  });

  it("rejects replies that aren't a valid draft", () => {
    expect(() => parsePlantDraft("Sorry, I can't")).toThrow();
    expect(() => parsePlantDraft('{"sections":[{"type":"price_list","title":"x","body":"y"}]}')).toThrow();
  });

  it("flags prices and medical claims for the reviewer", () => {
    expect(draftWarnings("A bunch costs ₦500 at the market.")).toHaveLength(1);
    expect(draftWarnings("Scent leaf cures malaria.")).toHaveLength(1);
    expect(draftWarnings("People use it in pepper soup.")).toHaveLength(0);
  });
});

describe("AI provider choice", () => {
  it("picks Gemini, then DeepSeek, then Anthropic, unless AI_PROVIDER says otherwise", async () => {
    const { aiDraftProvider } = await import("@/lib/ai/plant-draft");
    const keys = ["GEMINI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "AI_PROVIDER"] as const;
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    expect(aiDraftProvider()).toBeNull();
    process.env.ANTHROPIC_API_KEY = "a";
    expect(aiDraftProvider()).toBe("anthropic");
    process.env.DEEPSEEK_API_KEY = "d";
    expect(aiDraftProvider()).toBe("deepseek");
    process.env.GEMINI_API_KEY = "g";
    expect(aiDraftProvider()).toBe("gemini");
    process.env.AI_PROVIDER = "deepseek";
    expect(aiDraftProvider()).toBe("deepseek");
    for (const k of keys) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  });

  it("reads a draft wrapped in a ```json code block", () => {
    const body = "Waterleaf grows fast in Lagos humidity and loves a bit of shade. ".repeat(2);
    const reply = "```json\n" + JSON.stringify({ sections: [{ type: "meet", title: "Meet waterleaf", body }] }) + "\n```";
    expect(parsePlantDraft(reply).sections).toHaveLength(1);
  });
});
