import { ButtonLink, Page } from "@/components/ui";

export default function NotFound() {
  return (
    <Page>
      <h1 className="text-title">We couldn&apos;t find that page.</h1>
      <p className="text-ink-muted">It may have moved, or the plant isn&apos;t published yet.</p>
      <ButtonLink href="/discover">Back to Discover</ButtonLink>
    </Page>
  );
}
