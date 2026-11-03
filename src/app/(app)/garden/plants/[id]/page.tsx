/* eslint-disable @next/next/no-img-element -- private photos are shown through signed links */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { CareTaskCard } from "@/components/care-task";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormNotice, HeroCard, Icon, Page, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { daysBetween, HARVEST_UNITS, lagosDay, MILESTONES, TASK_TYPES, taskTypeLabel } from "@/lib/care";
import { requireEntitlement } from "@/server/auth";
import { getGardenPlant } from "@/server/garden";
import { startKit } from "@/server/start-kit";
import { StartKitCard } from "@/components/start-kit";
import { PhotoPicker } from "@/components/photo-picker";
import { storageConfigured } from "@/server/storage";
import { archivePlantAction, gardenPhotoAction, plantedAction, plantRecordAction } from "../../actions";

export const metadata: Metadata = { title: "Your plant" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
const fmtDay = (day: string) => fmt.format(new Date(`${day}T12:00:00+01:00`));
const input = "min-h-[50px] w-full rounded-2xl border border-line-strong bg-card px-4 text-[15px]";

function Hidden({ id, kind }: { id: string; kind: string }) {
  return (
    <>
      <input type="hidden" name="gardenPlantId" value={id} />
      <input type="hidden" name="kind" value={kind} />
    </>
  );
}

export default async function GardenPlantPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireEntitlement(`/garden/plants/${id}`, "my_garden");
  const { notice, error } = await searchParams;
  const data = await getGardenPlant(user.id, id);
  if (!data) notFound();
  const { gp, plant, tasks, stages, activities, milestones, harvests, photos } = data;
  const name = gp.nickname || plant.commonName;
  const today = lagosDay(new Date());
  const age = gp.plantingDate ? daysBetween(gp.plantingDate, today) : null;
  const currentIdx = stages.findIndex((s) => s.id === gp.growthStageId);
  const active = gp.status === "active";
  const gettingReady = active && !gp.plantingDate;
  const kit = gettingReady ? await startKit(plant.id, plant.slug, plant.commonName, gp.growingMethod) : null;
  const back = `/garden/plants/${id}`;

  return (
    <Page className="pb-nav-clearance">
      <Link href="/garden" className="flex items-center gap-1.5 self-start text-small font-semibold">
        <Icon name="back" size={18} /> My Garden
      </Link>
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <HeroCard className="gap-3 px-[22px] py-6">
        <div className="flex items-center justify-between gap-2">
          <Tag tone="lemon">{gettingReady ? "Getting ready" : active ? (stages[currentIdx]?.name ?? "Growing") : gp.status === "completed" ? "Finished" : "Archived"}</Tag>
          <Link href={`/plants/${plant.slug}`} className="text-small font-semibold text-ink-on-black underline decoration-lemon underline-offset-4">About {plant.commonName.toLowerCase()}</Link>
        </div>
        <h1 className="text-title">{name}</h1>
        {gettingReady ? (
          <p className="text-ink-on-black">Get your {plant.commonName.toLowerCase()} and a pot ready. Your care plan starts the day you plant it.</p>
        ) : (
          <div className="flex items-baseline gap-2.5">
            <span className="text-big tabular-nums">{age ?? "—"}</span>
            <span className="text-ink-on-black">{age === 1 ? "day" : "days"} growing{gp.plantingDate ? ` · planted ${fmtDay(gp.plantingDate)}` : ""}</span>
          </div>
        )}
      </HeroCard>

      {active ? (
        <Link href={`/ask-loamy?plant=${id}`} className="flex items-center gap-3 rounded-card border border-line bg-card p-4 hover:border-line-strong">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-lilac"><Icon name="chat" size={20} /></span>
          <span className="flex-1">
            <span className="block font-semibold">Ask Loamy about your {name.toLowerCase()}</span>
            <span className="block text-small text-ink-muted">Yellow leaves, pests, watering, harvesting…</span>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      ) : null}

      {gettingReady && kit ? (
        <>
          <StartKitCard items={kit.items} products={kit.products} back={back} />
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="font-semibold">Planted it?</h2>
            <form action={plantedAction} className="flex flex-col gap-3">
              <input type="hidden" name="gardenPlantId" value={id} />
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-small text-ink-muted">What did you plant?</legend>
                {([["seedling", "A seedling or cutting"], ["seeds", "Seeds"]] as const).map(([v, l], i) => (
                  <label key={v} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-2xl border border-line px-4 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink">
                    <input type="radio" name="start" value={v} defaultChecked={i === 0} className="h-4 w-4 accent-[#0A0A0A]" />
                    <span className="text-small font-semibold">{l}</span>
                  </label>
                ))}
              </fieldset>
              <Field label="When?" name="day" id="planted-day" type="date" max={today} defaultValue={today} />
              <SubmitButton pendingLabel="Saving…">I’ve planted it</SubmitButton>
            </form>
          </Card>
        </>
      ) : null}

      {active && !gettingReady ? (
        <section className="flex flex-col gap-3" aria-labelledby="todo-h">
          <h2 id="todo-h" className="text-lg font-semibold">To do</h2>
          {tasks.length ? (
            tasks.map((t) => <CareTaskCard key={t.id} task={{ ...t, plantName: name }} back={back} />)
          ) : (
            <Card className="flex items-center gap-2 p-4 text-small"><Icon name="check" size={16} /> Nothing due today. Check back tomorrow.</Card>
          )}
        </section>
      ) : null}

      {stages.length && !gettingReady ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Growth stage</h2>
          <ol className="flex flex-col gap-2">
            {stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 text-small">
                <span aria-hidden="true" className={cn("h-3 w-3 flex-none rounded-full", i < currentIdx ? "bg-ink" : i === currentIdx ? "bg-lemon ring-4 ring-lemon/30" : "bg-line-strong")} />
                <span className={cn("flex-1", i <= currentIdx ? "font-semibold" : "text-ink-muted")}>{s.name}</span>
                {s.typicalTiming ? <span className="text-xs text-ink-muted">{s.typicalTiming}</span> : null}
                {i === currentIdx ? <span className="sr-only">(current stage)</span> : null}
              </li>
            ))}
          </ol>
          {active && currentIdx < stages.length - 1 ? (
            <form action={plantRecordAction}>
              <Hidden id={id} kind="stage" />
              <input type="hidden" name="stageId" value={stages[Math.max(0, currentIdx + 1)].id} />
              <SubmitButton variant="secondary" pendingLabel="…">Moved on to: {stages[Math.max(0, currentIdx + 1)].name}</SubmitButton>
            </form>
          ) : null}
        </Card>
      ) : null}

      {active && !gettingReady ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Record something</h2>
          <details className="rounded-2xl bg-chip p-4">
            <summary className="cursor-pointer text-small font-semibold">Log care you did</summary>
            <form action={plantRecordAction} className="mt-3 flex flex-col gap-3">
              <Hidden id={id} kind="activity" />
              <select name="activityType" aria-label="What did you do?" className={input} defaultValue="watering">
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <Field label="Note (optional)" name="notes" id="act-notes" placeholder="e.g. Soil was dry, gave it a slow drink" />
              <SubmitButton pendingLabel="Saving…">Log it</SubmitButton>
            </form>
          </details>
          <details className="rounded-2xl bg-chip p-4">
            <summary className="cursor-pointer text-small font-semibold">A milestone</summary>
            <form action={plantRecordAction} className="mt-3 flex flex-col gap-3">
              <Hidden id={id} kind="milestone" />
              <select name="milestone" aria-label="Which milestone?" className={input}>
                {MILESTONES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <Field label="Note (optional)" name="notes" id="ms-notes" />
              <SubmitButton pendingLabel="Saving…">Save milestone</SubmitButton>
            </form>
          </details>
          <details className="rounded-2xl bg-chip p-4">
            <summary className="cursor-pointer text-small font-semibold">A harvest</summary>
            <form action={plantRecordAction} className="mt-3 grid grid-cols-2 gap-3">
              <Hidden id={id} kind="harvest" />
              <Field label="How much" name="quantity" id="hv-q" type="number" min={0.1} step="0.1" inputMode="decimal" required />
              <div className="flex flex-col gap-2">
                <label htmlFor="hv-unit" className="text-small font-semibold">Unit</label>
                <select id="hv-unit" name="unit" className={input}>{HARVEST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
              </div>
              <div className="col-span-2"><Field label="Date" name="day" id="hv-day" type="date" max={today} defaultValue={today} /></div>
              <div className="col-span-2"><Field label="Note (optional)" name="notes" id="hv-notes" placeholder="e.g. Enough for a pot of pepper soup" /></div>
              <div className="col-span-2"><SubmitButton pendingLabel="Saving…">Log harvest</SubmitButton></div>
            </form>
          </details>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Photos</h2>
          <span className="text-xs text-ink-muted">Only you can see these</span>
        </div>
        {photos.length ? (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((ph) => (
              <li key={ph.id} className="flex flex-col gap-1">
                {ph.url ? (
                  <img src={ph.url} alt={ph.caption ?? `${name}, ${fmt.format(ph.uploadedAt)}`} loading="lazy" className="aspect-square w-full rounded-xl bg-chip object-cover" />
                ) : (
                  <div className="aspect-square w-full rounded-xl bg-chip" />
                )}
                <span className="text-[11px] text-ink-muted">{fmt.format(ph.uploadedAt)}{ph.caption ? ` · ${ph.caption}` : ""}</span>
                <form action={gardenPhotoAction}>
                  <input type="hidden" name="gardenPlantId" value={id} />
                  <input type="hidden" name="photoId" value={ph.id} />
                  <input type="hidden" name="op" value="remove" />
                  <button type="submit" className="text-[11px] font-semibold text-danger-ink underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-muted">Snap your plant every week or two. It’s the best way to see how far it’s come.</p>
        )}
        {active && storageConfigured() ? (
          <details className="rounded-2xl bg-chip p-4">
            <summary className="cursor-pointer text-small font-semibold">Add a photo</summary>
            <form action={gardenPhotoAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="gardenPlantId" value={id} />
              <PhotoPicker submitId="upload-garden-photo" kind="garden" />
              <Field label="Caption (optional)" name="caption" id="ph-caption" placeholder="e.g. First flowers!" />
              <SubmitButton id="upload-garden-photo" pendingLabel="Uploading…">Add photo</SubmitButton>
            </form>
          </details>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">History</h2>
        {milestones.length || harvests.length || activities.length ? (
          <ul className="flex flex-col gap-2 text-small">
            {milestones.map((m) => (
              <li key={m.id} className="flex gap-2"><Tag tone="lemon">Milestone</Tag><span>{MILESTONES.find((x) => x.value === m.milestoneType)?.label ?? m.milestoneType} · {fmt.format(m.recordedAt)}{m.notes ? ` · ${m.notes}` : ""}</span></li>
            ))}
            {harvests.map((h) => (
              <li key={h.id} className="flex gap-2"><Tag tone="leaf">Harvest</Tag><span>{Number(h.quantity)} {h.unit} · {fmtDay(h.harvestDate)}{h.notes ? ` · ${h.notes}` : ""}</span></li>
            ))}
            {activities.map((a) => (
              <li key={a.id} className="text-ink-muted">{fmt.format(a.performedAt)} · <span className="text-ink">{a.customLabel ?? taskTypeLabel(a.activityType)}</span>{a.notes ? ` · ${a.notes}` : ""}</li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-muted">Nothing yet. Tick off a task or log what you did, and it shows up here.</p>
        )}
      </Card>

      {active ? (
        <details className="rounded-card bg-card p-4">
          <summary className="cursor-pointer text-small font-semibold">Plant details</summary>
          <form action={plantRecordAction} className="mt-3 flex flex-col gap-3">
            <Hidden id={id} kind="details" />
            <Field label="Nickname (optional)" name="nickname" id="nick" defaultValue={gp.nickname ?? ""} placeholder={`e.g. Balcony ${plant.commonName.toLowerCase()}`} />
            <Field label="Planting date" name="plantingDate" id="pdate" type="date" max={today} defaultValue={gp.plantingDate ?? ""} hint="Your care tasks count from this day." />
            <SubmitButton variant="secondary" pendingLabel="Saving…">Save details</SubmitButton>
          </form>
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-small text-ink-muted">Finished with this plant? Its history stays in your account.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["completed", "failed"] as const).map((s) => (
                <form key={s} action={archivePlantAction}>
                  <input type="hidden" name="gardenPlantId" value={id} />
                  <input type="hidden" name="status" value={s} />
                  <SubmitButton variant="secondary" pendingLabel="…">{s === "completed" ? "Finished growing" : "It didn’t make it"}</SubmitButton>
                </form>
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </Page>
  );
}
