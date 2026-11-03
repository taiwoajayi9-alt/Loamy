"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { HARVEST_UNITS, lagosDay, MILESTONES, TASK_TYPES } from "@/lib/care";
import { requireEntitlement } from "@/server/auth";
import {
  addPlanToGarden,
  archiveGardenPlant,
  GardenError,
  handleTask,
  logActivity,
  recordHarvest,
  recordMilestone,
  setStage,
  updateGardenPlant,
} from "@/server/garden";
import { claimBrowserPlans } from "@/server/grow";

const uuid = z.string().uuid();
const optNote = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v));

async function member(next: string) {
  return requireEntitlement(next, "my_garden");
}

function back(path: string, key: "notice" | "error", msg: string): never {
  revalidatePath("/garden");
  revalidatePath(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
}

function errMsg(err: unknown) {
  if (err instanceof GardenError) return err.message;
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Check the form and try again.";
  console.error("[garden]", err);
  return "Something went wrong. Try again.";
}

export async function addToGardenAction(form: FormData) {
  const planId = uuid.parse(form.get("planId"));
  const user = await member("/garden");
  let id: string;
  try {
    await claimBrowserPlans(user.id); // a plan made before signing in belongs to this member now
    id = await addPlanToGarden(user, planId);
  } catch (err) {
    back("/garden", "error", errMsg(err));
  }
  revalidatePath("/garden");
  redirect(`/garden/plants/${id}?notice=${encodeURIComponent("Added to your garden. Your first care tasks are below.")}`);
}

export async function taskAction(form: FormData) {
  const user = await member("/garden");
  const raw = String(form.get("back") ?? "/garden");
  const to = raw.startsWith("/garden") && !raw.startsWith("//") ? raw : "/garden";
  let notice: string;
  try {
    const outcome = z.enum(["done", "skip"]).parse(form.get("outcome"));
    await handleTask(user, uuid.parse(form.get("taskId")), outcome, optNote.parse(form.get("notes") ?? ""));
    notice = outcome === "done" ? `Nice. Logged to your ${String(form.get("plantName") ?? "plant").toLowerCase().slice(0, 40)} history.` : "Skipped for now.";
  } catch (err) {
    back(to, "error", errMsg(err));
  }
  back(to, "notice", notice);
}

export async function plantRecordAction(form: FormData) {
  const id = uuid.parse(form.get("gardenPlantId"));
  const user = await member(`/garden/plants/${id}`);
  const path = `/garden/plants/${id}`;
  let notice = "Saved.";
  try {
    const kind = z.enum(["activity", "milestone", "harvest", "stage", "details"]).parse(form.get("kind"));
    if (kind === "activity") {
      const type = z.enum(TASK_TYPES.map((t) => t.value) as [string, ...string[]]).parse(form.get("activityType"));
      await logActivity(user, id, type as never, null, optNote.parse(form.get("notes") ?? ""));
      notice = "Logged.";
    } else if (kind === "milestone") {
      const m = z.enum(MILESTONES.map((x) => x.value) as [string, ...string[]]).parse(form.get("milestone"));
      await recordMilestone(user, id, m, optNote.parse(form.get("notes") ?? ""));
      notice = "Look what you grew! Milestone saved.";
    } else if (kind === "harvest") {
      const qty = z.coerce.number({ invalid_type_error: "How much did you harvest?" }).positive("How much did you harvest?").max(100000).parse(form.get("quantity"));
      const unit = z.enum(HARVEST_UNITS).parse(form.get("unit"));
      const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(lagosDay(new Date())).parse(form.get("day"));
      if (day > lagosDay(new Date())) throw new GardenError("The harvest date can't be in the future.");
      await recordHarvest(user, id, qty, unit, day, optNote.parse(form.get("notes") ?? ""));
      notice = "Harvest logged. Enjoy it!";
    } else if (kind === "stage") {
      await setStage(user, id, uuid.parse(form.get("stageId")));
      notice = "Stage updated.";
    } else {
      const day = String(form.get("plantingDate") ?? "");
      if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > lagosDay(new Date()))) throw new GardenError("Pick a planting date that isn't in the future.");
      await updateGardenPlant(user, id, { nickname: z.string().trim().max(40).parse(form.get("nickname") ?? "") || null, plantingDate: day || null });
      notice = "Details saved.";
    }
  } catch (err) {
    back(path, "error", errMsg(err));
  }
  back(path, "notice", notice);
}

export async function archivePlantAction(form: FormData) {
  const id = uuid.parse(form.get("gardenPlantId"));
  const user = await member(`/garden/plants/${id}`);
  try {
    await archiveGardenPlant(user, id, z.enum(["completed", "failed", "archived"]).parse(form.get("status")));
  } catch (err) {
    back(`/garden/plants/${id}`, "error", errMsg(err));
  }
  back("/garden", "notice", "Moved out of your active garden. Its history is kept.");
}
