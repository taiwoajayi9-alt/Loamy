import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  careSchedules,
  careTaskCompletions,
  careTaskTemplates,
  careTasks,
  gardenPlants,
  gardens,
  growingPlans,
  harvestRecords,
  plantActivities,
  plantGrowthStages,
  plantImages,
  plantMilestones,
  plantPhotos,
  plants,
} from "@/db/schema";
import { dueTasks, lagosDay, type CareTemplate, type TaskType } from "@/lib/care";
import type { Answers } from "@/lib/grow/questions";
import { BUCKETS, GARDEN_PHOTO_RULES, photoPath, type IMAGE_TYPES } from "@/lib/photos";
import { trackServer } from "./analytics";
import { inspectPhoto, removeFrom, signedUrls, uploadTo } from "./storage";
import type { SessionUser } from "./auth";
import type { PlanSnapshot } from "./grow";

/**
 * Members' gardens. Every function checks that the garden belongs to the signed-in member.
 * Pages call requireEntitlement first; these functions never trust ids from the browser on their own.
 */

export class GardenError extends Error {}

const SPACE_LABEL: Record<string, string> = { balcony: "Balcony", window: "Window", rooftop: "Rooftop", compound: "Compound" };

/** Puts a plan's plant into the member's garden (creating the garden on first use). Idempotent per plan. */
export async function addPlanToGarden(user: SessionUser, planId: string): Promise<string> {
  const plan = await db.query.growingPlans.findFirst({ where: and(eq(growingPlans.id, planId), eq(growingPlans.userId, user.id)) });
  if (!plan) throw new GardenError("We couldn't find that plan.");
  const plant = await db.query.plants.findFirst({ where: and(eq(plants.id, plan.plantId), eq(plants.status, "published")) });
  if (!plant) throw new GardenError("That plant isn't available right now.");
  const answers = ((plan.snapshot as PlanSnapshot | null)?.answers ?? {}) as Answers;

  const result = await db.transaction(async (tx) => {
    const existing = await tx.query.gardenPlants.findFirst({ where: eq(gardenPlants.planId, plan.id) });
    if (existing) return { id: existing.id, newGarden: false };
    let [garden] = await tx.select().from(gardens).where(and(eq(gardens.userId, user.id), isNull(gardens.archivedAt))).orderBy(asc(gardens.createdAt)).limit(1);
    let newGarden = false;
    if (!garden) {
      const space = (answers.space ?? "balcony") as "balcony" | "window" | "rooftop" | "compound";
      [garden] = await tx
        .insert(gardens)
        .values({ userId: user.id, name: `My ${SPACE_LABEL[space]?.toLowerCase() ?? "garden"} garden`, gardenType: space, sunlight: (answers.sun as "full" | "part" | "low") ?? null, waterAccess: (answers.water as "easy" | "some" | "hard") ?? null })
        .returning();
      newGarden = true;
    }
    const [first] = await tx.select({ id: plantGrowthStages.id }).from(plantGrowthStages).where(eq(plantGrowthStages.plantId, plant.id)).orderBy(asc(plantGrowthStages.sequence)).limit(1);
    const [gp] = await tx
      .insert(gardenPlants)
      .values({
        gardenId: garden.id,
        plantId: plant.id,
        planId: plan.id,
        growthStageId: first?.id ?? null,
        plantingDate: lagosDay(new Date()),
        growingMethod: (answers.method as "pot" | "grow_bag" | "ground") ?? "pot",
        status: "active",
      })
      .returning({ id: gardenPlants.id });
    await tx.insert(careSchedules).values({ gardenPlantId: gp.id, planId: plan.id });
    await tx.update(growingPlans).set({ status: "active" }).where(eq(growingPlans.id, plan.id));
    return { id: gp.id, newGarden, gardenId: garden.id, gardenType: garden.gardenType };
  });
  if (result.newGarden && "gardenType" in result) await trackServer("garden_created", { garden_type: result.gardenType! }, user.id);
  if ("gardenId" in result) await trackServer("plant_added_to_garden", { plant_id: plant.slug, garden_id: result.gardenId! }, user.id);
  return result.id;
}

