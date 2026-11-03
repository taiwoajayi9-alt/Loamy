import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormNotice, Tag } from "@/components/ui";
import { draftWarnings } from "@/lib/ai/plant-draft";
import {
  approvedByType,
  canApprovePlants,
  canEditPlants,
  canPublishPlants,
  latestByType,
  PILLARS,
  SECTION_STATE_LABEL,
  sectionState,
  type SectionState,
} from "@/lib/plant-workflow";
import { aiDraftConfigured } from "@/server/ai/plant-draft";
import { getAdminPlant, getReviewNotes, requirePlantLibrary } from "@/server/plant-admin";
import {
  addSourceAction,
  aiDraftAction,
  publishAction,
  removeSourceAction,
  reviewSectionAction,
  saveBasicsAction,
  saveSectionAction,
  submitAllAction,
  approveAllAction,
} from "./actions";
import { CareRoutine } from "./care-routine";

export const metadata: Metadata = { title: "Edit plant" };
export const dynamic = "force-dynamic";

const STATE_TONE: Record<SectionState, "leaf" | "lemon" | "grey" | "peach" | "dark"> = {
  empty: "grey",
  draft: "grey",
  in_review: "lemon",
  changes_requested: "peach",
  approved: "leaf",
};

const textareaClass =
  "w-full rounded-2xl border border-line-strong bg-card px-4 py-3 text-[15px] leading-relaxed text-ink placeholder:text-[#8a8a86]";
const selectClass = "min-h-[50px] rounded-2xl border border-line-strong bg-card px-4 text-[15px] text-ink";

