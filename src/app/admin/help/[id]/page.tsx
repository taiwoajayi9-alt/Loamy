import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { SubmitButton } from "@/components/submit-button";
import { Card, FormNotice, Tag } from "@/components/ui";
import { formatPhone } from "@/lib/shop";
import { db } from "@/db/client";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEscalation } from "@/server/ask";
import { requireHelpDesk } from "@/server/help-admin";
import { helpStatusAction } from "../actions";

export const metadata: Metadata = { title: "Help request" };
export const dynamic = "force-dynamic";
const fmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

export default async function HelpRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  await requireHelpDesk(`/admin/help/${id}`);
  const { notice } = await searchParams;
  const data = await getEscalation(id);
  if (!data) notFound();
  const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, data.userId) });
  return (
    <>
      <Link href="/admin/help" className="text-small font-semibold text-ink-muted hover:underline">← Help requests</Link>
      <h1 className="text-title">Help request</h1>
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      <Card className="flex flex-col gap-1.5 p-5">
        <p className="font-semibold">{data.esc.reason}</p>
        <p className="text-small text-ink-muted">{fmt.format(data.esc.createdAt)}</p>
        <p className="text-small">
          {profile?.firstName ? `${profile.firstName} · ` : ""}
          <a href={`mailto:${data.email}`} className="underline">{data.email}</a>
          {profile?.phone ? <> · <a href={`tel:${profile.phone}`} className="underline">{formatPhone(profile.phone)}</a></> : null}
        </p>
        <Tag tone={data.esc.status === "resolved" ? "leaf" : "lemon"} className="self-start">{data.esc.status.replace("_", " ")}</Tag>
      </Card>
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">Conversation</h2>
        <ol className="flex flex-col gap-3 text-small">
          {data.messages.filter((m) => m.role !== "system").map((m) => (
            <li key={m.id} className={m.role === "user" ? "rounded-2xl bg-chip p-3" : "rounded-2xl border border-line p-3"}>
              <span className="mb-1 block text-xs font-semibold uppercase text-ink-muted">{m.role === "user" ? "Member" : "Ask Loamy"} · {fmt.format(m.createdAt)}</span>
              <span className="whitespace-pre-line">{m.content}</span>
            </li>
          ))}
        </ol>
      </Card>
      <div className="flex flex-wrap gap-2">
        {(["in_progress", "resolved", "open"] as const).filter((s) => s !== data.esc.status).map((s) => (
          <form key={s} action={helpStatusAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={s} />
            <SubmitButton variant={s === "resolved" ? "primary" : "secondary"} pendingLabel="…">{s === "in_progress" ? "I’m on it" : s === "resolved" ? "Mark resolved" : "Reopen"}</SubmitButton>
          </form>
        ))}
      </div>
      <p className="text-small text-ink-muted">Reply to the member by phone or email. Replies inside the app come later.</p>
    </>
  );
}
