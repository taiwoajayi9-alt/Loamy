import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { listEscalations } from "@/server/ask";
import { requireHelpDesk } from "@/server/help-admin";

export const metadata: Metadata = { title: "Help requests" };
export const dynamic = "force-dynamic";
const fmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

export default async function HelpInbox({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireHelpDesk("/admin/help");
  const show = (await searchParams).show === "all" ? "all" : "open";
  const rows = await listEscalations(show);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Help requests</h1>
        <p className="text-ink-muted">Members who tapped “Ask the Loamy team” in Ask Loamy.</p>
      </div>
      <nav className="flex gap-2" aria-label="Filter">
        {(["open", "all"] as const).map((f) => (
          <Link key={f} href={f === "open" ? "/admin/help" : "/admin/help?show=all"} aria-current={show === f ? "page" : undefined} className={cn("flex min-h-[38px] items-center rounded-full border px-4 text-small font-semibold", show === f ? "border-ink bg-ink text-white" : "border-line-strong bg-card")}>
            {f === "open" ? "Open" : "All"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting" body="New help requests from Ask Loamy appear here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.esc.id}>
              <Link href={`/admin/help/${r.esc.id}`}>
                <Card className="flex flex-wrap items-center gap-3 p-4 hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.esc.reason}</p>
                    <p className="text-small text-ink-muted">{r.email} · {fmt.format(r.esc.createdAt)}</p>
                  </div>
                  <Tag tone={r.esc.status === "open" ? "peach" : r.esc.status === "in_progress" ? "lemon" : "leaf"}>{r.esc.status === "in_progress" ? "In progress" : r.esc.status === "open" ? "New" : "Resolved"}</Tag>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