export default async function EditPlant({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const actor = await requirePlantLibrary(`/admin/plants/${id}`);
  const { notice, error } = await searchParams;
  const data = await getAdminPlant(id);
  if (!data) notFound();

  const { plant, categories, sections, refs, care, readiness } = data;
  const latest = latestByType(sections);
  const live = approvedByType(sections);
  const notes = await getReviewNotes([...latest.values()].map((s) => s.id));
  const mayEdit = canEditPlants(actor.roles);
  const mayApprove = canApprovePlants(actor.roles);
  const mayPublish = canPublishPlants(actor.roles);
  const aiOn = aiDraftConfigured();

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/plants" className="text-small font-semibold text-ink-muted hover:underline">
          ← Plant library
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title">{plant.commonName}</h1>
          <Tag tone={plant.status === "published" ? "leaf" : "grey"}>{plant.status === "published" ? "Live" : "Draft"}</Tag>
        </div>
        {plant.status === "published" ? (
          <Link href={`/plants/${plant.slug}`} className="text-small font-semibold underline decoration-lemon decoration-2 underline-offset-4">
            See it as a customer
          </Link>
        ) : null}
      </div>

      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      {/* ── Basics ── */}
      <Card className="flex flex-col gap-4 p-5" >
        <h2 id="basics" className="scroll-mt-20 text-lg font-semibold">The basics</h2>
        <form action={saveBasicsAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="plantId" value={plant.id} />
          <Field label="Name" name="commonName" defaultValue={plant.commonName} required disabled={!mayEdit} />
          <Field label="Botanical name" name="botanicalName" defaultValue={plant.botanicalName ?? ""} disabled={!mayEdit} />
          <Field
            label="Local names"
            name="localNames"
            defaultValue={plant.localNames.join(", ")}
            hint="Separate with commas, e.g. Efirin, Nchanwu"
            disabled={!mayEdit}
          />
          <div className="flex flex-col gap-2">
            <label htmlFor="field-categoryId" className="text-small font-semibold">Category</label>
            <select id="field-categoryId" name="categoryId" defaultValue={plant.categoryId} className={selectClass} disabled={!mayEdit}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <Field label="Tagline" name="tagline" defaultValue={plant.tagline ?? ""} hint="One friendly line, shown under the name." disabled={!mayEdit} />
          <Field label="Summary" name="summaryLine" defaultValue={plant.summaryLine ?? ""} hint="Short, e.g. Herb · beginner friendly" disabled={!mayEdit} />
          {mayEdit ? (
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Saving…">Save the basics</SubmitButton>
            </div>
          ) : null}
        </form>
      </Card>

      {/* ── AI draft ── */}
      {mayEdit ? (
        <Card className="flex flex-col gap-3 bg-ink p-5 text-white">
          <h2 id="sections" className="scroll-mt-20 text-lg font-semibold">Start with an AI draft</h2>
          <p className="text-small text-ink-on-black">
            AI writes a first draft of every section that isn’t approved or waiting for review, and sends it straight to the expert. Nothing goes live until it’s approved.
          </p>
          {(() => {
            const drafts = [...latest.values()].filter((s) => sectionState(s) === "draft").length;
            return drafts ? (
              <form action={submitAllAction}>
                <input type="hidden" name="plantId" value={plant.id} />
                <SubmitButton variant="lime" pendingLabel="Sending…">Send {drafts} draft{drafts === 1 ? "" : "s"} for review</SubmitButton>
              </form>
            ) : null;
          })()}
          {aiOn ? (
            <form action={aiDraftAction}>
              <input type="hidden" name="plantId" value={plant.id} />
              <SubmitButton variant="lime" pendingLabel="Drafting… this can take a minute">Draft with AI</SubmitButton>
            </form>
          ) : (
            <p className="rounded-2xl bg-white/10 px-4 py-3 text-small">AI drafting is off. Add a Gemini or DeepSeek key to .env.local to turn it on. You can still write each section yourself below.</p>
          )}
        </Card>
      ) : null}

      {/* ── Six sections ── */}
      {PILLARS.map((p) => {
        const cur = latest.get(p.type);
        const state = sectionState(cur);
        const liveVersion = live.get(p.type);
        const sectionRefs = cur ? refs.filter((r) => r.sectionId === cur.id) : [];
        const warnings = cur && state !== "approved" ? draftWarnings(cur.body) : [];
        const note = cur ? notes.get(cur.id) : undefined;
        return (
          <Card key={p.type} className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-2" id={p.type} style={{ scrollMarginTop: 80 }}>
              <h2 className="text-lg font-semibold">{p.label}</h2>
              <Tag tone={STATE_TONE[state]}>{SECTION_STATE_LABEL[state]}</Tag>
              {cur?.aiDrafted && state !== "approved" ? <Tag tone="dark">AI draft</Tag> : null}
              {cur ? <span className="text-xs text-ink-muted">Version {cur.version}</span> : null}
            </div>
            <p className="text-small text-ink-muted">{p.hint}</p>

            {liveVersion && cur && liveVersion.id !== cur.id ? (
              <p className="text-small">Customers still see version {liveVersion.version} until this one is approved.</p>
            ) : null}
            {state === "changes_requested" && note ? (
              <FormNotice tone="error">Expert’s note: {note}</FormNotice>
            ) : null}
            {warnings.map((w) => (
              <FormNotice key={w} tone="error">Check this: {w}</FormNotice>
            ))}

            {mayEdit ? (
              <form action={saveSectionAction} className="flex flex-col gap-3">
                <input type="hidden" name="plantId" value={plant.id} />
                <input type="hidden" name="type" value={p.type} />
                <Field label="Heading" name={`title`} id={`title-${p.type}`} defaultValue={cur?.title ?? p.label} required />
                <div className="flex flex-col gap-2">
                  <label htmlFor={`body-${p.type}`} className="text-small font-semibold">Text</label>
                  <textarea id={`body-${p.type}`} name="body" rows={8} defaultValue={cur?.body ?? ""} className={textareaClass} required />
                  {state === "approved" ? (
                    <p className="text-xs text-ink-muted">Saving changes starts a new version. The approved text stays live until the new one is approved.</p>
                  ) : state === "in_review" ? (
                    <p className="text-xs text-ink-muted">Saving changes takes it out of review. Send it again when you’re done.</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton variant="secondary" name="intent" value="save" pendingLabel="Saving…">Save draft</SubmitButton>
                  <SubmitButton name="intent" value="submit" pendingLabel="Sending…">Save and send for review</SubmitButton>
                </div>
              </form>
            ) : cur ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-chip p-4">
                <p className="font-semibold">{cur.title}</p>
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{cur.body}</p>
              </div>
            ) : (
              <p className="text-small text-ink-muted">Nothing written yet.</p>
            )}

            {mayApprove && state === "in_review" ? (
              <form action={reviewSectionAction} className="flex flex-col gap-3 rounded-2xl border border-lemon bg-[#fffbe0] p-4">
                <input type="hidden" name="plantId" value={plant.id} />
                <input type="hidden" name="type" value={p.type} />
                <p className="font-semibold">Your review</p>
                <p className="text-small">Check facts, safety and tone for Lagos growers. Approving puts this text live once the plant is published.</p>
                <textarea name="note" rows={3} placeholder="Notes for the writer (needed if you ask for changes)" className={textareaClass} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="approve" pendingLabel="Approving…">Approve</SubmitButton>
                  <SubmitButton variant="secondary" name="decision" value="request_changes" pendingLabel="Sending…">Ask for changes</SubmitButton>
                </div>
              </form>
            ) : null}

            {/* Sources */}
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <p className="text-small font-semibold">Sources</p>
              {sectionRefs.length ? (
                <ul className="flex flex-col gap-1.5">
                  {sectionRefs.map((r) => (
                    <li key={r.referenceId} className="flex flex-wrap items-center gap-2 text-small">
                      <span>
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer noopener" className="underline">{r.title}</a>
                        ) : (
                          r.title
                        )}
                        {r.publisher ? <span className="text-ink-muted"> · {r.publisher}</span> : null}
                        {r.note ? <span className="text-ink-muted"> · {r.note}</span> : null}
                      </span>
                      {state !== "approved" && (mayEdit || mayApprove) ? (
                        <form action={removeSourceAction}>
                          <input type="hidden" name="plantId" value={plant.id} />
                          <input type="hidden" name="type" value={p.type} />
                          <input type="hidden" name="referenceId" value={r.referenceId} />
                          <button type="submit" className="text-xs font-semibold text-danger-ink underline">Remove</button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-ink-muted">No sources yet.</p>
              )}
              {cur && (mayEdit || mayApprove) ? (
                <details className="rounded-2xl bg-chip p-4">
                  <summary className="cursor-pointer text-small font-semibold">Add a source</summary>
                  <form action={addSourceAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="plantId" value={plant.id} />
                    <input type="hidden" name="type" value={p.type} />
                    <Field label="Title" name="title" id={`src-title-${p.type}`} required placeholder="e.g. Growing vegetables in containers" />
                    <Field label="Publisher" name="publisher" id={`src-pub-${p.type}`} placeholder="e.g. IITA, NIHORT" />
                    <Field label="Link" name="url" id={`src-url-${p.type}`} type="url" placeholder="https://" />
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`src-type-${p.type}`} className="text-small font-semibold">Type</label>
                      <select id={`src-type-${p.type}`} name="sourceType" className={selectClass} defaultValue="extension_service">
                        <option value="extension_service">Extension service or institute</option>
                        <option value="research">Research paper</option>
                        <option value="book">Book</option>
                        <option value="expert_interview">Expert interview</option>
                        <option value="website">Website</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Note (optional)" name="note" id={`src-note-${p.type}`} placeholder="What this source backs up" />
                    </div>
                    <div className="sm:col-span-2">
                      <SubmitButton variant="secondary" pendingLabel="Adding…">Add source</SubmitButton>
                    </div>
                  </form>
                </details>
              ) : null}
            </div>
          </Card>
        );
      })}

      {actor.roles.includes("super_admin") && ([...latest.values()].some((s) => sectionState(s) === "in_review") || care.some((c) => c.reviewStatus === "pending")) ? (
        <Card className="flex flex-col gap-3 border-lemon p-5">
          <h2 className="text-lg font-semibold">Approve everything for this plant</h2>
          <p className="text-small text-ink-muted">
            Approves every section and care task that’s waiting for review. You’re signing off the facts, safety and tone, so read the plant first.
            Customers see it once the plant is published.
          </p>
          <form action={approveAllAction} className="flex flex-col gap-3">
            <input type="hidden" name="plantId" value={plant.id} />
            <label className="flex items-start gap-2.5 text-small">
              <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-5 w-5 accent-[#0A0A0A]" />
              I’ve read this plant’s sections and care routine, and they’re right for Lagos growers.
            </label>
            <SubmitButton pendingLabel="Approving…">Approve all</SubmitButton>
          </form>
        </Card>
      ) : null}

      <CareRoutine plantId={plant.id} care={care} mayEdit={mayEdit} mayApprove={mayApprove} aiOn={aiOn} />

      {/* ── Publish ── */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 id="publish" className="scroll-mt-20 text-lg font-semibold">Publish</h2>
        {plant.status === "published" ? (
          <p className="text-small">This plant is live. Customers see the latest approved version of each section.</p>
        ) : readiness.ready ? (
          <p className="text-small">All six sections are approved and sourced. Ready to go live.</p>
        ) : (
          <>
            <p className="text-small">Before it can go live:</p>
            <ul className="list-disc pl-5 text-small">
              {readiness.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
        {mayPublish ? (
          <form action={publishAction}>
            <input type="hidden" name="plantId" value={plant.id} />
            {plant.status === "published" ? (
              <>
                <input type="hidden" name="publish" value="0" />
                <SubmitButton variant="secondary" pendingLabel="Unpublishing…">Unpublish</SubmitButton>
              </>
            ) : (
              <>
                <input type="hidden" name="publish" value="1" />
                {readiness.ready ? <SubmitButton variant="lime" pendingLabel="Publishing…">Publish to Discover</SubmitButton> : null}
              </>
            )}
          </form>
        ) : null}
      </Card>
    </>
  );
}
