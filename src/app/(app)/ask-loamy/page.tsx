import Link from "next/link";
import type { Metadata } from "next";
import { z } from "zod";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, FormNotice, HeroCard, Icon, Page, Tag } from "@/components/ui";
import { MAX_QUESTION_CHARS } from "@/lib/ai/ask";
import { env } from "@/lib/env";
import { getSessionUser, userHasEntitlement } from "@/server/auth";
import { askConfigured, listConversations, questionsLeftToday } from "@/server/ask";
import { getGardenOverview } from "@/server/garden";
import { askAction } from "./actions";

export const metadata: Metadata = { title: "Ask Loamy" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
const SUGGESTIONS = ["Why are my leaves turning yellow?", "How often should I water in the rainy season?", "When can I start harvesting?", "Something is eating the leaves. What should I check?"];

export default async function AskLoamyPage({ searchParams }: { searchParams: Promise<{ plant?: string; error?: string }> }) {
  const { plant: plantParam, error } = await searchParams;
  const user = env.authConfigured() ? await getSessionUser() : null;
  const entitled = user ? await userHasEntitlement(user.id, "ask_loamy") : false;

  if (!user || !entitled) {
    return (
      <Page>
        <h1 className="text-title">Ask Loamy</h1>
        <HeroCard className="gap-3">
          <Tag tone="lemon" className="self-start">For members</Tag>
          <p className="text-xl font-bold">Your gardening companion, for your plants and your space.</p>
          <p className="text-ink-on-black">Ask about watering, yellow leaves, pests or harvesting. Answers come from Loamy’s expert-checked plant guides and your own garden records.</p>
        </HeroCard>
        <ButtonLink href={user ? "/subscribe" : "/discover"} full>{user ? "See membership options" : "Find a plant to grow"}</ButtonLink>
      </Page>
    );
  }

  const [conversations, left, garden] = await Promise.all([listConversations(user.id), questionsLeftToday(user.id), getGardenOverview(user.id)]);
  const chosen = plantParam && z.string().uuid().safeParse(plantParam).success ? garden.plants.find((p) => p.id === plantParam) : undefined;
  const on = askConfigured();

  return (
    <Page>
      <h1 className="text-title">Ask Loamy</h1>
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <HeroCard className="gap-4">
        <div className="flex items-center justify-between">
          <span className="text-eyebrow uppercase text-lemon">New question</span>
          <span className="text-xs text-ink-on-black">{left} left today</span>
        </div>
        {on ? (
          <form action={askAction} className="flex flex-col gap-3">
            {garden.plants.length ? (
              <label className="flex flex-col gap-1.5 text-small font-semibold">
                About
                <select name="gardenPlantId" defaultValue={chosen?.id ?? ""} className="min-h-[46px] rounded-2xl bg-white/10 px-4 text-[15px] font-normal text-white">
                  <option value="" className="text-ink">Anything about growing</option>
                  {garden.plants.map((p) => (
                    <option key={p.id} value={p.id} className="text-ink">My {p.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label htmlFor="q" className="sr-only">Your question</label>
            <textarea
              id="q"
              name="question"
              required
              rows={3}
              maxLength={MAX_QUESTION_CHARS}
              placeholder="e.g. My basil leaves have brown spots. What should I check?"
              className="w-full rounded-2xl bg-white px-4 py-3 text-[15px] text-ink placeholder:text-[#8a8a86]"
            />
            <SubmitButton variant="lime" size="md" pendingLabel="Loamy is thinking…" full>Ask</SubmitButton>
            <p className="text-xs text-ink-on-black">Ask Loamy works from what you tell it and your garden records. It can’t see your plant, so describe what you notice.</p>
          </form>
        ) : (
          <p className="text-small text-ink-on-black">Ask Loamy isn’t switched on yet. Check back soon.</p>
        )}
      </HeroCard>

      {on && !conversations.length ? (
        <section className="flex flex-col gap-2" aria-labelledby="ideas-h">
          <h2 id="ideas-h" className="text-small font-semibold text-ink-muted">Not sure what to ask?</h2>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <span key={s} className="rounded-full border border-line-strong bg-card px-3.5 py-2 text-small">{s}</span>
            ))}
          </div>
        </section>
      ) : null}

      {conversations.length ? (
        <section className="flex flex-col gap-2" aria-labelledby="past-h">
          <h2 id="past-h" className="text-lg font-semibold">Your questions</h2>
          <ul className="flex flex-col gap-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/ask-loamy/${c.id}`}>
                  <Card className="flex items-center gap-3 p-4 hover:border-line-strong">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.firstQuestion ?? "Conversation"}</p>
                      <p className="text-small text-ink-muted">{c.plantName ? `${c.plantName} · ` : ""}{fmt.format(c.updatedAt)}</p>
                    </div>
                    <Icon name="chevron" size={18} />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Page>
  );
}
