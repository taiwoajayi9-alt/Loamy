import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackEvent } from "@/components/analytics";
import { ButtonLink, EmptyState, Icon, Page, PhotoPlaceholder, Tag } from "@/components/ui";
import { getPublishedPlant, getPublishedSections } from "@/server/catalogue";

export const dynamic = "force-dynamic";

/** Plain-text section bodies: blank lines split paragraphs, lines starting "- " become a list. */
function SectionBody({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length && lines.every((l) => l.startsWith("- ")))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        return <p key={i}>{lines.join(" ")}</p>;
      })}
    </div>
  );
}

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
  const content = await getPublishedSections(plant.id);
  const sections = content.ok ? content.data.sections : [];
  const sources = content.ok ? content.data.sources : [];

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

      {sections.length ? (
        <>
          <nav aria-label="About this plant" className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-canvas/95 px-4 py-2 backdrop-blur [scrollbar-width:none]">
            {sections.map((s) => (
              <a
                key={s.sectionType}
                href={`#${s.sectionType}`}
                className="flex min-h-[38px] flex-none items-center rounded-full border border-line-strong bg-card px-4 text-small font-semibold"
              >
                {s.label}
              </a>
            ))}
          </nav>
          {sections.map((s) => (
            <section key={s.sectionType} id={s.sectionType} aria-labelledby={`h-${s.sectionType}`} className="flex scroll-mt-16 flex-col gap-2">
              <p className="text-eyebrow uppercase text-ink-muted">{s.label}</p>
              <h2 id={`h-${s.sectionType}`} className="text-xl font-semibold">{s.title}</h2>
              <SectionBody text={s.body} />
            </section>
          ))}
          {sources.length ? (
            <details className="rounded-card bg-card p-4">
              <summary className="cursor-pointer text-small font-semibold">Where this comes from</summary>
              <p className="mt-2 text-small text-ink-muted">Checked by a plant expert before publishing.</p>
              <ul className="mt-2 flex flex-col gap-1 text-small">
                {sources.map((src) => (
                  <li key={`${src.title}-${src.url ?? ""}`}>
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer noopener" className="underline">{src.title}</a>
                    ) : (
                      src.title
                    )}
                    {src.publisher ? <span className="text-ink-muted"> · {src.publisher}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : (
        <EmptyState title="More about this plant is on the way" body="We're finishing this profile. Check back soon." />
      )}

      <ButtonLink href={`/grow/${plant.slug}`} full>
        Can I grow this here?
      </ButtonLink>
    </Page>
  );
}
