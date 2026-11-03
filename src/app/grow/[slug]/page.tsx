import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TrackEvent } from "@/components/analytics";
import { FormNotice, Page } from "@/components/ui";
import { getGrowPlant } from "@/server/grow";
import { GrowStepper } from "./grow-stepper";

export const metadata: Metadata = { title: "Can I grow this here?" };
export const dynamic = "force-dynamic";

/** Public: visitors answer a few questions and see a free plan preview before signing up (owner decision). */
export default async function GrowPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const plant = await getGrowPlant(slug).catch(() => null);
  if (!plant) notFound();
  return (
    <Page className="pb-10">
      <TrackEvent name="growing_plan_started" props={{ plant_id: plant.slug }} />
      {error ? <FormNotice tone="error">Answer every question to see your plan.</FormNotice> : null}
      <GrowStepper slug={plant.slug} plantName={plant.commonName} />
    </Page>
  );
}
