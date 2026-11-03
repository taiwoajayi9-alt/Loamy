import { describe, expect, it } from "vitest";
import { canHandlePrivacy, canManageTeam, removalProblem, ROLE_INFO, ROLES } from "@/lib/team";

describe("team roles", () => {
  it("only owners manage the team", () => {
    expect(canManageTeam(["super_admin"])).toBe(true);
    expect(canManageTeam(["plant_expert", "commerce_admin", "support_admin", "content_admin"])).toBe(false);
  });

  it("owners and support handle privacy requests", () => {
    expect(canHandlePrivacy(["support_admin"])).toBe(true);
    expect(canHandlePrivacy(["super_admin"])).toBe(true);
    expect(canHandlePrivacy(["plant_expert"])).toBe(false);
  });

  it("never removes the last owner", () => {
    expect(removalProblem("super_admin", 1)).toMatch(/at least one owner/);
    expect(removalProblem("super_admin", 2)).toBeNull();
    expect(removalProblem("plant_expert", 1)).toBeNull();
  });

  it("describes every role", () => {
    for (const r of ROLES) expect(ROLE_INFO[r].label.length).toBeGreaterThan(3);
  });
});
