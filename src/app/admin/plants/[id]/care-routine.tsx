import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormNotice, Tag } from "@/components/ui";
import { describeRule, TASK_TYPES, taskTypeLabel, type TimingRule } from "@/lib/care";
import { draftWarnings } from "@/lib/ai/plant-draft";
import { aiCareDraftAction, retireCareAction, reviewCareAction, saveCareAction } from "./actions";

type Template = { id: string; taskType: string; title: string; instructions: string; timingRule: unknown; reviewStatus: "pending" | "approved" | "rejected"; status: string };

const input = "min-h-[50px] w-full rounded-2xl border border-line-strong bg-card px-4 text-[15px]";
const area = "w-full rounded-2xl border border-line-strong bg-card px-4 py-3 text-[15px] leading-relaxed";

function CareForm({ plantId, t }: { plantId: string; t?: Template }) {
  const rule = (t?.timingRule ?? { everyDays: 1 }) as TimingRule;
  const k = t?.id ?? "new";
  return (
    <form action={saveCareAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="plantId" value={plantId} />
      {t ? <input type="hidden" name="careId" value={t.id} /> : null}
      <div className="flex flex-col gap-2">
        <label htmlFor={`type-${k}`} className="text-small font-semibold">Type</label>
        <select id={`type-${k}`} name="taskType" defaultValue={t?.taskType ?? "soil_check"} className={input}>
          {TASK_TYPES.map((x) => (
            <option key={x.value} value={x.value}>{x.label}</option>
          ))}
        </select>
      </div>
      <Field label="Title" id={`title-c-${k}`} name="title" defaultValue={t?.title ?? ""} placeholder="e.g. Check the soil before watering" required />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <label htmlFor={`ins-${k}`} className="text-small font-semibold">Instructions</label>
        <textarea id={`ins-${k}`} name="instructions" rows={3} defaultValue={t?.instructions ?? ""} className={area} required />
      </div>
      <Field label="Repeat every (days)" id={`every-${k}`} name="everyDays" type="number" min={1} max={365} defaultValue={rule.everyDays} required />
      <Field label="Start after planting (days)" id={`start-${k}`} name="startAfterDays" type="number" min={0} max={365} defaultValue={rule.startAfterDays ?? 0} hint="0 means from planting day." />
      <div className="sm:col-span-2">
        <SubmitButton variant="secondary" pendingLabel="Saving…">{t ? "Save changes" : "Add care task"}</SubmitButton>
      </div>
    </form>
  );
}

export function CareRoutine({ plantId, care, mayEdit, mayApprove, aiOn }: { plantId: string; care: Template[]; mayEdit: boolean; mayApprove: boolean; aiOn: boolean }) {
  const approved = care.filter((c) => c.reviewStatus === "approved").length;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2" id="care" style={{ scrollMarginTop: 80 }}>
        <h2 className="text-lg font-semibold">Care routine</h2>
        <Tag tone={approved ? "leaf" : "grey"}>{approved} approved</Tag>
      </div>
      <p className="text-small text-ink-muted">
        Repeating tasks that appear in members’ gardens, such as checking the soil or feeding. Only approved tasks reach members. Approved tasks can’t be edited:
        add a new one and retire the old one, so schedules stay stable.
      </p>

      {mayEdit && aiOn ? (
        <form action={aiCareDraftAction}>
          <input type="hidden" name="plantId" value={plantId} />
          <SubmitButton variant="lime" pendingLabel="Drafting… this can take a minute">{care.length ? "Draft more tasks with AI" : "Draft a care routine with AI"}</SubmitButton>
        </form>
      ) : null}

      {care.length === 0 ? <p className="text-small">No care tasks yet.</p> : null}
      <ul className="flex flex-col gap-3">
        {care.map((c) => {
          const rule = c.timingRule as TimingRule;
          const warn = c.reviewStatus !== "approved" ? draftWarnings(c.instructions) : [];
          return (
            <li key={c.id} className="flex flex-col gap-2 rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{c.title}</p>
                <Tag tone={c.reviewStatus === "approved" ? "leaf" : c.reviewStatus === "rejected" ? "peach" : "lemon"}>
                  {c.reviewStatus === "approved" ? "Approved" : c.reviewStatus === "rejected" ? "Changes requested" : "Waiting for review"}
                </Tag>
              </div>
              <p className="text-small text-ink-muted">{taskTypeLabel(c.taskType)} · {describeRule(rule)}</p>
              <p className="text-small">{c.instructions}</p>
              {warn.map((w) => (
                <FormNotice key={w} tone="error">Check this: {w}</FormNotice>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {mayEdit && c.reviewStatus !== "approved" ? (
                  <details>
                    <summary className="cursor-pointer text-small font-semibold underline">Edit</summary>
                    <div className="mt-3"><CareForm plantId={plantId} t={c} /></div>
                  </details>
                ) : null}
                {mayApprove && c.reviewStatus === "pending" ? (
                  <form action={reviewCareAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="plantId" value={plantId} />
                    <input type="hidden" name="careId" value={c.id} />
                    <input name="note" placeholder="Note (needed to ask for changes)" className="min-h-[44px] rounded-full border border-line-strong bg-card px-4 text-small" />
                    <SubmitButton name="decision" value="approve" pendingLabel="…">Approve</SubmitButton>
                    <SubmitButton variant="secondary" name="decision" value="request_changes" pendingLabel="…">Ask for changes</SubmitButton>
                  </form>
                ) : null}
                {mayEdit || mayApprove ? (
                  <form action={retireCareAction}>
                    <input type="hidden" name="plantId" value={plantId} />
                    <input type="hidden" name="careId" value={c.id} />
                    <button type="submit" className="text-xs font-semibold text-danger-ink underline">Retire</button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {mayEdit ? (
        <details className="rounded-2xl bg-chip p-4">
          <summary className="cursor-pointer text-small font-semibold">Add a care task</summary>
          <div className="mt-3"><CareForm plantId={plantId} /></div>
        </details>
      ) : null}
    </Card>
  );
}
