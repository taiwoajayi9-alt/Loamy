import { describe, expect, it } from "vitest";
import { requiresSignIn, requiresSubscription, safeNextPath } from "@/lib/routes";

describe("route access", () => {
  it.each(["/", "/discover", "/plants/sweet-basil", "/grow/sweet-basil", "/shop", "/cart", "/login", "/terms", "/privacy"])(
    "%s is public",
    (path) => expect(requiresSignIn(path)).toBe(false),
  );

  it.each(["/profile", "/profile/privacy", "/subscribe", "/checkout", "/orders/abc", "/garden", "/ask-loamy", "/admin/plants", "/admin/team"])(
    "%s needs sign-in",
    (path) => expect(requiresSignIn(path)).toBe(true),
  );

  it("garden and Ask Loamy need a subscription; the shop never does", () => {
    expect(requiresSubscription("/garden")).toBe(true);
    expect(requiresSubscription("/ask-loamy")).toBe(true);
    expect(requiresSubscription("/shop")).toBe(false);
  });

  it("does not treat look-alike prefixes as protected", () => {
    expect(requiresSignIn("/gardening-tips")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => expect(safeNextPath("/garden?x=1")).toBe("/garden?x=1"));
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined])(
    "rejects %s",
    (value) => expect(safeNextPath(value as string | null | undefined)).toBe("/discover"),
  );
});
