import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, IconTile, type TileColour } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { canOpenPlantLibrary } from "@/lib/plant-workflow";
import { canManageShop } from "@/lib/product-admin";
import { requireUser } from "@/server/auth";
import { canHelp } from "@/server/help-admin";
import { getRoles } from "@/server/plant-admin";
import { canHandlePrivacy, canManageTeam } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await requireUser("/admin");
  const roles = await getRoles(user.id);
  const areas: { href: string; title: string; body: string; icon: IconName; colour: TileColour; allowed: boolean }[] = [
    { href: "/admin/plants", title: "Plant library", body: "Write, review and publish plant profiles.", icon: "sprout", colour: "sage", allowed: canOpenPlantLibrary(roles) },
    { href: "/admin/products", title: "Shop items", body: "Prices, stock, photos and publishing.", icon: "bag", colour: "peach", allowed: canManageShop(roles) },
    { href: "/admin/orders", title: "Orders", body: "Call customers, arrange and track delivery.", icon: "check", colour: "lemon", allowed: canManageShop(roles) },
    { href: "/admin/help", title: "Help requests", body: "Members asking the Loamy team for help.", icon: "chat", colour: "sky", allowed: canHelp(roles) },
    { href: "/admin/promos", title: "Promo codes", body: "Create and switch off discount codes.", icon: "heart", colour: "lilac", allowed: canManageShop(roles) },
    { href: "/admin/privacy", title: "Privacy requests", body: "Account deletion requests to complete.", icon: "shield", colour: "sage", allowed: canHandlePrivacy(roles) },
    { href: "/admin/team", title: "Team", body: "Add your plant expert and staff, and set what they can do.", icon: "user", colour: "sky", allowed: canManageTeam(roles) },
  ];
  const mine = areas.filter((a) => a.allowed);
  if (!mine.length) redirect("/");

  return (
    <>
      <h1 className="text-title">Admin</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {mine.map((a) => (
          <Link key={a.href} href={a.href}>
            <Card className="flex items-center gap-3.5 p-4 hover:border-line-strong">
              <IconTile icon={a.icon} colour={a.colour} />
              <div>
                <p className="font-semibold">{a.title}</p>
                <p className="text-small text-ink-muted">{a.body}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
