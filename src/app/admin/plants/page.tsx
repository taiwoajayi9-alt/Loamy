import Link from "next/link";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/auto-refresh";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, FormNotice, Tag } from "@/components/ui";
import { canEditPlants, PILLARS } from "@/lib/plant-workflow";
import { aiDraftConfigured } from "@/server/ai/plant-draft";
import { getDraftAllStatus, listAdminPlants, plantsNeedingDraft, requirePlantLibrary } from "@/server/plant-admin";
import { draftAllAction } from "./actions";

export const metadata: Metadata = { title: "Plant library" };
export const dynamic = "force-dynamic";

export default async function AdminPlants({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const actor = await requirePlantLibrary("/admin/plants");
  const { notice, error } = await searchParams;
  const [rows, job, needing] = await Promise.all([listAdminPlants(), getDraftAllStatus(), plantsNeedingDraft()]);
  const mayDraft = canEditPlants(actor.roles) && aiDraftConfigured();
  const live = rows.filter((r) => r.status === "published").length;
  const waiting = rows.reduce((n, r) => n + r.inReview, 0);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Plant library</h1>
        <p className="text-ink-muted">
          {live} of {rows.length} live · {waiting} section{waiting === 1 ? "" : "s"} waiting for review
        </p>
      </div>

      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      {mayDraft ? (
        <Card className="flex flex-col gap-3 bg-ink p-5 text-white">
          <h2 className="text-lg font-semibold">Draft all plants with AI</h2>
          {job.state === "running" ? (
            <>
              <AutoRefresh />
              <p className="text-small" role="status" aria-live="polite">
                Drafting {job.done + 1} of {job.total}: <span className="font-semibold text-lemon">{job.current}</span>. Keep this app running. You can leave this page.
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                <div className="h-full rounded-full bg-lemon transition-all" style={{ width: `${Math.round((job.done / job.total) * 100)}%` }} />
              </div>
            </>
          ) : (
            <>
              {job.state === "finished" ? (
                <p className="text-small">
                  Last run finished: {job.total - job.failed.length} of {job.total} drafted.
                  {job.failed.length ? ` Didn’t work: ${job.failed.join(", ")}. Run it again to retry them.` : " Read each one before sending it for review."}
                </p>
              ) : job.state === "stopped" ? (
                <p className="text-small">Last run stopped after {job.done} of {job.total}. {job.reason}</p>
              ) : null}
              {needing.length ? (
                <>
                  <p className="text-small text-ink-on-black">
                    {needing.length} plant{needing.length === 1 ? " has" : "s have"} empty sections. AI fills only the empty ones, one plant at a time,
                    so anything you’ve written or edited stays as it is. Nothing goes live until it’s approved.
                  </p>
                  <form action={draftAllAction}>
                    <SubmitButton variant="lime" pendingLabel="Starting…">
                      Draft {needing.length} plant{needing.length === 1 ? "" : "s"}
                    </SubmitButton>
                  </form>
                </>
              ) : (
                <p className="text-small text-ink-on-black">Every plant has all six sections started.</p>
              )}
            </>
          )}
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No plants yet" body="Plants appear here once they're added to the catalogue." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/plants/${p.id}`}>
                <Card className="flex flex-wrap items-center gap-3 p-4 hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.commonName}</p>
                    <p className="text-small text-ink-muted">{p.category}</p>
                  </div>
                  <span className="text-small tabular-nums text-ink-muted" aria-label={`${p.approved} of ${PILLARS.length} sections approved`}>
                    {p.approved}/{PILLARS.length} approved
                  </span>
                  {p.inReview ? <Tag tone="lemon">{p.inReview} to review</Tag> : null}
                  {p.isSample ? <Tag tone="grey">Sample</Tag> : null}
                  <Tag tone={p.status === "published" ? "leaf" : "grey"}>{p.status === "published" ? "Live" : "Draft"}</Tag>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
