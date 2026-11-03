import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiConversations,
  aiEscalations,
  aiMessages,
  aiResponseFeedback,
  careTaskTemplates,
  gardenPlants,
  gardens,
  plantContentSections,
  plants,
  users,
} from "@/db/schema";
import { buildAskPrompt, DAILY_QUESTION_LIMIT, HISTORY_TURNS, mentionedPlants, SECTION_PRIORITY, tidyAnswer, type KnowledgeSection, type MemberPlant } from "@/lib/ai/ask";
import { describeRule, lagosDay, daysBetween, type TimingRule } from "@/lib/care";
import { approvedByType, PILLARS } from "@/lib/plant-workflow";
import type { Answers } from "@/lib/grow/questions";
import { aiDraftConfigured, aiDraftProvider, complete } from "./ai/plant-draft";
import { trackServer } from "./analytics";
import type { SessionUser } from "./auth";
import { getGardenPlant } from "./garden";
import type { PlanSnapshot } from "./grow";

export class AskError extends Error {}

export const askConfigured = aiDraftConfigured;

function startOfLagosDay(): Date {
  return new Date(`${lagosDay(new Date())}T00:00:00+01:00`);
}

export async function questionsLeftToday(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(and(eq(aiConversations.userId, userId), eq(aiMessages.role, "user"), gte(aiMessages.createdAt, startOfLagosDay())));
  return Math.max(0, DAILY_QUESTION_LIMIT - (r?.n ?? 0));
}

async function ownedConversation(userId: string, id: string) {
  return db.query.aiConversations.findFirst({ where: and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)) });
}

/** Reviewed sections (latest approved version) for the given plants, most useful pillars first. */
async function knowledgeFor(plantIds: string[]): Promise<KnowledgeSection[]> {
  if (!plantIds.length) return [];
  const [rows, names] = await Promise.all([
    db
      .select()
      .from(plantContentSections)
      .where(and(inArray(plantContentSections.plantId, plantIds), eq(plantContentSections.status, "published"), eq(plantContentSections.reviewStatus, "approved"))),
    db.select({ id: plants.id, name: plants.commonName }).from(plants).where(inArray(plants.id, plantIds)),
  ]);
  const out: KnowledgeSection[] = [];
  for (const pid of plantIds) {
    const approved = approvedByType(rows.filter((r) => r.plantId === pid));
    for (const type of SECTION_PRIORITY) {
      const s = approved.get(type);
      if (s) out.push({ id: s.id, plant: names.find((n) => n.id === pid)?.name ?? "", label: PILLARS.find((p) => p.type === type)!.label, title: s.title, body: s.body });
    }
  }
  return out.slice(0, 12);
}

async function careFor(plantIds: string[]) {
  if (!plantIds.length) return [];
  const rows = await db
    .select({ title: careTaskTemplates.title, instructions: careTaskTemplates.instructions, timingRule: careTaskTemplates.timingRule, plant: plants.commonName })
    .from(careTaskTemplates)
    .innerJoin(plants, eq(plants.id, careTaskTemplates.plantId))
    .where(and(inArray(careTaskTemplates.plantId, plantIds), eq(careTaskTemplates.status, "published"), eq(careTaskTemplates.reviewStatus, "approved")));
  return rows.map((r) => ({ plant: r.plant, title: r.title, instructions: r.instructions, rule: describeRule(r.timingRule as TimingRule) }));
}

