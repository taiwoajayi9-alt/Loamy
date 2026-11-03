import { describe, expect, it } from "vitest";
import {
  aiMayDraft,
  approvedByType,
  canApprovePlants,
  canEditPlants,
  canReview,
  canSubmit,
  latestByType,
  PILLARS,
  planEdit,
  publishReadiness,
  sectionState,
  type SectionVersion,
} from "@/lib/plant-workflow";

const v = (sectionType: SectionVersion["sectionType"], version: number, status: SectionVersion["status"], reviewStatus: SectionVersion["reviewStatus"]): SectionVersion => ({
  sectionType,
  version,
  status,
  reviewStatus,
});

describe("section states", () => {
  it("reads the state from status and review", () => {
    expect(sectionState(undefined)).toBe("empty");
    expect(sectionState(v("meet", 1, "draft", "pending"))).toBe("draft");
    expect(sectionState(v("meet", 1, "in_review", "pending"))).toBe("in_review");
    expect(sectionState(v("meet", 1, "draft", "rejected"))).toBe("changes_requested");
    expect(sectionState(v("meet", 1, "published", "approved"))).toBe("approved");
  });

  it("only drafts can be submitted and only items in review can be reviewed", () => {
    expect(canSubmit(v("meet", 1, "draft", "pending"))).toBe(true);
    expect(canSubmit(v("meet", 1, "draft", "rejected"))).toBe(true);
    expect(canSubmit(v("meet", 1, "in_review", "pending"))).toBe(false);
    expect(canSubmit(undefined)).toBe(false);
    expect(canReview(v("meet", 1, "in_review", "pending"))).toBe(true);
    expect(canReview(v("meet", 1, "draft", "pending"))).toBe(false);
  });
});

describe("editing", () => {
  it("creates version 1, edits drafts in place, and versions approved text", () => {
    expect(planEdit(undefined)).toEqual({ kind: "insert", version: 1 });
    expect(planEdit(v("meet", 2, "draft", "pending"))).toEqual({ kind: "update", version: 2 });
    expect(planEdit(v("meet", 2, "in_review", "pending"))).toEqual({ kind: "update", version: 2 });
    expect(planEdit(v("meet", 2, "published", "approved"))).toEqual({ kind: "insert", version: 3 });
  });

  it("AI never overwrites approved text or text waiting for review", () => {
    expect(aiMayDraft(undefined)).toBe(true);
    expect(aiMayDraft(v("meet", 1, "draft", "pending"))).toBe(true);
    expect(aiMayDraft(v("meet", 1, "draft", "rejected"))).toBe(true);
    expect(aiMayDraft(v("meet", 1, "in_review", "pending"))).toBe(false);
    expect(aiMayDraft(v("meet", 1, "published", "approved"))).toBe(false);
  });
});

describe("what customers see", () => {
  it("shows the newest approved version, not a newer draft", () => {
    const rows = [v("meet", 1, "published", "approved"), v("meet", 2, "draft", "pending")];
    expect(latestByType(rows).get("meet")?.version).toBe(2);
    expect(approvedByType(rows).get("meet")?.version).toBe(1);
  });

  it("ignores archived approvals", () => {
    const rows = [v("meet", 1, "archived", "approved"), v("meet", 2, "published", "approved")];
    expect(approvedByType(rows).get("meet")?.version).toBe(2);
  });
});

describe("publishing", () => {
  const allApproved = PILLARS.map((p) => v(p.type, 1, "published", "approved"));

  it("needs all six sections approved and a source", () => {
    expect(publishReadiness(allApproved, 1)).toEqual({ ready: true, missing: [] });
    expect(publishReadiness(allApproved, 0).ready).toBe(false);
    const fiveAndADraft = [...allApproved.slice(1), v("meet", 1, "in_review", "pending")];
    const r = publishReadiness(fiveAndADraft, 2);
    expect(r.ready).toBe(false);
    expect(r.missing[0]).toContain("Meet the plant");
  });
});

describe("roles", () => {
  it("separates writing from approving", () => {
    expect(canEditPlants(["content_admin"])).toBe(true);
    expect(canApprovePlants(["content_admin"])).toBe(false);
    expect(canApprovePlants(["plant_expert"])).toBe(true);
    expect(canEditPlants(["plant_expert"])).toBe(false);
    expect(canEditPlants(["commerce_admin"])).toBe(false);
    expect(canApprovePlants(["super_admin"]) && canEditPlants(["super_admin"])).toBe(true);
  });
});
