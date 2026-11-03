"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { cancelDeletionRequest, requestDeletion, setAnalyticsChoice } from "@/server/privacy";

const PATH = "/profile/privacy";
const back = (key: "notice" | "error", msg: string): never => redirect(`${PATH}?${key}=${encodeURIComponent(msg)}`);

export async function analyticsChoiceAction(form: FormData) {
  const user = await requireUser(PATH);
  const allow = form.get("allow") === "1";
  await setAnalyticsChoice(user.id, allow);
  revalidatePath(PATH);
  back("notice", allow ? "Thanks. We’ll count anonymous visits to help improve Loamy." : "Done. We won’t count your visits.");
}

export async function requestDeletionAction(form: FormData) {
  const user = await requireUser(PATH);
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") back("error", "Type DELETE to confirm.");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500) || null;
  await requestDeletion(user, reason);
  revalidatePath(PATH);
  back("notice", "We’ve got your request. Your membership won’t renew, and we’ll delete your account within 30 days (usually within a week).");
}

export async function cancelDeletionAction() {
  const user = await requireUser(PATH);
  await cancelDeletionRequest(user.id);
  revalidatePath(PATH);
  back("notice", "Request cancelled. Your account stays as it is.");
}
