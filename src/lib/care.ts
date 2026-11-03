/**
 * Care engine: turns reviewed care templates into today's tasks for a plant in someone's garden.
 * Pure (no database), so the scheduling rules are easy to test.
 *
 * A template repeats every N days, starting a set number of days after planting.
 * The next task is due N days after the last time it was done or skipped; if it has never
 * been done, on the start day. Tasks are suggestions: members do what suits their plant.
 */

export type TimingRule = { everyDays: number; startAfterDays?: number };

export type CareTemplate = { id: string; taskType: string; title: string; instructions: string; timingRule: TimingRule };

/** Matches the activity_type enum in the database. */
export const TASK_TYPES = [
  { value: "soil_check", label: "Check the soil" },
  { value: "watering", label: "Water" },
  { value: "feeding", label: "Feed" },
  { value: "pruning", label: "Prune or pinch" },
  { value: "repotting", label: "Repot" },
  { value: "pest_inspection", label: "Check for pests" },
  { value: "general_inspection", label: "Look it over" },
  { value: "harvesting", label: "Harvest" },
  { value: "custom", label: "Other" },
] as const;
export type TaskType = (typeof TASK_TYPES)[number]["value"];

export function taskTypeLabel(value: string): string {
  return TASK_TYPES.find((t) => t.value === value)?.label ?? value.replace(/_/g, " ");
}

/** Lagos calendar day (YYYY-MM-DD) for a moment in time. Care runs on local days, not UTC. */
export function lagosDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function isValidRule(r: unknown): r is TimingRule {
  const x = r as TimingRule;
  return !!x && Number.isInteger(x.everyDays) && x.everyDays >= 1 && x.everyDays <= 365 && (x.startAfterDays == null || (Number.isInteger(x.startAfterDays) && x.startAfterDays >= 0 && x.startAfterDays <= 365));
}

/** When a template is next due, given the planting day and the last day it was done or skipped. */
export function nextDueDay(rule: TimingRule, plantedDay: string, lastHandledDay: string | null): string {
  if (lastHandledDay) return addDays(lastHandledDay, rule.everyDays);
  return addDays(plantedDay, rule.startAfterDays ?? 0);
}

export type DueTask = CareTemplate & { dueDay: string; overdueDays: number };

/** Tasks due on or before `today`, most overdue first. Overdue tasks show once, not once per missed day. */
export function dueTasks(templates: CareTemplate[], plantedDay: string, lastHandled: Map<string, string>, today: string): DueTask[] {
  return templates
    .filter((t) => isValidRule(t.timingRule))
    .map((t) => {
      const dueDay = nextDueDay(t.timingRule, plantedDay, lastHandled.get(t.id) ?? null);
      return { ...t, dueDay, overdueDays: daysBetween(dueDay, today) };
    })
    .filter((t) => t.overdueDays >= 0)
    .sort((a, b) => b.overdueDays - a.overdueDays || a.title.localeCompare(b.title));
}

/** "Every day", "Every 3 days", "Every week", "Every 2 weeks". */
export function describeRule(r: TimingRule): string {
  const every = r.everyDays === 1 ? "Every day" : r.everyDays % 7 === 0 ? (r.everyDays === 7 ? "Every week" : `Every ${r.everyDays / 7} weeks`) : `Every ${r.everyDays} days`;
  if (!r.startAfterDays) return every;
  const start = r.startAfterDays % 7 === 0 && r.startAfterDays >= 7 ? `${r.startAfterDays / 7} week${r.startAfterDays === 7 ? "" : "s"}` : `${r.startAfterDays} day${r.startAfterDays === 1 ? "" : "s"}`;
  return `${every}, starting ${start} after planting`;
}

export function dueLabel(overdueDays: number): string {
  if (overdueDays <= 0) return "Today";
  if (overdueDays === 1) return "Since yesterday";
  return `${overdueDays} days late`;
}

export const MILESTONES = [
  { value: "first_sprout", label: "First sprout" },
  { value: "first_true_leaves", label: "First true leaves" },
  { value: "transplanted", label: "Moved to a bigger pot or the ground" },
  { value: "first_flower", label: "First flower" },
  { value: "first_fruit", label: "First fruit or pods" },
  { value: "first_harvest", label: "First harvest" },
] as const;

export const HARVEST_UNITS = ["handfuls", "leaves", "bunches", "pieces", "grams", "kg"] as const;
