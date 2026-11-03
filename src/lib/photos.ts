/**
 * Photo rules and storage locations shared by admin and member uploads. Pure.
 * Plant and product photos are public (shown to everyone); members' garden photos are private.
 */
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "./product-admin";

export const BUCKETS = {
  products: "product-images",
  plants: "plant-images",
  garden: "garden-photos",
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

export type PhotoRules = { minSide: number; recommended: string; maxSide: number; minRatio: number; maxRatio: number; shapeHint: string };

/** Plant profile photos: shown wide on the plant page and tall on Discover cards, so allow 3:4 to 3:2. */
export const PLANT_PHOTO_RULES: PhotoRules = { minSide: 1000, recommended: "1536 × 1024 or larger", maxSide: 6000, minRatio: 0.66, maxRatio: 1.5, shapeHint: "between portrait 2:3 and landscape 3:2" };

/**
 * Matches a bulk-uploaded file name to a plant: "scent-leaf.png", "Scent leaf 2.jpg", "ugu (1).webp",
 * "efirin.jpg" (local name). Returns the plant id or null.
 */
export function matchPlantFile(fileName: string, plants: { id: string; slug: string; commonName: string; localNames: string[] }[]): string | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/\(\d+\)/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-(\d{1,2})$/, "")
      .replace(/^-+|-+$/g, "");
  const key = norm(fileName);
  for (const p of plants) {
    const names = [p.slug, p.commonName, ...p.localNames].map(norm);
    if (names.includes(key)) return p.id;
  }
  return null;
}

/** Members' own photos: any sensible phone photo. */
export const GARDEN_PHOTO_RULES: PhotoRules = { minSide: 400, recommended: "any phone photo", maxSide: 8000, minRatio: 0.33, maxRatio: 3, shapeHint: "not a very thin strip" };

export function checkPhotoSize(width: number, height: number, r: PhotoRules): string | null {
  if (!width || !height) return "We couldn't read the photo's size. Try exporting it again as JPG.";
  if (Math.min(width, height) < r.minSide)
    return `This photo is ${width} × ${height} pixels, which is too small to look sharp. Use at least ${r.minSide} pixels on the shorter side.`;
  if (Math.max(width, height) > r.maxSide) return `This photo is ${width} × ${height} pixels, which is larger than needed. Resize it to about ${r.recommended}.`;
  const ratio = width / height;
  if (ratio < r.minRatio || ratio > r.maxRatio) return `This photo is ${width} × ${height} pixels. Crop it so the shape is ${r.shapeHint}.`;
  return null;
}

export function publicUrl(supabaseUrl: string, bucket: Bucket, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`;
}

export function photoPath(prefix: string, type: keyof typeof IMAGE_TYPES, random: string): string {
  return `${prefix}/${random}.${IMAGE_TYPES[type]}`;
}

export { IMAGE_TYPES, MAX_IMAGE_BYTES };