/** Asks Loamy a question in a conversation (new or existing). Returns the conversation id. */
export async function askLoamy(user: SessionUser, opts: { conversationId?: string | null; gardenPlantId?: string | null; question: string }): Promise<string> {
  if (!askConfigured()) throw new AskError("Ask Loamy isn't switched on yet.");
  if ((await questionsLeftToday(user.id)) <= 0) throw new AskError(`You've asked ${DAILY_QUESTION_LIMIT} questions today. Ask Loamy will be ready for more tomorrow. For anything urgent, tap "Ask the Loamy team".`);

  // Conversation (and its plant, if any) must belong to this member.
  let conv = opts.conversationId ? await ownedConversation(user.id, opts.conversationId) : null;
  if (opts.conversationId && !conv) throw new AskError("We couldn't find that conversation.");
  let gardenPlantId = conv?.gardenPlantId ?? opts.gardenPlantId ?? null;
  const focusData = gardenPlantId ? await getGardenPlant(user.id, gardenPlantId) : null;
  if (gardenPlantId && !focusData) gardenPlantId = null;

  const isNew = !conv;
  if (!conv) {
    [conv] = await db
      .insert(aiConversations)
      .values({ userId: user.id, gardenPlantId, contextType: gardenPlantId ? "garden_plant" : "general" })
      .returning();
  }

  // What the member is growing.
  const mine = await db
    .select({ plantId: gardenPlants.plantId, nickname: gardenPlants.nickname, commonName: plants.commonName })
    .from(gardenPlants)
    .innerJoin(gardens, eq(gardens.id, gardenPlants.gardenId))
    .innerJoin(plants, eq(plants.id, gardenPlants.plantId))
    .where(and(eq(gardens.userId, user.id), eq(gardenPlants.status, "active")));

  // Retrieval: the focus plant, plants named in the question, else the member's garden (up to 3).
  const published = await db.select({ id: plants.id, commonName: plants.commonName, localNames: plants.localNames }).from(plants).where(eq(plants.status, "published"));
  const named = mentionedPlants(opts.question, published.map((p) => ({ id: p.id, names: [p.commonName, ...p.localNames] })));
  const ids = [...new Set([...(focusData ? [focusData.plant.id] : []), ...named, ...(named.length || focusData ? [] : mine.map((m) => m.plantId).slice(0, 3))])].slice(0, 4);
  const [knowledge, care] = await Promise.all([knowledgeFor(ids), careFor(ids)]);

  let focus: MemberPlant | null = null;
  if (focusData) {
    const plan = focusData.gp.planId ? await db.query.growingPlans.findFirst({ where: (g, { eq: e }) => e(g.id, focusData.gp.planId!) }) : null;
    const answers = ((plan?.snapshot as PlanSnapshot | null)?.answers ?? {}) as Answers;
    focus = {
      name: focusData.gp.nickname || focusData.plant.commonName,
      commonName: focusData.plant.commonName,
      daysGrowing: focusData.gp.plantingDate ? daysBetween(focusData.gp.plantingDate, lagosDay(new Date())) : null,
      stage: focusData.stages.find((s) => s.id === focusData.gp.growthStageId)?.name ?? null,
      method: focusData.gp.growingMethod,
      space: answers.space ?? null,
      sun: answers.sun ?? null,
      water: answers.water ?? null,
      recent: focusData.activities.slice(0, 6).map((a) => `${a.customLabel ?? a.activityType} (${lagosDay(a.performedAt)})${a.notes ? `: ${a.notes.slice(0, 120)}` : ""}`),
      openTasks: focusData.tasks.map((t) => t.title),
    };
  }

  const history = (
    await db.select({ role: aiMessages.role, content: aiMessages.content }).from(aiMessages).where(eq(aiMessages.conversationId, conv.id)).orderBy(desc(aiMessages.createdAt)).limit(HISTORY_TURNS * 2)
  )
    .reverse()
    .filter((m): m is { role: "user" | "assistant"; content: string } => m.role !== "system");

  const { system, user: prompt } = buildAskPrompt({
    question: opts.question,
    focus,
    gardenPlants: mine.map((m) => m.nickname || m.commonName),
    knowledge,
    care,
    history,
  });

  await db.insert(aiMessages).values({ conversationId: conv.id, role: "user", content: opts.question });
  const started = Date.now();
  let answer: string;
  try {
    answer = tidyAnswer(await complete(system, prompt));
    if (!answer) throw new Error("empty");
  } catch (err) {
    console.error("[ask]", err);
    throw new AskError(err instanceof Error && err.message.startsWith("AI drafting failed") ? err.message.replace("AI drafting failed", "Ask Loamy couldn't answer") : "Ask Loamy couldn't answer just now. Try again in a minute.");
  }
  await db.insert(aiMessages).values({
    conversationId: conv.id,
    role: "assistant",
    content: answer,
    model: `${aiDraftProvider()}:${process.env.AI_DRAFT_MODEL || "default"}`,
    knowledgeSourceIds: knowledge.map((k) => k.id),
    latencyMs: Date.now() - started,
  });
  await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conv.id));
  // Analytics never receive message text.
  if (isNew) await trackServer("ai_conversation_started", { context_type: conv.contextType }, user.id);
  await trackServer("ai_message_sent", { context_type: conv.contextType }, user.id);
  return conv.id;
}

