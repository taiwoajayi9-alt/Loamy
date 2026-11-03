import { boolean, index, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { consentStatus, createdAt, id, notificationChannel, publicationStatus, ts, updatedAt } from "./_shared";
import { users } from "./identity";

// ── Notifications ─────────────────────────────────────────────
// Customer communication currently happens off-app. WhatsApp tables stay in the schema
// until the owner decides whether WhatsApp integration (E13) leaves the MVP (ticket LMY-32).

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notificationType: text().notNull(),
    title: text().notNull(),
    message: text().notNull(),
    linkPath: text(),
    /** Prevents duplicate reminders. */
    dedupeKey: text(),
    readAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [unique("notifications_user_id_dedupe_key_key").on(t.userId, t.dedupeKey), index().on(t.userId, t.readAt)],
);

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: id(),
    templateKey: text().notNull(),
    channel: notificationChannel().notNull(),
    content: text().notNull(),
    status: publicationStatus().notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("notification_templates_template_key_channel_key").on(t.templateKey, t.channel)],
);

export const whatsappConsents = pgTable(
  "whatsapp_consents",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    phone: text().notNull(),
    status: consentStatus().notNull(),
    consentSource: text().notNull(),
    consentedAt: createdAt(),
    revokedAt: ts(),
  },
  (t) => [index().on(t.userId)],
);

export const whatsappMessageLogs = pgTable("whatsapp_message_logs", {
  id: id(),
  userId: uuid().references(() => users.id, { onDelete: "set null" }),
  templateId: uuid().references(() => notificationTemplates.id, { onDelete: "set null" }),
  providerMessageId: text().unique("whatsapp_message_logs_provider_message_id_key"),
  status: text().notNull(),
  error: text(),
  sentAt: ts(),
  deliveredAt: ts(),
  createdAt: createdAt(),
});

// ── Analytics ─────────────────────────────────────────────────
// Backend-authoritative events (subscription activation, order completion).
// Never store AI message bodies, sensitive personal data or unnecessary free text here.

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: id(),
    eventName: text().notNull(),
    anonymousId: text(),
    userId: uuid(),
    properties: jsonb().notNull().default({}),
    occurredAt: createdAt(),
  },
  (t) => [index().on(t.eventName, t.occurredAt), index().on(t.anonymousId), index().on(t.userId)],
);

export const funnelDefinitions = pgTable("funnel_definitions", {
  id: id(),
  name: text().notNull().unique("funnel_definitions_name_key"),
  definition: jsonb().notNull(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
