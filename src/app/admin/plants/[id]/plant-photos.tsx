/* eslint-disable @next/next/no-img-element -- admin thumbnails come straight from Supabase Storage */
import { PhotoPicker } from "@/components/photo-picker";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormNotice, Tag } from "@/components/ui";
import { BUCKETS, publicUrl } from "@/lib/photos";
import { addPlantImageAction, plantImageAction } from "./actions";

type Img = { id: string; storagePath: string; altText: string; caption: string | null };

export function PlantPhotos({ plantId, images, mayEdit, uploadsOn }: { plantId: string; images: Img[]; mayEdit: boolean; uploadsOn: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2" id="photos" style={{ scrollMarginTop: 80 }}>
        <h2 className="text-lg font-semibold">Photos</h2>
        <Tag tone={images.length ? "leaf" : "peach"}>{images.length ? `${images.length} photo${images.length === 1 ? "" : "s"}` : "No photo yet"}</Tag>
      </div>
      <p className="text-small text-ink-muted">
        Real plants in daylight, ideally growing in a Lagos home. Use photos you took or have the rights to. The first photo is the cover on Discover and the plant page.
      </p>
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.id} className="flex flex-col gap-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-chip">
                <img src={publicUrl(url, BUCKETS.plants, img.storagePath)} alt={img.altText} className="h-full w-full object-cover" />
                {i === 0 ? <Tag tone="dark" className="absolute left-2 top-2">Cover</Tag> : null}
              </div>
              <p className="text-xs text-ink-muted">{img.altText}{img.caption ? ` · ${img.caption}` : ""}</p>
              {mayEdit ? (
                <div className="flex gap-3">
                  {i > 0 ? (
                    <form action={plantImageAction}>
                      <input type="hidden" name="plantId" value={plantId} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <input type="hidden" name="op" value="cover" />
                      <button type="submit" className="text-xs font-semibold underline">Make cover</button>
                    </form>
                  ) : null}
                  <form action={plantImageAction}>
                    <input type="hidden" name="plantId" value={plantId} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <input type="hidden" name="op" value="remove" />
                    <button type="submit" className="text-xs font-semibold text-danger-ink underline">Remove</button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {mayEdit ? (
        uploadsOn ? (
          <form action={addPlantImageAction} className="grid gap-3 rounded-2xl bg-chip p-4 sm:grid-cols-2 sm:items-end">
            <input type="hidden" name="plantId" value={plantId} />
            <PhotoPicker submitId="upload-plant-photo" kind="plant" />
            <div className="flex flex-col gap-3">
              <Field label="Describe the photo" name="altText" id="plant-alt" required placeholder="e.g. Scent leaf growing in a pot on a balcony" />
              <Field label="Caption (optional)" name="caption" id="plant-caption" placeholder="e.g. About 6 weeks after planting" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton id="upload-plant-photo" variant="secondary" pendingLabel="Uploading…">Upload photo</SubmitButton>
            </div>
          </form>
        ) : (
          <FormNotice tone="error">Photo uploads are off. Add SUPABASE_SECRET_KEY to your settings (run bash scripts/setup-env.sh).</FormNotice>
        )
      ) : null}
    </Card>
  );
}
