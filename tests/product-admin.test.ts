import { describe, expect, it } from "vitest";
import { canManageShop, checkImage, koboToInput, parseNairaInput, productImagePath, productReadiness, publicImageUrl, slugify } from "@/lib/product-admin";

describe("prices typed by admins", () => {
  it("reads naira in common formats into kobo", () => {
    expect(parseNairaInput("12500")).toBe(1_250_000);
    expect(parseNairaInput("12,500")).toBe(1_250_000);
    expect(parseNairaInput("₦ 12,500.50")).toBe(1_250_050);
    expect(parseNairaInput("NGN4000")).toBe(400_000);
  });
  it("refuses zero, negatives, text and silly amounts", () => {
    for (const bad of ["", "0", "-500", "abc", "12.345", "99999999"]) expect(parseNairaInput(bad)).toBeNull();
  });
  it("round-trips for the edit form", () => {
    expect(koboToInput(1_250_000)).toBe("12500");
    expect(koboToInput(1_250_050)).toBe("12500.50");
    expect(koboToInput(0)).toBe("");
  });
});

describe("publishing shop items", () => {
  it("needs a price, description and photo", () => {
    expect(productReadiness({ priceMinor: 0, description: "", imageCount: 0 }).missing).toHaveLength(3);
    expect(productReadiness({ priceMinor: 100, description: "Seven small tools for pots.", imageCount: 1 })).toEqual({ ready: true, missing: [] });
  });
  it("only commerce and super admins manage the shop", () => {
    expect(canManageShop(["commerce_admin"])).toBe(true);
    expect(canManageShop(["super_admin"])).toBe(true);
    expect(canManageShop(["content_admin", "plant_expert"])).toBe(false);
  });
});

describe("photos", () => {
  it("accepts JPG, PNG and WebP up to 5 MB", () => {
    expect(checkImage({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(checkImage({ type: "image/gif", size: 1000 })).toMatch(/JPG/);
    expect(checkImage({ type: "image/png", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(checkImage({ type: "image/webp", size: 0 })).toMatch(/empty/);
  });
  it("builds storage paths and public URLs", () => {
    expect(productImagePath("p1", "image/webp", "abc")).toBe("products/p1/abc.webp");
    expect(publicImageUrl("https://x.supabase.co/", "products/p1/abc.webp")).toBe("https://x.supabase.co/storage/v1/object/public/product-images/products/p1/abc.webp");
  });
  it("slugs names safely", () => {
    expect(slugify("Nursery pots, 1 gallon (10)")).toBe("nursery-pots-1-gallon-10");
    expect(slugify("Café crème")).toBe("cafe-creme");
  });
});
