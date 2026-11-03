import { boolean, foreignKey, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import {
  activityType,
  contentSectionType,
  createdAt,
  id,
  publicationStatus,
  questionInputType,
  reviewStatus,
  suitabilityOutcome,
  ts,
  updatedAt,
} from "./_shared";
import { users } from "./identity";

export const plantCategories = pgTable("plant_categories", {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique("plant_categories_slug_key"),
  description: text(),
  sortOrder: integer().notNull().default(0),
  status: publicationStatus().notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const plants = pgTable(
  "plants",
  {
    id: id(),
    categoryId: uuid()
      .notNull()
      .references(() => plantCategories.id),
    slug: text().notNull().unique("plants_slug_key"),
    commonName: text().notNull(),
    localNames: text().array().notNull().default([]),
    botanicalName: text(),
    origin: text(),
    tagline: text(),
    summaryLine: text(),
    status: publicationStatus().notNull().default("draft"),
    aiDrafted: boolean().notNull().default(false),
    /** Sample/demo content. Must never ship to production. */
    isSample: boolean().notNull().default(false),
    publishedAt: ts(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.categoryId, t.status), index().on(t.status, t.commonName)],
);

export const plantVarieties = pgTable(
  "plant_varieties",
  {
    id: id(),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    growingCharacteristics: jsonb().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("plant_varieties_plant_id_name_key").on(t.plantId, t.name)],
);

export const plantImages = pgTable(
  "plant_images",
  {
    id: id(),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    varietyId: uuid().references(() => plantVarieties.id, { onDelete: "set null" }),
    storagePath: text().notNull(),
    altText: text().notNull(),
    caption: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.plantId, t.sortOrder)],
);

/** One row per pillar per version. Only published + approved rows are shown or retrieved by AI. */
export const plantContentSections = pgTable(
  "plant_content_sections",
  {
    id: id(),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    sectionType: contentSectionType().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    version: integer().notNull().default(1),
    status: publicationStatus().notNull().default("draft"),
    reviewStatus: reviewStatus().notNull().default("pending"),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts(),
    aiDrafted: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("plant_content_sections_plant_id_section_type_version_key").on(t.plantId, t.sectionType, t.version), index().on(t.plantId, t.status)],
);

export const plantSources = pgTable("plant_sources", {
  id: id(),
  title: text().notNull(),
  publisher: text(),
  url: text(),
  sourceType: text().notNull(),
  reviewedAt: ts(),
  createdAt: createdAt(),
});

export const plantReferences = pgTable(
  "plant_references",
  {
    id: id(),
    contentSectionId: uuid().notNull(),
    sourceId: uuid()
      .notNull()
      .references(() => plantSources.id, { onDelete: "restrict" }),
    referenceNote: text(),
  },
  (t) => [
    unique("plant_references_content_section_id_source_id_key").on(t.contentSectionId, t.sourceId),
    foreignKey({
      name: "plant_references_section_fk",
      columns: [t.contentSectionId],
      foreignColumns: [plantContentSections.id],
    }).onDelete("cascade"),
  ],
);

/** Deterministic, data-driven suitability rules. `condition` matches plan inputs. */
export const plantSuitabilityRules = pgTable(
  "plant_suitability_rules",
  {
    id: id(),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    varietyId: uuid().references(() => plantVarieties.id, { onDelete: "cascade" }),
    priority: integer().notNull().default(0),
    condition: jsonb().notNull(),
    outcome: suitabilityOutcome().notNull(),
    reason: text().notNull(),
    alternativePlantIds: uuid().array().notNull().default([]),
    ruleVersion: integer().notNull().default(1),
    status: publicationStatus().notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.plantId, t.status, t.priority)],
);

/** v1.2 — personalisation questions per plant/variety, with conditional display (`showIf`). */
export const plantQuestions = pgTable(
  "plant_questions",
  {
    id: id(),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    varietyId: uuid().references(() => plantVarieties.id, { onDelete: "cascade" }),
    questionKey: text().notNull(),
    prompt: text().notNull(),
    helpText: text(),
    inputType: questionInputType().notNull().default("single_choice"),
    options: jsonb().notNull().default([]),
    sortOrder: integer().notNull().default(0),
    showIf: jsonb(),
    required: boolean().notNull().default(true),
    status: publicationStatus().notNull().default("draft"),
    contentVersion: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("plant_questions_plant_id_4cols_key").on(t.plantId, t.varietyId, t.questionKey, t.contentVersion),
    index().on(t.plantId, t.status, t.sortOrder),
  ],
);

export const plantGrowthStages = pgTable(
  "plant_growth_stages",
  {
    id: id(),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    name: text().notNull(),
    sequence: integer().notNull(),
    description: text(),
    typicalTiming: text(),
  },
  (t) => [unique("plant_growth_stages_plant_id_sequence_key").on(t.plantId, t.sequence)],
);

/** v1.2 — reviewed care-task templates the care engine expands into care_tasks per garden plant. */
export const careTaskTemplates = pgTable(
  "care_task_templates",
  {
    id: id(),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    varietyId: uuid().references(() => plantVarieties.id, { onDelete: "cascade" }),
    growthStageId: uuid().references(() => plantGrowthStages.id, { onDelete: "set null" }),
    taskType: activityType().notNull(),
    title: text().notNull(),
    instructions: text().notNull(),
    timingRule: jsonb().notNull(),
    recurrenceRule: text(),
    condition: jsonb(),
    reviewStatus: reviewStatus().notNull().default("pending"),
    status: publicationStatus().notNull().default("draft"),
    contentVersion: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.plantId, t.status)],
);

export const savedPlants = pgTable(
  "saved_plants",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plantId: uuid()
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique("saved_plants_user_id_plant_id_key").on(t.userId, t.plantId)],
);

export const plantSearchEvents = pgTable(
  "plant_search_events",
  {
    id: id(),
    anonymousId: text(),
    userId: uuid(),
    searchTerm: text().notNull(),
    resultCount: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt)],
);
