import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormNotice, Icon, Page, Tag } from "@/components/ui";
import { MAX_QUESTION_CHARS } from "@/lib/ai/ask";
import { requireEntitlement } from "@/server/auth";
import { askConfigured, getConversation, questionsLeftToday } from "@/server/ask";
import { askAction, escalateAction, feedbackAction } from "../actions";

export const metadata: Metadata = { title: "Ask Loamy" };
export const dynamic = "force-dynamic";

/** Plain-text answers: blank lines split paragraphs, "- " lines become a list. */
function Answer({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2.5 leading-relaxed">
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length && lines.every((l) => /^[-*•]\s/.test(l)))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{l.replace(/^[-*•]\s/, "").replace(/\*\*/g, "")}</li>)}
            </ul>
          );
        return <p key={i}>{lines.join(" ").replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
}

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireEntitlement(`/ask-loamy/${id}`, "ask_loamy");
  const { notice, error } = await searchParams;
  const data = await getConversation(user.id, id);
  if (!data) notFound();
  const left = await questionsLeftToday(user.id);
  const lastAssistant = [...data.messages].reverse().find((m) => m.role === "assistant");
  const escalated = data.escalation && data.escalation.status !== "resolved";

  return (
    <Page className="pb-nav-clearance">
      <Link href="/ask-loamy" className="flex items-center gap-1.5 self-start text-small font-semibold">
        <Icon name="back" size={18} /> Ask Loamy
      </Link>
      {data.plantName ? <Tag tone="leaf" className="self-start">About your {data.plantName}</Tag> : null}
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <ol className="flex flex-col gap-3">
        {data.messages.filter((m) => m.role !== "system").map((m) => {
          const fb = data.feedback.get(m.id);
          return (
            <li key={m.id} id={m.id === lastAssistant?.id ? "latest" : undefined} className={m.role === "user" ? "self-end max-w-[85%]" : "max-w-full"}>
              {m.role === "user" ? (
                <div className="rounded-[20px] rounded-br-md bg-ink px-4 py-3 text-white">{m.content}</div>
              ) : (
                <Card className="flex flex-col gap-3 p-4">
                  <span className="text-eyebrow uppercase text-ink-muted">Loamy</span>
                  <Answer text={m.content} />
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {fb ? (
                      <span className="text-xs text-ink-muted">{fb.helpful ? "You found this helpful" : "Thanks for your feedback"}</span>
                    ) : (
                      <>
                        <span className="text-xs text-ink-muted">Was this helpful?</span>
                        {(["yes", "no"] as const).map((v) => (
                          <form key={v} action={feedbackAction}>
                            <input type="hidden" name="conversationId" value={id} />
                            <input type="hidden" name="messageId" value={m.id} />
                            <input type="hidden" name="helpful" value={v} />
                            <button type="submit" className="min-h-[36px] rounded-full border border-line-strong px-3.5 text-xs font-semibold hover:bg-chip">{v === "yes" ? "Yes" : "No"}</button>
                          </form>
                        ))}
                      </>
                    )}
                  </div>
                </Card>
              )}
            </li>
          );
        })}
      </ol>

      {askConfigured() ? (
        <form action={askAction} className="flex flex-col gap-2">
          <input type="hidden" name="conversationId" value={id} />
          <label htmlFor="follow" className="text-small font-semibold">Ask a follow-up</label>
          <textarea id="follow" name="question" required rows={2} maxLength={MAX_QUESTION_CHARS} className="w-full rounded-2xl border border-line-strong bg-card px-4 py-3 text-[15px]" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">{left} questions left today</span>
            <SubmitButton pendingLabel="Loamy is thinking…">Ask</SubmitButton>
          </div>
        </form>
      ) : null}

      <Card className="flex flex-col gap-2 p-4">
        <p className="font-semibold">Need a person?</p>
        {escalated ? (
          <p className="text-small text-ink-muted">The Loamy team has your question and will get back to you by phone or email.</p>
        ) : (
          <form action={escalateAction} className="flex flex-col gap-2">
            <input type="hidden" name="conversationId" value={id} />
            <p className="text-small text-ink-muted">If something looks serious, or the answer didn’t help, send this conversation to the Loamy team.</p>
            <input name="reason" maxLength={500} placeholder="What do you need help with? (optional)" className="min-h-[46px] rounded-2xl border border-line-strong bg-card px-4 text-[15px]" />
            <SubmitButton variant="secondary" pendingLabel="Sending…">Ask the Loamy team</SubmitButton>
          </form>
        )}
      </Card>
    </Page>
  );
}
