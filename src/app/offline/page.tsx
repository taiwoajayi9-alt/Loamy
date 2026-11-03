import { HeroCard, Page, Tag } from "@/components/ui";

export const metadata = { title: "You're offline" };

export default function OfflinePage() {
  return (
    <Page>
      <HeroCard>
        <Tag tone="lemon" className="self-start">Offline</Tag>
        <h1 className="text-hero">You&apos;re offline right now.</h1>
        <p className="text-ink-on-black">Your garden is safe. Reconnect and we&apos;ll pick up where you left off.</p>
      </HeroCard>
    </Page>
  );
}
