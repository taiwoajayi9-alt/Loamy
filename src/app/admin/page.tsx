import Link from "next/link";
import { Card, IconTile } from "@/components/ui";
import { requirePlantLibrary } from "@/server/plant-admin";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requirePlantLibrary("/admin");
  return (
    <>
      <h1 className="text-title">Admin</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/plants">
          <Card className="flex items-center gap-3.5 p-4 hover:border-line-strong">
            <IconTile icon="sprout" colour="sage" />
            <div>
              <p className="font-semibold">Plant library</p>
              <p className="text-small text-ink-muted">Write, review and publish plant profiles.</p>
            </div>
          </Card>
        </Link>
        <Card className="flex items-center gap-3.5 p-4 opacity-60">
          <IconTile icon="bag" colour="peach" />
          <div>
            <p className="font-semibold">Shop items</p>
            <p className="text-small text-ink-muted">Prices, stock and photos. Coming next.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
