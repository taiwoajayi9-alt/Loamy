import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackEvent } from "@/components/analytics";
import { ButtonLink, EmptyState, Icon, Page, PhotoPlaceholder, Tag } from "@/components/ui";
import { getPublishedPlant } from "@/server/catalogue";

export const dynamic = "force-dynamic";

const PILLARS = ["Meet the plant", "Good for you", "Could you grow it?", "Your journey", "Enjoy it", "Let's grow it"];

export default async function PlantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await getPublishedPlant(slug);
  if (res.ok && !res.data) notFound();

  if (!res.ok) {
    return (
      <Page>
        <EmptyState title="We can't load this plant right now" body="Check your connection and try again in a moment." />
      </Page>
    );
  }
  const plant = res.data!;

  return (
    <Page className="gap-5 pt-0">
      <TrackEvent name="plant_profile_viewed" props={{ plant_id: plant.slug, category: plant.category }} />
      <div className="relative -mx-4">
        <PhotoPlaceholder label={`${plant.commonName.toLowerCase()} in daylight`} className="h-[300px]" />
        <Link
          href="/discover"
          aria-label="Back to Discover"
          className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90"
        >
          <Icon name="back" />
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <Tag className="self-start">{plant.category}</Tag>
        <h1 className="mt-1.5 text-title">{plant.commonName}</h1>
        {plant.botanicalName ? <p className="italic text-ink-muted">{plant.botanicalName}</p> : null}
        {plant.tagline ? <p className="mt-1">{plant.tagline}</p> : null}
        {plant.isSample ? <p className="text-small text-ink-muted">Sample content for development.</p> : null}
      </div>

      <nav aria-label="About this plant" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {PILLARS.map((p, i) => (
          <span
            key={p}
            className={
              i === 0
                ? "flex min-h-[38px] flex-none items-center rounded-full bg-ink px-4 text-small font-semibold text-white"
                : "flex min-h-[38px] flex-none items-center rounded-full border border-line-strong bg-card px-4 text-small font-semibold"
            }
          >
            {p}
          </span>
        ))}
      </nav>

      <EmptyState
        title="Profile sections arrive in Phase 1"
        body="The six sections load from reviewed, published content once the plant library and expert review are built."
      />

      <ButtonLink href={`/grow/${plant.slug}`} full>
        Can I grow this here?
      </ButtonLink>
    </Page>
  );
}
