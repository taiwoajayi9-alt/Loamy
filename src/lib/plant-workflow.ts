/**
 * Plant content workflow (handoff: expert review before publishing).
 *
 * Each plant has six sections ("pillars"). Every section moves through:
 *   draft  →  in review  →  approved (published)      or  →  changes requested (back to draft)
 * Editing an approved section starts a new version, so customers keep seeing the
 * approved text until the new version is approved too.
 *
 * A plant can be published only when all six sections have an approved version
 * and at least one source is attached. Pure functions: no database access here.
 */

export const PILLARS = [
  { type: "meet", label: "Meet the plant", hint: "What it is, where it comes from, what it looks like and why people love it." },
  { type: "good_for_you", label: "Good for you", hint: "How people use it: food, tea, scent, beauty. General wellbeing only, never medical claims." },
  { type: "could_you_grow_it", label: "Could you grow it?", hint: "Light, space, water and effort needed in a Lagos home: balcony, window, rooftop or compound." },
  { type: "journey", label: "Your journey", hint: "The growth stages from planting to harvest or maturity, with rough timings." },
  { type: "enjoy", label: "Enjoy it", hint: "How to harvest and use it: simple Nigerian kitchen ideas, storage, sharing." },
  { type: "lets_grow", label: "Let's grow it", hint: "What you need to start, and the first few steps." },
] as const;

export type PillarType = (typeof PILLARS)[number]["type"];
export const PILLAR_TYPES = PILLARS.map((p) => p.type) as PillarType[];

export type PublicationStatus = "draft" | "in_review" | "published" | "archived";
export type ReviewStatus = "pending" | "approved" | "rejected";

export type SectionVersion = {
  sectionType: PillarType;
  version: number;
  status: PublicationStatus;
  reviewStatus: ReviewStatus;
};

export type SectionState = "empty" | "draft" | "in_review" | "changes_requested" | "approved";

export function sectionState(s: SectionVersion | undefined): SectionState {
  if (!s) return "empty";
  if (s.reviewStatus === "approved") return "approved";
  if (s.reviewStatus === "rejected") return "changes_requested";
  if (s.status === "in_review") return "in_review";
  return "draft";
}

export const SECTION_STATE_LABEL: Record<SectionState, string> = {
  empty: "Not started",
  draft: "Draft",
  in_review: "Waiting for review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

/** Latest version per pillar from a flat list of section rows. */
export function latestByType<T extends SectionVersion>(rows: T[]): Map<PillarType, T> {
  const out = new Map<PillarType, T>();
  for (const r of rows) {
    const cur = out.get(r.sectionType);
    if (!cur || r.version > cur.version) out.set(r.sectionType, r);
  }
  return out;
}

/** Highest approved version per pillar: what customers see. */
export function approvedByType<T extends SectionVersion>(rows: T[]): Map<PillarType, T> {
  return latestByType(rows.filter((r) => r.reviewStatus === "approved" && r.status === "published"));
}

/**
 * How to store an edit to a section.
 * - No section yet → create version 1.
 * - Latest is approved → create the next version (the approved one stays live).
 * - Otherwise → update the latest version in place and send it back to draft.
 */
export function planEdit(latest: SectionVersion | undefined): { kind: "insert"; version: number } | { kind: "update"; version: number } {
  if (!latest) return { kind: "insert", version: 1 };
  if (latest.reviewStatus === "approved") return { kind: "insert", version: latest.version + 1 };
  return { kind: "update", version: latest.version };
}

/** AI drafts only fill sections that aren't approved or waiting for review, so they never overwrite an expert's work. */
export function aiMayDraft(latest: SectionVersion | undefined): boolean {
  const state = sectionState(latest);
  return state === "empty" || state === "draft" || state === "changes_requested";
}

export function canSubmit(latest: SectionVersion | undefined): boolean {
  const state = sectionState(latest);
  return state === "draft" || state === "changes_requested";
}

export function canReview(latest: SectionVersion | undefined): boolean {
  return sectionState(latest) === "in_review";
}

export type Readiness = { ready: boolean; missing: string[] };

/** `approvedCareTasks` is checked when given: members need at least one approved care task to follow. */
export function publishReadiness(rows: SectionVersion[], sourceCount: number, approvedCareTasks?: number): Readiness {
  const approved = approvedByType(rows);
  const missing: string[] = PILLARS.filter((p) => !approved.has(p.type)).map((p) => `"${p.label}" needs an approved version`);
  if (sourceCount < 1) missing.push("Add at least one source");
  if (approvedCareTasks !== undefined && approvedCareTasks < 1) missing.push("Approve at least one care task");
  return { ready: missing.length === 0, missing };
}

// ── Roles ──────────────────────────────────────────────────────

export type AdminRole = "super_admin" | "content_admin" | "commerce_admin" | "support_admin" | "plant_expert";

/** Who can write and edit plant content (including asking AI for a draft). */
export function canEditPlants(roles: AdminRole[]): boolean {
  return roles.some((r) => r === "super_admin" || r === "content_admin");
}

/** Who can approve plant content. */
export function canApprovePlants(roles: AdminRole[]): boolean {
  return roles.some((r) => r === "super_admin" || r === "plant_expert");
}

/** Who can publish or unpublish a plant. */
export function canPublishPlants(roles: AdminRole[]): boolean {
  return roles.some((r) => r === "super_admin" || r === "content_admin");
}

/** Anyone with plant duties may open the plant library. */
export function canOpenPlantLibrary(roles: AdminRole[]): boolean {
  return canEditPlants(roles) || canApprovePlants(roles);
}
