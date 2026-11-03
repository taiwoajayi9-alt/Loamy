import { describe, expect, it } from "vitest";
import { likeTerm } from "@/lib/search";

describe("likeTerm", () => {
  it("wraps and trims", () => expect(likeTerm("  basil ")).toBe("%basil%"));
  it("escapes wildcards", () => expect(likeTerm("50%_off\\")).toBe("%50\\%\\_off\\\\%"));
  it("caps length", () => expect(likeTerm("a".repeat(100)).length).toBe(66));
});
