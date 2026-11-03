import { date, index, integer, jsonb, numeric, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import {
  activityType,
  careTaskStatus,
  createdAt,
  gardenPlantStatus,
  growingMethod,
  id,
  planStatus,
  spaceType,
  suitabilityOutcome,
  sunlight,
  ts,
  updatedAt,
  waterAccess,
} from "./_shared";
import { anonymousSessions, userLocations, users } from "./identity";
import { careTaskTemplates, plantGrowthStages, plantVarieties, plants } from "./plants";

/** A plan can start anonymously (preview before sign-up) and is attached to a user after registration. */
export const growingPlans = pgTable(
  "growing_plans",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    anonymousSessionId: uuid().references(() => anonymousSessions.id, { onDelete: "set null" }),
    plantId: uuid()
      .notNull()
      .references(() => plants.id),
    varietyId: uuid().references(() => plantVarieties.id),
    status: planStatus().notNull().default("draft"),
    suitability: suitabilityOutcome(),
    suitabilityReason: text(),
    ruleVersion: integer(),
    contentVersion: integer(),
    /** Frozen plan output so historical plans stay explainable after content changes. */
    snapshot: jsonb(),
    generatedAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.status), index().on(t.anonymousSessionId)],
);

export const growingPlanInputs = pgTable(
  "growing_plan_inputs",
  {
    id: id(),
    planId: uuid()
      .notNull()
      .references(() => growingPlans.id, { onDelete: "cascade" }),
    inputKey: text().notNull(),
    inputValue: jsonb().notNull(),
    source: text().notNull().default("user"),
    createdAt: createdAt(),
  },
  (t) => [unique("growing_plan_inputs_plan_id_input_key_key").on(t.planId, t.inputKey)],
);

export const growingPlanStages = pgTable(
  "growing_plan_stages",
  {
    id: id(),
    planId: uuid()
      .notNull()
      .references(() => growingPlans.id, { onDelete: "cascade" }),
    stageName: text().notNull(),
    sequence: integer().notNull(),
    expectedDuration: text(),
    guidance: text(),
  },
  (t) => [unique("growing_plan_stages_plan_id_sequence_key").on(t.planId, t.sequence)],
);

export const growingPlanTasks = pgTable("growing_plan_tasks", {
  id: id(),
  stageId: uuid()
    .notNull()
    .references(() => growingPlanStages.id, { onDelete: "cascade" }),
  taskType: activityType().notNull(),
  instructions: text().notNull(),
  timingRule: jsonb(),
});

export const gardens = pgTable(
  "gardens",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    gardenType: spaceType().notNull(),
    locationId: uuid().references(() => userLocations.id, { onDelete: "set null" }),
    description: text(),
    sunlight: sunlight(),
    waterAccess: waterAccess(),
    availableArea: text(),
    archivedAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

/** An actual plant in a user's garden. Archiving never deletes history. */
export const gardenPlants = pgTable(
  "garden_plants",
  {
    id: id(),
    gardenId: uuid()
      .notNull()
      .references(() => gardens.id, { onDelete: "cascade" }),
    plantId: uuid()
      .notNull()
      .references(() => plants.id),
    varietyId: uuid().references(() => plantVarieties.id),
    planId: uuid().references(() => growingPlans.id, { onDelete: "set null" }),
    growthStageId: uuid().references(() => plantGrowthStages.id, { onDelete: "set null" }),
    nickname: text(),
    plantingDate: date(),
    growingMethod: growingMethod(),
    growingMedium: text(),
    locationDetail: text(),
    notes: text(),
    status: gardenPlantStatus().notNull().default("active"),
    archivedAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.gardenId, t.status)],
);

/** What the user actually did (a care task is only a recommendation). */
export const plantActivities = pgTable(
  "plant_activities",
  {
    id: id(),
    gardenPlantId: uuid()
      .notNull()
      .references(() => gardenPlants.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityType: activityType().notNull(),
    customLabel: text(),
    notes: text(),
    performedAt: createdAt(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.gardenPlantId, t.performedAt)],
);

export const plantMilestones = pgTable(
  "plant_milestones",
  {
    id: id(),
    gardenPlantId: uuid()
      .notNull()
      .references(() => gardenPlants.id, { onDelete: "cascade" }),
    milestoneType: text().notNull(),
    notes: text(),
    recordedAt: createdAt(),
  },
  (t) => [index().on(t.gardenPlantId, t.recordedAt)],
);

/** Private user photos. Served through signed, time-limited URLs only. */
export const plantPhotos = pgTable(
  "plant_photos",
  {
    id: id(),
    gardenPlantId: uuid()
      .notNull()
      .references(() => gardenPlants.id, { onDelete: "cascade" }),
    activityId: uuid().references(() => plantActivities.id, { onDelete: "set null" }),
    storagePath: text().notNull(),
    caption: text(),
    uploadedAt: createdAt(),
  },
  (t) => [index().on(t.gardenPlantId, t.uploadedAt)],
);

export const harvestRecords = pgTable(
  "harvest_records",
  {
    id: id(),
    gardenPlantId: uuid()
      .notNull()
      .references(() => gardenPlants.id, { onDelete: "cascade" }),
    harvestDate: date().notNull(),
    quantity: numeric({ precision: 10, scale: 2 }).notNull(),
    unit: text().notNull(),
    notes: text(),
    photoPath: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.gardenPlantId, t.harvestDate)],
);

export const careSchedules = pgTable(
  "care_schedules",
  {
    id: id(),
    gardenPlantId: uuid()
      .notNull()
      .references(() => gardenPlants.id, { onDelete: "cascade" }),
    planId: uuid().references(() => growingPlans.id, { onDelete: "set null" }),
    status: text().notNull().default("active"),
    generatedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.gardenPlantId)],
);

export const careTasks = pgTable(
  "care_tasks",
  {
    id: id(),
    scheduleId: uuid()
      .notNull()
      .references(() => careSchedules.id, { onDelete: "cascade" }),
    templateId: uuid().references(() => careTaskTemplates.id, { onDelete: "set null" }),
    taskType: activityType().notNull(),
    title: text().notNull(),
    instructions: text().notNull(),
    dueAt: ts().notNull(),
    recurrenceRule: text(),
    status: careTaskStatus().notNull().default("scheduled"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // Prevents duplicate tasks for the same template and due time.
  (t) => [unique("care_tasks_schedule_id_template_id_due_at_key").on(t.scheduleId, t.templateId, t.dueAt), index().on(t.status, t.dueAt)],
);

export const careTaskCompletions = pgTable(
  "care_task_completions",
  {
    id: id(),
    careTaskId: uuid()
      .notNull()
      .references(() => careTasks.id, { onDelete: "cascade" }),
    activityId: uuid().references(() => plantActivities.id, { onDelete: "set null" }),
    completedAt: createdAt(),
  },
  (t) => [index().on(t.careTaskId)],
);
