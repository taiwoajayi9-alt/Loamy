import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { addToGardenAction } from "@/app/(app)/garden/actions";
import { TrackEvent } from "@/components/analytics";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, HeroCard, Icon, Page, Tag } from "@/components/ui";
import { answerLabel, type Answers } from "@/lib/grow/questions";
import { OUTCOME_HEADLINE, type Outcome } from "@/lib/grow/suitability";
import { getSessionUser, userHasEntitlement } from "@/server/auth";
import { getPlanForViewer, suggestAlternatives } from "@/server/grow";

export const metadata: Metadata = { title: "Your plan preview" };
export const dynamic = "force-dynamic";

const VERDICT_TAG: Record<Outcome, { label: string; tone: "lemon" | "peach" | "leaf" }> = {
  suitable: { label: "Good match", tone: "lemon" },
  conditional: { label: "Possible, with tweaks", tone: "lemon" },
  unsuitable: { label: "Not a good match", tone: "peach" },
};

const LOCKED = [
  "Step-by-step planting and setup for your space",
  "Daily care tasks, matched to your sun and watering",
  "Ask Loamy, your gardening companion",
  "Track growth, milestones and harvests",
];

const ANSWER_ROWS: { key: keyof Answers; label: string }[] = [
  { key: "space", label: "Where" },
  { key: "sun", label: "Sun" },
  { key: "method", label: "Growing in" },
  { key: "water", label: "Watering" },
  { key: "experience", label: "Experience" },
];

export default async function PlanPreview({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await getSessionUser();
  const data = await getPlanForViewer(id, user?.id ?? null);
  if (!data || data.plant.slug !== slug) notFound();
  const { plant, stages, snapshot } = data;
  const outcome = snapshot.outcome;
  const subscribed = user ? await userHasEntitlement(user.id, "growing_plans") : false;
  const alternatives = outcome === "unsuitable" ? await suggestAlternatives(snapshot.answers, plant.id) : [];
  const next = `/subscribe?plan=${id}`;

  return (
    <Page className="pb-12">
      <TrackEvent name="growing_plan_preview_viewed" props={{ plant_id: plant.slug }} />
      <Link href={`/plants/${plant.slug}`} className="flex items-center gap-1.5 self-start text-small font-semibold">
        <Icon name="back" size={18} /> {plant.commonName}
      </Link>

      <HeroCard className="gap-3 px-[22px] py-6">
        <Tag tone={VERDICT_TAG[outcome].tone} className="self-start">{VERDICT_TAG[outcome].label}</Tag>
        <h1 className="text-title">{OUTCOME_HEADLINE[outcome](plant.commonName)}</h1>
        {snapshot.reasons.length ? (
          <ul className="flex flex-col gap-2 text-ink-on-black">
            {snapshot.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-lemon" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-on-black">Your spot matches what {plant.commonName.toLowerCase()} needs. Here’s a taste of your plan.</p>
        )}
      </HeroCard>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Your space</h2>
          <Link href={`/grow/${plant.slug}`} className="text-small font-semibold underline decoration-lemon decoration-2 underline-offset-4">
            Change answers
          </Link>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small">
          {ANSWER_ROWS.filter((r) => snapshot.answers[r.key]).map((r) => (
            <div key={r.key} className="contents">
              <dt className="text-ink-muted">{r.label}</dt>
              <dd className="font-medium">{answerLabel(r.key, snapshot.answers[r.key])}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {alternatives.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="alts">
          <h2 id="alts" className="text-lg font-semibold">These would love your space</h2>
          {alternatives.map((a) => (
            <Link key={a.id} href={`/grow/${a.slug}`}>
              <Card className="flex items-center gap-3 p-4 hover:border-line-strong">
                <div className="flex-1">
                  <p className="font-semibold">{a.commonName}</p>
                  {a.summaryLine ? <p className="text-small text-ink-muted">{a.summaryLine}</p> : null}
                </div>
                <Tag tone={a.outcome === "suitable" ? "leaf" : "grey"}>{a.outcome === "suitable" ? "Good match" : "With tweaks"}</Tag>
                <Icon name="chevron" size={18} />
              </Card>
            </Link>
          ))}
        </section>
      ) : null}

      {outcome !== "unsuitable" && stages.length ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Your journey</h2>
          <ol className="flex flex-col gap-2">
            {stages.map((s, i) => (
              <li key={s.name} className="flex items-center gap-3 text-small">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-chip font-semibold tabular-nums">{i + 1}</span>
                <span className="flex-1 font-medium">{s.name}</span>
                {s.typicalTiming ? <span className="text-ink-muted">{s.typicalTiming}</span> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {outcome !== "unsuitable" ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            <Icon name="lock" size={18} />
            <h2 className="font-semibold">Your full plan</h2>
          </div>
          <ul className="flex flex-col gap-2.5">
            {LOCKED.map((l) => (
              <li key={l} className="flex items-center gap-3 text-small">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-lemon">
                  <Icon name="check" size={14} />
                </span>
                {l}
              </li>
            ))}
          </ul>
          {subscribed ? (
            <form action={addToGardenAction}>
              <input type="hidden" name="planId" value={id} />
              <SubmitButton full size="md" pendingLabel="Adding…">Add to my garden</SubmitButton>
            </form>
          ) : user ? (
            <ButtonLink href={next} full>Unlock my full plan</ButtonLink>
          ) : (
            <>
              <ButtonLink href={`/register?next=${encodeURIComponent(next)}`} full>Save my plan and continue</ButtonLink>
              <p className="text-center text-small text-ink-muted">
                Free account first, then you choose how to subscribe.{" "}
                <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline">Log in</Link>
              </p>
            </>
          )}
        </Card>
      ) : (
        <ButtonLink href={`/plants/${plant.slug}`} variant="secondary" full>
          Back to {plant.commonName}
        </ButtonLink>
      )}
    </Page>
  );
}