async function ownedGardenPlant(userId: string, gardenPlantId: string) {
  const [row] = await db
    .select({ gp: gardenPlants, plant: { id: plants.id, slug: plants.slug, commonName: plants.commonName }, gardenName: gardens.name })
    .from(gardenPlants)
    .innerJoin(gardens, eq(gardens.id, gardenPlants.gardenId))
    .innerJoin(plants, eq(plants.id, gardenPlants.plantId))
    .where(and(eq(gardenPlants.id, gardenPlantId), eq(gardens.userId, userId)));
  return row ?? null;
}

/**
 * Today's care tasks for the given garden plants. Due occurrences are written to care_tasks
 * (one row per template per due day, so repeats never duplicate) and returned with their ids.
 */
async function syncTasks(gps: { id: string; plantId: string; plantingDate: string | null; createdAt: Date }[]) {
  if (!gps.length) return [];
  const today = lagosDay(new Date());
  const schedules = await db.select().from(careSchedules).where(and(inArray(careSchedules.gardenPlantId, gps.map((g) => g.id)), eq(careSchedules.status, "active")));
  const templates = await db
    .select()
    .from(careTaskTemplates)
    .where(and(inArray(careTaskTemplates.plantId, [...new Set(gps.map((g) => g.plantId))]), eq(careTaskTemplates.status, "published"), eq(careTaskTemplates.reviewStatus, "approved"), isNull(careTaskTemplates.varietyId)));
  const scheduleIds = schedules.map((s) => s.id);
  const history = scheduleIds.length ? await db.select().from(careTasks).where(inArray(careTasks.scheduleId, scheduleIds)) : [];

  const open: (typeof careTasks.$inferSelect & { gardenPlantId: string })[] = [];
  for (const gp of gps) {
    const sched = schedules.find((s) => s.gardenPlantId === gp.id);
    if (!sched) continue;
    const mine = history.filter((h) => h.scheduleId === sched.id);
    const last = new Map<string, string>();
    for (const h of mine)
      if ((h.status === "completed" || h.status === "skipped") && h.templateId) {
        const day = lagosDay(h.updatedAt);
        if (!last.has(h.templateId) || last.get(h.templateId)! < day) last.set(h.templateId, day);
      }
    const tpl: CareTemplate[] = templates.filter((t) => t.plantId === gp.plantId).map((t) => ({ id: t.id, taskType: t.taskType, title: t.title, instructions: t.instructions, timingRule: t.timingRule as CareTemplate["timingRule"] }));
    const planted = gp.plantingDate ?? lagosDay(gp.createdAt);
    for (const d of dueTasks(tpl, planted, last, today)) {
      const dueAt = new Date(`${d.dueDay}T08:00:00+01:00`);
      await db
        .insert(careTasks)
        .values({ scheduleId: sched.id, templateId: d.id, taskType: d.taskType as TaskType, title: d.title, instructions: d.instructions, dueAt, status: "due" })
        .onConflictDoNothing();
    }
    const fresh = await db.select().from(careTasks).where(and(eq(careTasks.scheduleId, sched.id), inArray(careTasks.status, ["due", "scheduled"]))).orderBy(asc(careTasks.dueAt));
    // Only the latest open occurrence per template is shown; older missed ones are folded into it.
    const seen = new Set<string>();
    for (const t of [...fresh].reverse()) {
      const key = t.templateId ?? t.id;
      if (seen.has(key)) continue;
      seen.add(key);
      // Hide tasks whose template has since been retired.
      if (t.templateId && !templates.some((x) => x.id === t.templateId)) continue;
      open.push({ ...t, gardenPlantId: gp.id });
    }
  }
  return open;
}

