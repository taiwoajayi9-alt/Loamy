"use client";

import { useState } from "react";
import { Button, FormNotice, Tag } from "@/components/ui";
import { checkImage } from "@/lib/product-admin";
import { checkPhotoSize, matchPlantFile, PLANT_PHOTO_RULES } from "@/lib/photos";
import { bulkPlantPhotoAction } from "./actions";

type Plant = { id: string; slug: string; commonName: string; localNames: string[]; photos: number };
type Row = { file: File; plant: Plant | null; problem: string | null; status: "ready" | "uploading" | "done" | "failed" | "skipped"; message?: string; preview: string };

function readSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}

export function BulkUploader({ plants }: { plants: Plant[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cover, setCover] = useState(true);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 60);
    const next: Row[] = [];
    for (const file of files) {
      const preview = URL.createObjectURL(file);
      const plantId = matchPlantFile(file.name, plants);
      const plant = plants.find((p) => p.id === plantId) ?? null;
      let problem = checkImage(file);
      if (!problem) {
        const { w, h } = await readSize(preview);
        problem = checkPhotoSize(w, h, PLANT_PHOTO_RULES);
      }
      if (!plant) problem = problem ?? "No plant matches this file name. Rename it, e.g. scent-leaf.png.";
      next.push({ file, plant, problem, status: problem ? "skipped" : "ready", preview });
    }
    setRows(next);
  }

  async function upload() {
    setBusy(true);
    const coveredOnce = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status !== "ready" || !r.plant) continue;
      setRows((cur) => cur.map((x, j) => (j === i ? { ...x, status: "uploading" } : x)));
      const fd = new FormData();
      fd.set("plantId", r.plant.id);
      fd.set("photo", r.file);
      fd.set("altText", `${r.plant.commonName} growing in a Lagos home garden`);
      // Only the first new photo of each plant becomes the cover.
      if (cover && !coveredOnce.has(r.plant.id)) {
        fd.set("cover", "1");
        coveredOnce.add(r.plant.id);
      }
      const res = await bulkPlantPhotoAction(fd).catch(() => ({ ok: false, message: "Network problem. Try again." }));
      setRows((cur) => cur.map((x, j) => (j === i ? { ...x, status: res.ok ? "done" : "failed", message: res.message } : x)));
    }
    setBusy(false);
  }

  const ready = rows.filter((r) => r.status === "ready").length;
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 rounded-card border border-dashed border-line-strong bg-card p-6 text-center">
        <span className="font-semibold">Choose photos</span>
        <span className="text-small text-ink-muted">Select up to 60 at once. Name each file after its plant, e.g. scent-leaf.png, ata-rodo.png, ugu-2.png.</span>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={busy} className="mx-auto text-small" />
      </label>

      {rows.length ? (
        <>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} className="h-4 w-4 accent-[#0A0A0A]" />
            Make the new photo each plant’s cover
          </label>
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.preview} alt="" className="h-14 w-14 flex-none rounded-xl bg-chip object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small font-semibold">{r.plant ? r.plant.commonName : r.file.name}</p>
                  <p className="truncate text-xs text-ink-muted">{r.problem ?? r.message ?? r.file.name}</p>
                </div>
                <Tag tone={r.status === "done" ? "leaf" : r.status === "failed" || r.status === "skipped" ? "peach" : r.status === "uploading" ? "lemon" : "grey"}>
                  {r.status === "ready" ? "Ready" : r.status === "uploading" ? "Uploading…" : r.status === "done" ? "Done" : r.status === "failed" ? "Failed" : "Skipped"}
                </Tag>
              </li>
            ))}
          </ul>
          {done || failed ? (
            <FormNotice tone={failed ? "error" : "success"}>
              {done} uploaded{failed ? `, ${failed} failed. Fix those and choose them again.` : ". They’re now on the plants’ pages."}
            </FormNotice>
          ) : null}
          <Button onClick={upload} disabled={busy || !ready} aria-busy={busy}>
            {busy ? "Uploading…" : `Upload ${ready} photo${ready === 1 ? "" : "s"}`}
          </Button>
        </>
      ) : null}
    </div>
  );
}
