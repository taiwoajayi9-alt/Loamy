"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { MAX_QUESTION_CHARS } from "@/lib/ai/ask";
import { requireEntitlement } from "@/server/auth";
import { askLoamy, AskError, escalate, rateAnswer } from "@/server/ask";

const uuid = z.string().uuid();
const optUuid = z.preprocess((v) => (v ? v : undefined), uuid.optional());

export async function askAction(form: FormData) {
  const user = await requireEntitlement("/ask-loamy", "ask_loamy");
  const conversationId = optUuid.parse(form.get("conversationId"));
  const gardenPlantId = optUuid.parse(form.get("gardenPlantId"));
  const question = String(form.get("question") ?? "").trim();
  const backTo = conversationId ? `/ask-loamy/${conversationId}` : `/ask-loamy${gardenPlantId ? `?plant=${gardenPlantId}` : ""}`;
  if (question.length < 3) redirect(`${backTo}${backTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("Type your question first.")}`);
  if (question.length > MAX_QUESTION_CHARS) redirect(`${backTo}${backTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(`Keep it under ${MAX_QUESTION_CHARS} characters.`)}`);
  let id: string;
  try {
    id = await askLoamy(user, { conversationId, gardenPlantId, question });
  } catch (err) {
    const msg = err instanceof AskError ? err.message : "Ask Loamy couldn't answer just now. Try again in a minute.";
    if (!(err instanceof AskError)) console.error("[ask]", err);
    redirect(`${backTo}${backTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
  }
  redirect(`/ask-loamy/${id}#latest`);
}

export async function feedbackAction(form: FormData) {
  const user = await requireEntitlement("/ask-loamy", "ask_loamy");
  const conversationId = uuid.parse(form.get("conversationId"));
  const helpful = form.get("helpful") === "yes";
  const issue = z.enum(["not_accurate", "not_relevant", "unclear", "unsafe", "other"]).optional().catch(undefined).parse(form.get("issue") || undefined);
  await rateAnswer(user, uuid.parse(form.get("messageId")), helpful, issue ?? null).catch(() => undefined);
  redirect(`/ask-loamy/${conversationId}?notice=${encodeURIComponent(helpful ? "Thanks! Glad that helped." : "Thanks for telling us. It helps us improve Ask Loamy.")}`);
}

export async function escalateAction(form: FormData) {
  const user = await requireEntitlement("/ask-loamy", "ask_loamy");
  const conversationId = uuid.parse(form.get("conversationId"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500) || "Member asked for help from the Loamy team.";
  await escalate(user, conversationId, reason);
  redirect(`/ask-loamy/${conversationId}?notice=${encodeURIComponent("Sent to the Loamy team. We'll get back to you by phone or email.")}`);
}