export async function getGardenOverview(userId: string) {
  const rows = await db
    .select({
      gp: gardenPlants,
      plant: { slug: plants.slug, commonName: plants.commonName },
      stage: plantGrowthStages.name,
      garden: { id: gardens.id, name: gardens.name },
      cover: sql<string | null>`(select ${plantImages.storagePath} from ${plantImages} where ${plantImages.plantId} = ${plants.id} order by ${plantImages.sortOrder}, ${plantImages.createdAt} limit 1)`,
      latestPhoto: sql<string | null>`(select ${plantPhotos.storagePath} from ${plantPhotos} where ${plantPhotos.gardenPlantId} = ${gardenPlants.id} order by ${plantPhotos.uploadedAt} desc limit 1)`,
    })
    .from(gardenPlants)
    .innerJoin(gardens, eq(gardens.id, gardenPlants.gardenId))
    .innerJoin(plants, eq(plants.id, gardenPlants.plantId))
    .leftJoin(plantGrowthStages, eq(plantGrowthStages.id, gardenPlants.growthStageId))
    .where(and(eq(gardens.userId, userId), eq(gardenPlants.status, "active")))
    .orderBy(asc(gardenPlants.createdAt));
  const tasks = await syncTasks(rows.map((r) => r.gp));
  const own = await signedUrls(BUCKETS.garden, rows.flatMap((r) => (r.latestPhoto ? [r.latestPhoto] : [])));
  const today = lagosDay(new Date());
  const scheduleIds = (await db.select({ id: careSchedules.id }).from(careSchedules).where(inArray(careSchedules.gardenPlantId, rows.length ? rows.map((r) => r.gp.id) : ["00000000-0000-0000-0000-000000000000"]))).map((s) => s.id);
  const doneToday = scheduleIds.length
    ? (await db.select({ status: careTasks.status, updatedAt: careTasks.updatedAt }).from(careTasks).where(and(inArray(careTasks.scheduleId, scheduleIds), inArray(careTasks.status, ["completed", "skipped"])))).filter(
        (t) => lagosDay(t.updatedAt) === today,
      ).length
    : 0;
  return {
    garden: rows[0]?.garden ?? null,
    plants: rows.map((r) => ({
      id: r.gp.id,
      slug: r.plant.slug,
      name: r.gp.nickname || r.plant.commonName,
      commonName: r.plant.commonName,
      stage: r.stage,
      plantingDate: r.gp.plantingDate,
      due: tasks.filter((t) => t.gardenPlantId === r.gp.id).length,
      coverPath: r.cover,
      // Their own latest photo wins over the catalogue photo (signed, private link).
      ownPhotoUrl: r.latestPhoto ? (own.get(r.latestPhoto) ?? null) : null,
    })),
    tasks: tasks.map((t) => ({ ...t, plantName: rows.find((r) => r.gp.id === t.gardenPlantId)?.gp.nickname || rows.find((r) => r.gp.id === t.gardenPlantId)?.plant.commonName || "" })),
    doneToday,
  };
}

export async function getGardenPlant(userId: string, gardenPlantId: string) {
  const owned = await ownedGardenPlant(userId, gardenPlantId);
  if (!owned) return null;
  const [tasks, stages, activities, milestones, harvests, photos] = await Promise.all([
    owned.gp.status === "active" ? syncTasks([owned.gp]) : Promise.resolve([]),
    db.select().from(plantGrowthStages).where(eq(plantGrowthStages.plantId, owned.plant.id)).orderBy(asc(plantGrowthStages.sequence)),
    db.select().from(plantActivities).where(eq(plantActivities.gardenPlantId, gardenPlantId)).orderBy(desc(plantActivities.performedAt)).limit(30),
    db.select().from(plantMilestones).where(eq(plantMilestones.gardenPlantId, gardenPlantId)).orderBy(desc(plantMilestones.recordedAt)),
    db.select().from(harvestRecords).where(eq(harvestRecords.gardenPlantId, gardenPlantId)).orderBy(desc(harvestRecords.harvestDate)),
    db.select().from(plantPhotos).where(eq(plantPhotos.gardenPlantId, gardenPlantId)).orderBy(desc(plantPhotos.uploadedAt)).limit(40),
  ]);
  const urls = await signedUrls(BUCKETS.garden, photos.map((p) => p.storagePath));
  return { ...owned, tasks, stages, activities, milestones, harvests, photos: photos.map((p) => ({ ...p, url: urls.get(p.storagePath) ?? null })) };
}