export async function listConversations(userId: string) {
  return db
    .select({
      id: aiConversations.id,
      contextType: aiConversations.contextType,
      updatedAt: aiConversations.updatedAt,
      plantName: sql<string | null>`(select coalesce(${gardenPlants.nickname}, ${plants.commonName}) from ${gardenPlants} join ${plants} on ${plants.id} = ${gardenPlants.plantId} where ${gardenPlants.id} = ${aiConversations.gardenPlantId})`,
      firstQuestion: sql<string | null>`(select ${aiMessages.content} from ${aiMessages} where ${aiMessages.conversationId} = ${aiConversations.id} and ${aiMessages.role} = 'user' order by ${aiMessages.createdAt} limit 1)`,
    })
    .from(aiConversations)
    .where(eq(aiConversations.userId, userId))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(30);
}

export async function getConversation(userId: string, id: string) {
  const conv = await ownedConversation(userId, id);
  if (!conv) return null;
  const [messages, feedback, escalation, plant] = await Promise.all([
    db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.createdAt)),
    db.select().from(aiResponseFeedback).where(eq(aiResponseFeedback.userId, userId)),
    db.query.aiEscalations.findFirst({ where: eq(aiEscalations.conversationId, id), orderBy: desc(aiEscalations.createdAt) }),
    conv.gardenPlantId
      ? db.select({ name: sql<string>`coalesce(${gardenPlants.nickname}, ${plants.commonName})` }).from(gardenPlants).innerJoin(plants, eq(plants.id, gardenPlants.plantId)).where(eq(gardenPlants.id, conv.gardenPlantId)).then((r) => r[0]?.name ?? null)
      : Promise.resolve(null),
  ]);
  return { conv, messages, feedback: new Map(feedback.map((f) => [f.messageId, f])), escalation, plantName: plant };
}

export async function rateAnswer(user: SessionUser, messageId: string, helpful: boolean, issueType: string | null) {
  const [msg] = await db
    .select({ id: aiMessages.id })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(and(eq(aiMessages.id, messageId), eq(aiMessages.role, "assistant"), eq(aiConversations.userId, user.id)));
  if (!msg) throw new AskError("We couldn't find that answer.");
  await db
    .insert(aiResponseFeedback)
    .values({ messageId, userId: user.id, helpful, issueType })
    .onConflictDoUpdate({ target: [aiResponseFeedback.messageId, aiResponseFeedback.userId], set: { helpful, issueType } });
  await trackServer("ai_response_feedback", issueType ? { helpful, issue_type: issueType } : { helpful }, user.id);
}

/** Hands a conversation to the Loamy team. One open request per conversation. */
export async function escalate(user: SessionUser, conversationId: string, reason: string) {
  const conv = await ownedConversation(user.id, conversationId);
  if (!conv) throw new AskError("We couldn't find that conversation.");
  const open = await db.query.aiEscalations.findFirst({ where: and(eq(aiEscalations.conversationId, conversationId), inArray(aiEscalations.status, ["open", "in_progress"])) });
  if (open) return;
  await db.insert(aiEscalations).values({ conversationId, reason });
}

// ── Admin: the help inbox ──────────────────────────────────────

export async function listEscalations(status: "open" | "all") {
  return db
    .select({ esc: aiEscalations, email: users.email, conversationId: aiConversations.id })
    .from(aiEscalations)
    .innerJoin(aiConversations, eq(aiConversations.id, aiEscalations.conversationId))
    .innerJoin(users, eq(users.id, aiConversations.userId))
    .where(status === "open" ? inArray(aiEscalations.status, ["open", "in_progress"]) : sql`true`)
    .orderBy(desc(aiEscalations.createdAt))
    .limit(100);
}

export async function getEscalation(id: string) {
  const [row] = await db
    .select({ esc: aiEscalations, email: users.email, userId: users.id })
    .from(aiEscalations)
    .innerJoin(aiConversations, eq(aiConversations.id, aiEscalations.conversationId))
    .innerJoin(users, eq(users.id, aiConversations.userId))
    .where(eq(aiEscalations.id, id));
  if (!row) return null;
  const messages = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, row.esc.conversationId)).orderBy(asc(aiMessages.createdAt));
  return { ...row, messages };
}

export async function setEscalationStatus(actorId: string, id: string, status: "open" | "in_progress" | "resolved") {
  await db
    .update(aiEscalations)
    .set({ status, assignedTo: status === "in_progress" ? actorId : undefined, resolvedAt: status === "resolved" ? new Date() : null })
    .where(eq(aiEscalations.id, id));
}
