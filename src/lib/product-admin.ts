import type { AdminRole } from "@/lib/plant-workflow";

/**
 * Shop admin rules. Pure functions, no database access.
 * Owner decisions: customers pay the admin-listed price; AI never sets prices;
 * Loamy uses its own product photos.
 */

/** Who can manage shop items, prices and stock. */
export function canManageShop(roles: AdminRole[]): boolean {
  return roles.some((r) => r === "super_admin" || r === "commerce_admin");
}

export const MAX_PRICE_NAIRA = 5_000_000;

/**
 * Reads a naira amount typed by an admin ("12500", "12,500", "₦12,500.50") into kobo.
 * Returns null if it isn't a sensible price.
 */
export function parseNairaInput(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, "").replace(/^NGN/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const naira = Number(cleaned);
  if (!Number.isFinite(naira) || naira <= 0 || naira > MAX_PRICE_NAIRA) return null;
  return Math.round(naira * 100);
}

export function koboToInput(kobo: number): string {
  if (kobo <= 0) return "";
  return kobo % 100 === 0 ? String(kobo / 100) : (kobo / 100).toFixed(2);
}

export type ProductReadinessInput = { priceMinor: number; description: string; imageCount: number };

/** A shop item goes live only with a real price, a description and at least one photo. */
export function productReadiness(p: ProductReadinessInput): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (p.priceMinor <= 0) missing.push("Set a price");
  if (p.description.trim().length < 20) missing.push("Write a description (at least a sentence)");
  if (p.imageCount < 1) missing.push("Add at least one photo");
  return { ready: missing.length === 0, missing };
}

export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Photo quality rules (owner decision). Shop cards and product pages show photos square,
 * so photos must be close to square and big enough to stay sharp on high-resolution phones.
 */
export const PHOTO_RULES = {
  minSide: 1200,
  recommended: 1600,
  maxSide: 6000,
  /** width ÷ height must sit between these: 4:5 portrait to 5:4 landscape. */
  minRatio: 0.8,
  maxRatio: 1.25,
} as const;

export function checkImage(file: { type: string; size: number }): string | null {
  if (!(file.type in IMAGE_TYPES)) return "Use a JPG, PNG or WebP photo. iPhone HEIC photos need converting to JPG first.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_IMAGE_BYTES) return "That photo is over 10 MB. Export it smaller (about 2000 pixels wide is plenty).";
  return null;
}

/** Returns a plain-English problem with the photo's size or shape, or null if it's good. */
export function checkDimensions(width: number, height: number): string | null {
  const { minSide, maxSide, minRatio, maxRatio, recommended } = PHOTO_RULES;
  if (!width || !height) return "We couldn't read the photo's size. Try exporting it again as JPG.";
  if (Math.min(width, height) < minSide)
    return `This photo is ${width} × ${height} pixels, which is too small to look sharp. Use at least ${minSide} × ${minSide} (${recommended} × ${recommended} is best).`;
  if (Math.max(width, height) > maxSide) return `This photo is ${width} × ${height} pixels, which is larger than needed. Resize it to about ${recommended} × ${recommended}.`;
  const ratio = width / height;
  if (ratio < minRatio || ratio > maxRatio)
    return `This photo is ${width} × ${height} pixels, which is too ${ratio > 1 ? "wide" : "tall"}. The shop shows photos square, so crop it to a square (${recommended} × ${recommended} is best).`;
  return null;
}

/** Storage path for a product photo. Random so it can't be guessed or collide. */
export function productImagePath(productId: string, type: keyof typeof IMAGE_TYPES, random: string): string {
  return `products/${productId}/${random}.${IMAGE_TYPES[type]}`;
}

export const PRODUCT_IMAGE_BUCKET = "product-images";

export function publicImageUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${storagePath}`;
}

/** URL-safe slug from a product name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
