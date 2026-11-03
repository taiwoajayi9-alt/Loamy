import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, Tag } from "@/components/ui";
import { PILLARS } from "@/lib/plant-workflow";
import { listAdminPlants, requirePlantLibrary } from "@/server/plant-admin";

export const metadata: Metadata = { title: "Plant library" };
export const dynamic = "force-dynamic";

export default async function AdminPlants() {
  await requirePlantLibrary("/admin/plants");
  const rows = await listAdminPlants();
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
