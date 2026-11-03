"use client";

/* eslint-disable @next/next/no-img-element -- local preview of a file the admin just picked */
import { useEffect, useState } from "react";
import { checkDimensions, checkImage, PHOTO_RULES } from "@/lib/product-admin";

/**
 * File input with an instant preview and size check, so admins see a problem before uploading.
 * The server checks again; this is for speed and clarity.
 */
export function PhotoPicker({ name = "photo", submitId }: { name?: string; submitId: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const btn = document.getElementById(submitId) as HTMLButtonElement | null;
    if (btn) btn.disabled = !info?.ok;
  }, [info, submitId]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setInfo(null);
    setPreview(null);
    if (!file) return;
    const typeProblem = checkImage(file);
    if (typeProblem) return setInfo({ ok: false, text: typeProblem });
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Browsers apply the camera's rotation, so these are the dimensions people will see.
      const problem = checkDimensions(img.naturalWidth, img.naturalHeight);
      setPreview(url);
      setInfo(problem ? { ok: false, text: problem } : { ok: true, text: `${img.naturalWidth} × ${img.naturalHeight} pixels. Good to go.` });
    };
    img.onerror = () => setInfo({ ok: false, text: "We couldn't open that photo. Export it again as JPG." });
    img.src = url;
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="field-photo" className="text-small font-semibold">Photo</label>
      <input id="field-photo" name={name} type="file" accept="image/jpeg,image/png,image/webp" required onChange={onChange} className="text-small" aria-describedby="photo-rules photo-check" />
      <p id="photo-rules" className="text-xs text-ink-muted">
        Square, at least {PHOTO_RULES.minSide} × {PHOTO_RULES.minSide} pixels ({PHOTO_RULES.recommended} × {PHOTO_RULES.recommended} is best). JPG, PNG or WebP, up to 10 MB.
      </p>
      {preview ? <img src={preview} alt="" className="h-24 w-24 rounded-xl bg-card object-cover" /> : null}
      <p id="photo-check" role="status" aria-live="polite" className={info ? (info.ok ? "text-xs font-semibold text-leaf-ink" : "text-xs font-semibold text-danger-ink") : "sr-only"}>
        {info?.text ?? ""}
      </p>
    </div>
  );
}
