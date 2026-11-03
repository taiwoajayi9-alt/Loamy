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
import { archivePlantAction, plantRecordAction } from "../../actions";

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
  const { gp, plant, tasks, stages, activities, milestones, harvests } = data;
  const name = gp.nickname || plant.commonName;
  const today = lagosDay(new Date());
  const age = gp.plantingDate ? daysBetween(gp.plantingDate, today) : null;
  const currentIdx = stages.findIndex((s) => s.id === gp.growthStageId);
  const active = gp.status === "active";
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
          <Tag tone="lemon">{active ? (stages[currentIdx]?.name ?? "Growing") : gp.status === "completed" ? "Finished" : "Archived"}</Tag>
          <Link href={`/plants/${plant.slug}`} className="text-small font-semibold text-ink-on-black underline decoration-lemon underline-offset-4">About {plant.commonName.toLowerCase()}</Link>
        </div>
        <h1 className="text-title">{name}</h1>
        <div className="flex items-baseline gap-2.5">
          <span className="text-big tabular-nums">{age ?? "—"}</span>
          <span className="text-ink-on-black">{age === 1 ? "day" : "days"} growing{gp.plantingDate ? ` · planted ${fmtDay(gp.plantingDate)}` : ""}</span>
        </div>
      </HeroCard>

      {active ? (
        <section className="flex flex-col gap-3" aria-labelledby="todo-h">
          <h2 id="todo-h" className="text-lg font-semibold">To do</h2>
          {tasks.length ? (
            tasks.map((t) => <CareTaskCard key={t.id} task={{ ...t, plantName: name }} back={back} />)
          ) : (
            <Card className="flex items-center gap-2 p-4 text-small"><Icon name="check" size={16} /> Nothing due today. Check back tomorrow.</Card>
          )}
        </section>
      ) : null}

      {stages.length ? (
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

      {active ? (
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
