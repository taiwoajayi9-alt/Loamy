import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { growingPlanInputs, growingPlans, plantCategories, plantGrowthStages, plantSuitabilityRules, plants } from "@/db/schema";
import { evaluate, type Outcome, type Rule } from "@/lib/grow/suitability";
import type { Answers } from "@/lib/grow/questions";

/**
 * Plans made before sign-up are remembered in a functional (not analytics) cookie, so the
 * visitor can see their preview and keep it when they create an account.
 */
export const PLAN_COOKIE = "loamy_plans";
const MAX_PLANS_IN_COOKIE = 10;

async function cookiePlanIds(): Promise<string[]> {
  const raw = (await cookies()).get(PLAN_COOKIE)?.value ?? "";
  return raw.split(".").filter((x) => /^[0-9a-f-]{36}$/.test(x));
}

async function rememberPlan(id: string) {
  const ids = [id, ...(await cookiePlanIds()).filter((x) => x !== id)].slice(0, MAX_PLANS_IN_COOKIE);
  (await cookies()).set(PLAN_COOKIE, ids.join("."), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getGrowPlant(slug: string) {
  const [row] = await db
    .select({ id: plants.id, slug: plants.slug, commonName: plants.commonName, category: plantCategories.name })
    .from(plants)
    .innerJoin(plantCategories, eq(plantCategories.id, plants.categoryId))
    .where(and(eq(plants.slug, slug), eq(plants.status, "published")))
    .limit(1);
  return row ?? null;
}

async function rulesFor(plantIds: string[]) {
  if (!plantIds.length) return new Map<string, Rule[]>();
  const rows = await db
    .select()
    .from(plantSuitabilityRules)
    .where(and(inArray(plantSuitabilityRules.plantId, plantIds), eq(plantSuitabilityRules.status, "published"), isNull(plantSuitabilityRules.varietyId)));
  const out = new Map<string, Rule[]>();
  for (const r of rows) {
    const list = out.get(r.plantId) ?? [];
    list.push({ priority: r.priority, condition: r.condition as Rule["condition"], outcome: r.outcome, reason: r.reason });
    out.set(r.plantId, list);
  }
  return out;
}

export type PlanSnapshot = { answers: Answers; outcome: Outcome; reasons: string[]; plantName: string; generatedAt: string };

/** Creates a preview plan from the visitor's answers and remembers it in their browser. */
export async function createPreviewPlan(plant: { id: string; commonName: string }, answers: Answers, userId: string | null) {
  const rules = (await rulesFor([plant.id])).get(plant.id) ?? [];
  const verdict = evaluate(rules, answers);
  const snapshot: PlanSnapshot = { answers, ...verdict, plantName: plant.commonName, generatedAt: new Date().toISOString() };
  const id = await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(growingPlans)
      .values({
        plantId: plant.id,
        userId,
        status: "preview",
        suitability: verdict.outcome,
        suitabilityReason: verdict.reasons.join("\n") || null,
        ruleVersion: 1,
        snapshot,
        generatedAt: new Date(),
      })
      .returning({ id: growingPlans.id });
    const entries = Object.entries(answers).filter(([, v]) => v);
    if (entries.length) await tx.insert(growingPlanInputs).values(entries.map(([k, v]) => ({ planId: plan.id, inputKey: k, inputValue: v })));
    return plan.id;
  });
  if (!userId) await rememberPlan(id);
  return id;
}

/** A plan is visible to its owner, or to the browser that created it before sign-up. */
export async function getPlanForViewer(planId: string, userId: string | null) {
  const plan = await db.query.growingPlans.findFirst({ where: eq(growingPlans.id, planId) });
  if (!plan) return null;
  const mine = plan.userId ? plan.userId === userId : (await cookiePlanIds()).includes(plan.id);
  if (!mine) return null;
  const [plant] = await db
    .select({ id: plants.id, slug: plants.slug, commonName: plants.commonName })
    .from(plants)
    .where(eq(plants.id, plan.plantId));
  const stages = await db
    .select({ name: plantGrowthStages.name, typicalTiming: plantGrowthStages.typicalTiming })
    .from(plantGrowthStages)
    .where(eq(plantGrowthStages.plantId, plan.plantId))
    .orderBy(asc(plantGrowthStages.sequence));
  return { plan, plant, stages, snapshot: plan.snapshot as PlanSnapshot };
}

/** Other published plants that suit the same answers, for when the chosen one doesn't. */
export async function suggestAlternatives(answers: Answers, excludePlantId: string, limit = 3) {
  const candidates = await db
    .select({ id: plants.id, slug: plants.slug, commonName: plants.commonName, summaryLine: plants.summaryLine })
    .from(plants)
    .where(and(eq(plants.status, "published"), eq(plants.isSample, false)))
    .orderBy(asc(plants.commonName));
  const others = candidates.filter((c) => c.id !== excludePlantId);
  const rules = await rulesFor(others.map((o) => o.id));
  // Only suggest plants that have suitability rules; no rules means we can't vouch for the match.
  const scored = others.filter((o) => rules.has(o.id)).map((o) => ({ ...o, outcome: evaluate(rules.get(o.id)!, answers).outcome }));
  return [...scored.filter((s) => s.outcome === "suitable"), ...scored.filter((s) => s.outcome === "conditional")].slice(0, limit);
}

/** After sign-up or login, attach plans made in this browser to the account. */
export async function claimBrowserPlans(userId: string): Promise<number> {
  const ids = await cookiePlanIds();
  if (!ids.length) return 0;
  const claimed = await db
    .update(growingPlans)
    .set({ userId })
    .where(and(inArray(growingPlans.id, ids), isNull(growingPlans.userId)))
    .returning({ id: growingPlans.id });
  return claimed.length;
}

export async function latestPlanForUser(userId: string) {
  const [row] = await db
    .select({ id: growingPlans.id, plantId: growingPlans.plantId, slug: plants.slug, commonName: plants.commonName, suitability: growingPlans.suitability })
    .from(growingPlans)
    .innerJoin(plants, eq(plants.id, growingPlans.plantId))
    .where(eq(growingPlans.userId, userId))
    .orderBy(desc(growingPlans.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Claims one specific plan by id for a newly signed-in member when it has no owner yet and was made
 * in the last day. Covers confirming email in a different browser (where the plan cookie is missing).
 * Plan ids are random UUIDs passed only through the member's own sign-up link.
 */
export async function claimPlanById(userId: string, planId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db
    .update(growingPlans)
    .set({ userId })
    .where(and(eq(growingPlans.id, planId), isNull(growingPlans.userId), gte(growingPlans.createdAt, since)));
}
