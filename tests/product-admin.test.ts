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
  it("accepts JPG, PNG and WebP up to 10 MB", () => {
    expect(checkImage({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(checkImage({ type: "image/gif", size: 1000 })).toMatch(/JPG/);
    expect(checkImage({ type: "image/png", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
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

describe("photo size rules", () => {
  it("accepts square photos of at least 1200 pixels", async () => {
    const { checkDimensions } = await import("@/lib/product-admin");
    expect(checkDimensions(1600, 1600)).toBeNull();
    expect(checkDimensions(1200, 1200)).toBeNull();
    expect(checkDimensions(1600, 2000)).toBeNull(); // 4:5 portrait is fine
  });
  it("explains what's wrong in plain words", async () => {
    const { checkDimensions } = await import("@/lib/product-admin");
    expect(checkDimensions(800, 800)).toMatch(/too small.*at least 1200 × 1200/);
    expect(checkDimensions(3000, 1500)).toMatch(/too wide.*square/);
    expect(checkDimensions(1500, 3000)).toMatch(/too tall/);
    expect(checkDimensions(8000, 8000)).toMatch(/larger than needed/);
    expect(checkDimensions(0, 0)).toMatch(/couldn't read/);
  });
  it("reads real pixel sizes from the file", async () => {
    const { imageSize } = await import("image-size");
    // Minimal PNG header: signature + IHDR chunk for a 1600 × 1200 image.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0x06, 0x40, 0, 0, 0x04, 0xb0, 8, 2, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(imageSize(png)).toMatchObject({ width: 1600, height: 1200, type: "png" });
  });
});