/** Marks a care task done (logging the activity) or skipped. Checks ownership through the schedule. */
export async function handleTask(user: SessionUser, taskId: string, outcome: "done" | "skip", notes: string | null) {
  const [row] = await db
    .select({ task: careTasks, gardenPlantId: careSchedules.gardenPlantId, plantSlug: plants.slug })
    .from(careTasks)
    .innerJoin(careSchedules, eq(careSchedules.id, careTasks.scheduleId))
    .innerJoin(gardenPlants, eq(gardenPlants.id, careSchedules.gardenPlantId))
    .innerJoin(gardens, eq(gardens.id, gardenPlants.gardenId))
    .innerJoin(plants, eq(plants.id, gardenPlants.plantId))
    .where(and(eq(careTasks.id, taskId), eq(gardens.userId, user.id)));
  if (!row) throw new GardenError("We couldn't find that task.");
  if (row.task.status === "completed" || row.task.status === "skipped") return row.gardenPlantId;
  await db.transaction(async (tx) => {
    // Close this and any older missed occurrences of the same template together.
    const siblings = row.task.templateId
      ? await tx.select({ id: careTasks.id }).from(careTasks).where(and(eq(careTasks.scheduleId, row.task.scheduleId), eq(careTasks.templateId, row.task.templateId), inArray(careTasks.status, ["due", "scheduled"])))
      : [{ id: row.task.id }];
    await tx.update(careTasks).set({ status: outcome === "done" ? "completed" : "skipped" }).where(inArray(careTasks.id, siblings.map((s) => s.id)));
    if (outcome === "done") {
      const [act] = await tx.insert(plantActivities).values({ gardenPlantId: row.gardenPlantId, userId: user.id, activityType: row.task.taskType, customLabel: row.task.title, notes }).returning({ id: plantActivities.id });
      await tx.insert(careTaskCompletions).values({ careTaskId: row.task.id, activityId: act.id });
    }
  });
  if (outcome === "done") await trackServer("care_activity_recorded", { activity_type: row.task.taskType, plant_id: row.plantSlug }, user.id);
  return row.gardenPlantId;
}

export async function logActivity(user: SessionUser, gardenPlantId: string, activityType: TaskType, label: string | null, notes: string | null) {
  const owned = await ownedGardenPlant(user.id, gardenPlantId);
  if (!owned) throw new GardenError("We couldn't find that plant.");
  await db.insert(plantActivities).values({ gardenPlantId, userId: user.id, activityType, customLabel: label, notes });
  await trackServer("care_activity_recorded", { activity_type: activityType, plant_id: owned.plant.slug }, user.id);
}

export async function recordMilestone(user: SessionUser, gardenPlantId: string, milestoneType: string, notes: string | null) {
  const owned = await ownedGardenPlant(user.id, gardenPlantId);
  if (!owned) throw new GardenError("We couldn't find that plant.");
  await db.insert(plantMilestones).values({ gardenPlantId, milestoneType, notes });
  await trackServer("milestone_recorded", { milestone_type: milestoneType, plant_id: owned.plant.slug }, user.id);
}

export async function recordHarvest(user: SessionUser, gardenPlantId: string, quantity: number, unit: string, day: string, notes: string | null) {
  const owned = await ownedGardenPlant(user.id, gardenPlantId);
  if (!owned) throw new GardenError("We couldn't find that plant.");
  await db.insert(harvestRecords).values({ gardenPlantId, harvestDate: day, quantity: String(quantity), unit, notes });
  await trackServer("harvest_recorded", { plant_id: owned.plant.slug, quantity, unit }, user.id);
}

