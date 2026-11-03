"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parseAnswers } from "@/lib/grow/questions";
import { getSessionUser } from "@/server/auth";
import { createPreviewPlan, getGrowPlant } from "@/server/grow";

export async function createPlanAction(slug: string, raw: Record<string, string>) {
  const plant = await getGrowPlant(z.string().max(80).parse(slug));
  if (!plant) redirect("/discover");
  let answers;
  try {
    answers = parseAnswers(raw);
  } catch {
    redirect(`/grow/${plant.slug}?error=1`);
  }
  const user = await getSessionUser();
  const id = await createPreviewPlan(plant, answers, user?.id ?? null);
  redirect(`/grow/${plant.slug}/plan/${id}`);
}
