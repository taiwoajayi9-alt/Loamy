import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, FormNotice, Tag } from "@/components/ui";
import { canHandlePrivacy } from "@/lib/team";
import { requireUser } from "@/server/auth";
import { getRoles } from "@/server/plant-admin";
import { listDeletionRequests } from "@/server/privacy";
import { completeDeletionAction } from "./actions";

export const metadata: Metadata = { title: "Privacy requests" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
const DAY = 24 * 60 * 60 * 1000;

export default async function AdminPrivacy({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser("/admin/privacy");
  if (!canHandlePrivacy(await getRoles(user.id))) redirect("/admin");
  const { notice, error } = await searchParams;
  const all = await listDeletionRequests();
  const open = all.filter((r) => r.status === "requested");
  const closed = all.filter((r) => r.status !== "requested").slice(-20).reverse();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Privacy requests</h1>
        <p className="text-ink-muted">
          Members can download their own data from their profile. Deletion requests land here. Complete them within 30 days; aim for a week.
        </p>
      </div>
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <section className="flex flex-col gap-2" aria-labelledby="open-h">
        <h2 id="open-h" className="text-lg font-semibold">Waiting ({open.length})</h2>
        {open.length === 0 ? (
          <EmptyState title="No deletion requests" body="When a member asks to delete their account, it shows up here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((r) => {
              const age = Math.floor((Date.now() - r.requestedAt.getTime()) / DAY);
              return (
                <li key={r.id}>
                  <Card className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 font-semibold">{r.email}</p>
                      <Tag tone={age >= 21 ? "peach" : "lemon"}>{age === 0 ? "Today" : `${age} day${age === 1 ? "" : "s"} ago`}</Tag>
                    </div>
                    <p className="text-small text-ink-muted">
                      Asked {dateFmt.format(r.requestedAt)} · {r.orders} order{r.orders === 1 ? "" : "s"} (kept for tax, with personal details removed)
                    </p>
                    {r.notes ? <p className="whitespace-pre-line rounded-2xl bg-chip p-3 text-small">{r.notes}</p> : null}
                    <form action={completeDeletionAction} className="flex flex-col gap-3">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="flex items-start gap-2.5 text-small">
                        <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-5 w-5 accent-[#0A0A0A]" />
                        Delete this account now. This can’t be undone.
                      </label>
                      <SubmitButton pendingLabel="Deleting…">Delete account</SubmitButton>
                    </form>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {closed.length ? (
        <section className="flex flex-col gap-2" aria-labelledby="closed-h">
          <h2 id="closed-h" className="text-lg font-semibold">Recently closed</h2>
          <ul className="flex flex-col gap-1.5 text-small">
            {closed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Tag tone={r.status === "completed" ? "leaf" : "grey"}>{r.status === "completed" ? "Deleted" : "Cancelled by member"}</Tag>
                <span className="text-ink-muted">
                  Asked {dateFmt.format(r.requestedAt)}
                  {r.completedAt ? ` · closed ${dateFmt.format(r.completedAt)}` : ""}
                </span>
                {r.notes?.includes("Sign-in not removed") ? <span className="w-full text-xs text-danger-ink">{r.notes.split("\n").pop()}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