export async function setStage(user: SessionUser, gardenPlantId: string, stageId: string) {
  const owned = await ownedGardenPlant(user.id, gardenPlantId);
  if (!owned) throw new GardenError("We couldn't find that plant.");
  const stage = await db.query.plantGrowthStages.findFirst({ where: and(eq(plantGrowthStages.id, stageId), eq(plantGrowthStages.plantId, owned.plant.id)) });
  if (!stage) throw new GardenError("That stage doesn't belong to this plant.");
  await db.update(gardenPlants).set({ growthStageId: stage.id }).where(eq(gardenPlants.id, gardenPlantId));
}

export async function updateGardenPlant(user: SessionUser, gardenPlantId: string, data: { nickname: string | null; plantingDate: string | null }) {
  const owned = await ownedGardenPlant(user.id, gardenPlantId);
  if (!owned) throw new GardenError("We couldn't find that plant.");
  await db.update(gardenPlants).set(data).where(eq(gardenPlants.id, gardenPlantId));
}

/** Archiving keeps history; the plant just stops getting tasks. */
export async function archiveGardenPlant(user: SessionUser, gardenPlantId: string, status: "completed" | "failed" | "archived") {
  const owned = await ownedGardenPlant(user.id, gardenPlantId);
  if (!owned) throw new GardenError("We couldn't find that plant.");
  await db.transaction(async (tx) => {
    await tx.update(gardenPlants).set({ status, archivedAt: new Date() }).where(eq(gardenPlants.id, gardenPlantId));
    await tx.update(careSchedules).set({ status: "ended" }).where(eq(careSchedules.gardenPlantId, gardenPlantId));
  });
}

/** The member's plans that aren't in their garden yet (for "Add to my garden"). */
export async function plansNotInGarden(userId: string) {
  const rows = await db
    .select({ id: growingPlans.id, suitability: growingPlans.suitability, slug: plants.slug, commonName: plants.commonName, createdAt: growingPlans.createdAt })
    .from(growingPlans)
    .innerJoin(plants, eq(plants.id, growingPlans.plantId))
    .leftJoin(gardenPlants, eq(gardenPlants.planId, growingPlans.id))
    .where(and(eq(growingPlans.userId, userId), eq(plants.status, "published"), isNull(gardenPlants.id)))
    .orderBy(desc(growingPlans.createdAt));
  // One per plant: the newest plan wins.
  const seen = new Set<string>();
  return rows.filter((r) => r.suitability !== "unsuitable" && (seen.has(r.slug) ? false : (seen.add(r.slug), true)));
}

// ── Members' own photos (private bucket; shown through signed, time-limited links) ──

export async function addGardenPhoto(user: SessionUser, gardenPlantId: string, file: File, caption: string | null) {
  const owned = await ownedGardenPlant(user.id, gardenPlantId);
  if (!owned) throw new GardenError("We couldn't find that plant.");
  const problem = await inspectPhoto(file, GARDEN_PHOTO_RULES);
  if (problem) throw new GardenError(problem);
  const path = photoPath(`users/${user.id}/${gardenPlantId}`, file.type as keyof typeof IMAGE_TYPES, randomUUID());
  await uploadTo(BUCKETS.garden, path, file, true);
  try {
    await db.insert(plantPhotos).values({ gardenPlantId, storagePath: path, caption });
  } catch (err) {
    await removeFrom(BUCKETS.garden, path);
    throw err;
  }
}

export async function removeGardenPhoto(user: SessionUser, gardenPlantId: string, photoId: string) {
  const owned = await ownedGardenPlant(user.id, gardenPlantId);
  if (!owned) throw new GardenError("We couldn't find that plant.");
  const [photo] = await db.select().from(plantPhotos).where(and(eq(plantPhotos.id, photoId), eq(plantPhotos.gardenPlantId, gardenPlantId)));
  if (!photo) throw new GardenError("Photo not found.");
  await db.delete(plantPhotos).where(eq(plantPhotos.id, photo.id));
  await removeFrom(BUCKETS.garden, photo.storagePath);
}
