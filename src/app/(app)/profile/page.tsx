import Link from "next/link";
import type { Metadata } from "next";
import { logout } from "@/app/(auth)/actions";
import { Button, ButtonLink, Card, FormNotice, HeroCard, Icon, IconTile, Page, Tag, type IconName, type TileColour } from "@/components/ui";
import { env } from "@/lib/env";
import { requireUser, userHasEntitlement } from "@/server/auth";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

const ROWS: Array<{ label: string; icon: IconName; colour: TileColour; href: string }> = [
  { label: "Saved plants", icon: "heart", colour: "lemon", href: "/profile" },
  { label: "Growing spaces", icon: "sprout", colour: "sage", href: "/profile" },
  { label: "Orders", icon: "bag", colour: "peach", href: "/profile" },
  { label: "Privacy and data", icon: "shield", colour: "sky", href: "/profile" },
];

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { password } = await searchParams;

  if (!env.authConfigured()) {
    return (
      <Page>
        <h1 className="text-title">Profile</h1>
        <FormNotice tone="error">Sign-in isn&apos;t set up in this environment yet. Add the Supabase keys to .env.local.</FormNotice>
        <ButtonLink href="/discover" variant="secondary">Back to Discover</ButtonLink>
      </Page>
    );
  }

  const user = await requireUser("/profile");
  const subscribed = await userHasEntitlement(user.id, "my_garden");

  return (
    <Page>
      <h1 className="text-title">Profile</h1>
      {password === "updated" ? <FormNotice tone="success">Your password is updated.</FormNotice> : null}

      <HeroCard className="min-h-[200px] gap-[18px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-lemon text-lg font-bold text-ink">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <p className="truncate text-small text-ink-on-black">{user.email}</p>
          </div>
          <Tag tone={subscribed ? "lemon" : "grey"}>{subscribed ? "Active" : "Free"}</Tag>
        </div>
        <div className="mt-auto flex flex-col gap-1">
          <span className="text-eyebrow uppercase text-lemon">Loamy membership</span>
          <p className="text-xl font-bold tracking-[-0.02em]">{subscribed ? "Every plant unlocked" : "Free account"}</p>
          <p className="text-small text-ink-on-black">
            {subscribed ? "Renews until you cancel." : "Start a plan for any plant to unlock My Garden and Ask Loamy."}
          </p>
        </div>
      </HeroCard>

      <Card className="overflow-hidden">
        <ul>
          {ROWS.map((r) => (
            <li key={r.label} className="border-b border-line-soft last:border-b-0">
              <Link href={r.href} className="flex items-center gap-3.5 px-4 py-3.5 font-medium hover:bg-[#fafaf8]">
                <IconTile icon={r.icon} colour={r.colour} size={40} />
                <span className="flex-1">{r.label}</span>
                <Icon name="chevron" size={18} className="text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <form action={logout}>
        <Button type="submit" variant="secondary" full>
          <Icon name="logout" size={18} />
          Sign out
        </Button>
      </form>
    </Page>
  );
}
