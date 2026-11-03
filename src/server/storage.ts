import "server-only";
import { createClient } from "@supabase/supabase-js";
import { imageSize } from "image-size";
import { checkImage, type IMAGE_TYPES } from "@/lib/product-admin";
import { BUCKETS, checkPhotoSize, type Bucket, type PhotoRules } from "@/lib/photos";

/** True when photo uploads can work (needs the server-only Supabase secret key). */
export function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function storage(bucket: Bucket) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Photo uploads are off. SUPABASE_SECRET_KEY is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(bucket);
}

export async function uploadTo(bucket: Bucket, path: string, file: File, privateFile = false): Promise<void> {
  const { error } = await storage(bucket).upload(path, file, { contentType: file.type, upsert: false, cacheControl: privateFile ? "3600" : "31536000" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function removeFrom(bucket: Bucket, path: string): Promise<void> {
  const { error } = await storage(bucket).remove([path]);
  if (error) console.error("[storage] delete failed", bucket, path, error.message);
}

/** Time-limited links to private photos (members' garden photos). */
export async function signedUrls(bucket: Bucket, paths: string[], seconds = 3600): Promise<Map<string, string>> {
  if (!paths.length || !storageConfigured()) return new Map();
  const { data, error } = await storage(bucket).createSignedUrls(paths, seconds);
  if (error || !data) {
    console.error("[storage] signed urls failed", error?.message);
    return new Map();
  }
  return new Map(data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as [string, string]] : [])));
}

// Kept for product admin code.
export const uploadProductImage = (path: string, file: File) => uploadTo(BUCKETS.products, path, file);
export const deleteProductImage = (path: string) => removeFrom(BUCKETS.products, path);

const TYPE_NAMES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** Validates type, size and real pixel dimensions of an uploaded photo. Returns a plain-English problem or null. */
export async function inspectPhoto(file: File, rules: PhotoRules): Promise<string | null> {
  const basic = checkImage(file);
  if (basic) return basic;
  let dims: { width?: number; height?: number; type?: string; orientation?: number };
  try {
    dims = imageSize(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return "That file isn't a photo we can read. Export it again as JPG.";
  }
  if (dims.type !== TYPE_NAMES[file.type as keyof typeof IMAGE_TYPES]) return "The file type doesn't match its contents. Export it again as JPG.";
  const sideways = (dims.orientation ?? 1) >= 5;
  return checkPhotoSize(sideways ? dims.height ?? 0 : dims.width ?? 0, sideways ? dims.width ?? 0 : dims.height ?? 0, rules);
}
