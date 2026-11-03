import { describe, expect, it } from "vitest";
import { formatNaira, nairaToKobo } from "@/lib/money";

describe("money", () => {
  it("formats the confirmed subscription prices", () => {
    expect(formatNaira(1_500_000)).toBe("₦15,000");
    expect(formatNaira(5_000_000)).toBe("₦50,000");
  });

  it("shows kobo only when present", () => {
    expect(formatNaira(1_234_550)).toBe("₦12,345.50");
  });

  it("refuses non-integer kobo", () => {
    expect(() => formatNaira(10.5)).toThrow();
  });

  it("converts naira to kobo without float drift", () => {
    expect(nairaToKobo(15_000)).toBe(1_500_000);
    expect(nairaToKobo(19.99)).toBe(1999);
  });
});
