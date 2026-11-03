import { boolean, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { aiRole, createdAt, escalationStatus, id, reviewStatus, ts, updatedAt } from "./_shared";
import { gardenPlants } from "./gardens";
import { users } from "./identity";
import { plantSources, plants } from "./plants";

/** Retrieval-ready, reviewed knowledge. Content updates are independent of the AI model. */
export const aiKnowledgeSources = pgTable(
  "ai_knowledge_sources",
  {
    id: id(),
    plantId: uuid().references(() => plants.id, { onDelete: "cascade" }),
    sourceId: uuid().references(() => plantSources.id, { onDelete: "set null" }),
    contentVersion: integer().notNull().default(1),
    content: text().notNull(),
    reviewStatus: reviewStatus().notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.plantId, t.reviewStatus)],
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gardenPlantId: uuid().references(() => gardenPlants.id, { onDelete: "set null" }),
    contextType: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);

/** Retention-controlled. Message bodies never go to product analytics. */
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid()
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: aiRole().notNull(),
    content: text().notNull(),
    model: text(),
    knowledgeSourceIds: uuid().array().notNull().default([]),
    latencyMs: integer(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.conversationId, t.createdAt)],
);

export const aiResponseFeedback = pgTable(
  "ai_response_feedback",
  {
    id: id(),
    messageId: uuid()
      .notNull()
      .references(() => aiMessages.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    helpful: boolean().notNull(),
    issueType: text(),
    notes: text(),
    createdAt: createdAt(),
  },
  (t) => [unique("ai_response_feedback_message_id_user_id_key").on(t.messageId, t.userId)],
);

export const aiEscalations = pgTable(
  "ai_escalations",
  {
    id: id(),
    conversationId: uuid()
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    reason: text().notNull(),
    status: escalationStatus().notNull().default("open"),
    assignedTo: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.status)],
);
