import { ButtonLink, EmptyState, Page } from "@/components/ui";

/** Public route: visitors personalise and preview before sign-up (owner decision). Built in Phase 2. */
export default async function GrowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Page>
      <h1 className="text-title">Can I grow this here?</h1>
      <EmptyState
        title="Personalisation arrives in Phase 2"
        body="Visitors will answer a few questions about their space and see a free plan preview, with no account needed."
        action={
          <ButtonLink href={`/plants/${slug}`} variant="secondary" size="sm">
            Back to the plant
          </ButtonLink>
        }
      />
    </Page>
  );
}
