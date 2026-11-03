import Link from "next/link";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormNotice, Icon, Page, Tag } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { analyticsChoice, openDeletionRequest } from "@/server/privacy";
import { analyticsChoiceAction, cancelDeletionAction, requestDeletionAction } from "./actions";

export const metadata: Metadata = { title: "Privacy and data" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

export default async function PrivacyAndData({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser("/profile/privacy");
  const { notice, error } = await searchParams;
  const [choice, pending] = await Promise.all([analyticsChoice(), openDeletionRequest(user.id)]);

  return (
    <Page>
      <Link href="/profile" className="flex items-center gap-1 text-small font-semibold text-ink-muted">
        <Icon name="back" size={16} /> Profile
      </Link>
      <h1 className="text-title">Privacy and data</h1>
      <p className="text-ink-muted">
        Your data is yours. Read how we use it in our <Link href="/privacy" className="underline">privacy notice</Link>.
      </p>
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">Download my data</h2>
        <p className="text-small text-ink-muted">
          One file with your account, garden, plans, orders and Ask Loamy questions. Card details are held by Paystack, never by Loamy.
        </p>
        <a href="/profile/privacy/export" download className="self-start rounded-full border border-line-strong px-5 py-3 text-small font-semibold hover:bg-chip">
          Download my data
        </a>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Anonymous visit counts</h2>
          <Tag tone={choice === "granted" ? "leaf" : "grey"}>{choice === "granted" ? "On" : "Off"}</Tag>
        </div>
        <p className="text-small text-ink-muted">
          Counts which pages are used so we can improve Loamy. No ads, never sold, and it never includes what you type to Ask Loamy.
        </p>
        <form action={analyticsChoiceAction}>
          <input type="hidden" name="allow" value={choice === "granted" ? "0" : "1"} />
          <SubmitButton variant="secondary" pendingLabel="Saving…">{choice === "granted" ? "Turn off" : "Turn on"}</SubmitButton>
        </form>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">Delete my account</h2>
        {pending ? (
          <>
            <FormNotice tone="success">
              You asked us to delete your account on {dateFmt.format(pending.requestedAt)}. We’ll finish within 30 days, usually within a week. Your membership won’t renew.
            </FormNotice>
            <form action={cancelDeletionAction}>
              <SubmitButton variant="secondary" pendingLabel="Cancelling…">Keep my account</SubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="text-small text-ink-muted">
              We delete your garden, plans, photos, Ask Loamy questions, addresses and profile, and stop your membership renewing. We keep order and payment records
              for tax, with your name, phone and address removed. This can’t be undone, so download your data first if you want a copy.
            </p>
            <details className="rounded-2xl bg-chip p-4">
              <summary className="cursor-pointer text-small font-semibold text-danger-ink">I want to delete my account</summary>
              <form action={requestDeletionAction} className="mt-3 flex flex-col gap-3">
                <Field label="Anything we could do better? (optional)" name="reason" id="reason" maxLength={500} />
                <Field label="Type DELETE to confirm" name="confirm" id="confirm" required autoComplete="off" />
                <SubmitButton pendingLabel="Sending…">Ask to delete my account</SubmitButton>
              </form>
            </details>
          </>
        )}
      </Card>
    </Page>
  );
}
