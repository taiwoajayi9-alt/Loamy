import { describe, expect, it } from "vitest";
import { addDays, daysBetween, describeRule, dueLabel, dueTasks, isValidRule, lagosDay, nextDueDay } from "@/lib/care";

const t = (id: string, everyDays: number, startAfterDays?: number) => ({ id, taskType: "watering", title: id, instructions: "x", timingRule: { everyDays, startAfterDays } });

describe("care days", () => {
  it("uses Lagos days, not UTC", () => {
    expect(lagosDay(new Date("2026-11-03T23:30:00Z"))).toBe("2026-11-04"); // 00:30 in Lagos
    expect(lagosDay(new Date("2026-11-03T22:30:00Z"))).toBe("2026-11-03");
  });
  it("does date maths across months", () => {
    expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
    expect(daysBetween("2026-11-28", "2026-12-03")).toBe(5);
  });
});

describe("scheduling", () => {
  it("first task falls on the start day, then repeats from the last time it was handled", () => {
    expect(nextDueDay({ everyDays: 3, startAfterDays: 7 }, "2026-11-01", null)).toBe("2026-11-08");
    expect(nextDueDay({ everyDays: 3 }, "2026-11-01", "2026-11-04")).toBe("2026-11-07");
  });
  it("shows what's due today, most overdue first, once each", () => {
    const due = dueTasks([t("soil", 1), t("feed", 14, 14), t("pinch", 7)], "2026-11-01", new Map([["pinch", "2026-11-01"]]), "2026-11-10");
    expect(due.map((d) => [d.id, d.overdueDays])).toEqual([["soil", 9], ["pinch", 2]]);
  });
  it("nothing is due once today's task is done", () => {
    expect(dueTasks([t("soil", 1)], "2026-11-01", new Map([["soil", "2026-11-10"]]), "2026-11-10")).toEqual([]);
  });
  it("ignores broken timing rules", () => {
    expect(isValidRule({ everyDays: 0 })).toBe(false);
    expect(dueTasks([{ ...t("bad", 1), timingRule: { everyDays: -1 } }], "2026-11-01", new Map(), "2026-11-10")).toEqual([]);
  });
});

describe("wording", () => {
  it("describes rules and lateness in plain words", () => {
    expect(describeRule({ everyDays: 1 })).toBe("Every day");
    expect(describeRule({ everyDays: 14, startAfterDays: 21 })).toBe("Every 2 weeks, starting 3 weeks after planting");
    expect(describeRule({ everyDays: 3, startAfterDays: 1 })).toBe("Every 3 days, starting 1 day after planting");
    expect([dueLabel(0), dueLabel(1), dueLabel(4)]).toEqual(["Today", "Since yesterday", "4 days late"]);
  });
});
