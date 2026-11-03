import "server-only";
import { createClient } from "@supabase/supabase-js";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/product-admin";

/** True when photo uploads can work (needs the server-only Supabase secret key). */
export function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function adminStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Photo uploads are off. SUPABASE_SECRET_KEY is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(PRODUCT_IMAGE_BUCKET);
}

export async function uploadProductImage(path: string, file: File): Promise<void> {
  const { error } = await adminStorage().upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function deleteProductImage(path: string): Promise<void> {
  const { error } = await adminStorage().remove([path]);
  if (error) console.error("[storage] delete failed", path, error.message);
}
