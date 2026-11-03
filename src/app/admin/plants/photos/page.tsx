import Link from "next/link";
import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { FormNotice } from "@/components/ui";
import { db } from "@/db/client";
import { plantImages, plants } from "@/db/schema";
import { canEditPlants } from "@/lib/plant-workflow";
import { requirePlantLibrary } from "@/server/plant-admin";
import { storageConfigured } from "@/server/storage";
import { BulkUploader } from "./bulk-uploader";

export const metadata: Metadata = { title: "Upload plant photos" };
export const dynamic = "force-dynamic";

export default async function BulkPhotos() {
  const actor = await requirePlantLibrary("/admin/plants/photos");
  const list = await db
    .select({
      id: plants.id,
      slug: plants.slug,
      commonName: plants.commonName,
      localNames: plants.localNames,
      photos: sql<number>`(select count(*) from ${plantImages} where ${plantImages.plantId} = ${plants.id})`.mapWith(Number),
    })
    .from(plants)
    .where(eq(plants.isSample, false))
    .orderBy(asc(plants.commonName));
  const missing = list.filter((p) => !p.photos);

  return (
    <>
      <Link href="/admin/plants" className="text-small font-semibold text-ink-muted hover:underline">← Plant library</Link>
      <h1 className="text-title">Upload plant photos</h1>
      <p className="text-ink-muted">
        Add photos for many plants at once. Each file is matched to a plant by its name and checked before upload: at least 1,000 pixels on the shorter side, between portrait 2:3 and landscape 3:2.
      </p>
      {missing.length ? (
        <p className="text-small">
          <span className="font-semibold">Still need a photo ({missing.length}):</span> {missing.map((p) => `${p.slug}.png`).join(", ")}
        </p>
      ) : (
        <FormNotice tone="success">Every plant has at least one photo.</FormNotice>
      )}
      {!canEditPlants(actor.roles) ? (
        <FormNotice tone="error">You don’t have permission to edit plants.</FormNotice>
      ) : !storageConfigured() ? (
        <FormNotice tone="error">Photo uploads are off. Add SUPABASE_SECRET_KEY to your settings.</FormNotice>
      ) : (
        <BulkUploader plants={list} />
      )}
    </>
  );
}
