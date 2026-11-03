import { boolean, index, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import {
  adminRole,
  consentStatus,
  consentType,
  createdAt,
  experience,
  id,
  notificationChannel,
  spaceType,
  sunlight,
  ts,
  updatedAt,
  userStatus,
  waterAccess,
} from "./_shared";

/** Root identity. `authProviderId` is the Supabase Auth user id. */
export const users = pgTable("users", {
  id: id(),
  email: text().notNull().unique("users_email_key"),
  authProviderId: text().notNull().unique("users_auth_provider_id_key"),
  status: userStatus().notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userProfiles = pgTable("user_profiles", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: text(),
  lastName: text(),
  phone: text(),
  avatarUrl: text(),
  timezone: text().notNull().default("Africa/Lagos"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userPreferences = pgTable("user_preferences", {
  id: id(),
  userId: uuid()
    .notNull()
    .unique("user_preferences_user_id_key")
    .references(() => users.id, { onDelete: "cascade" }),
  gardeningExperience: experience(),
  intendedUse: text(),
  preferences: jsonb().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Capture only the precision needed (area/city), not exact coordinates. */
export const userLocations = pgTable(
  "user_locations",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    area: text(),
    city: text().notNull().default("Lagos"),
    state: text().notNull().default("Lagos"),
    country: text().notNull().default("NG"),
    isPrimary: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

export const userSpaces = pgTable(
  "user_spaces",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    spaceType: spaceType().notNull(),
    sunlight: sunlight(),
    availableArea: text(),
    waterAccess: waterAccess(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

/** Append-only consent history: add a row on every change, never update. */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consentType: consentType().notNull(),
    status: consentStatus().notNull(),
    source: text().notNull(),
    policyVersion: text().notNull(),
    recordedAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.consentType, t.recordedAt)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannel().notNull(),
    enabled: boolean().notNull().default(false),
    frequency: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("notification_preferences_user_id_channel_key").on(t.userId, t.channel)],
);

export const anonymousSessions = pgTable("anonymous_sessions", {
  id: id(),
  anonymousId: text().notNull().unique("anonymous_sessions_anonymous_id_key"),
  startedAt: createdAt(),
  lastSeenAt: createdAt(),
});

/** Controlled association of an anonymous session with an account, under a documented policy version. */
export const identityLinks = pgTable(
  "identity_links",
  {
    id: id(),
    anonymousSessionId: uuid()
      .notNull()
      .references(() => anonymousSessions.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    policyVersion: text().notNull(),
    linkedAt: createdAt(),
  },
  (t) => [unique("identity_links_anonymous_session_id_user_id_key").on(t.anonymousSessionId, t.userId)],
);

export const adminRoleAssignments = pgTable(
  "admin_role_assignments",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: adminRole().notNull(),
    grantedBy: uuid(),
    createdAt: createdAt(),
  },
  (t) => [unique("admin_role_assignments_user_id_role_key").on(t.userId, t.role)],
);

/** Every admin change to prices, stock, content publication, plans or orders is logged here. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.entityType, t.entityId), index().on(t.actorId, t.createdAt)],
);

export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text().notNull().default("requested"),
    requestedAt: createdAt(),
    completedAt: ts(),
    notes: text(),
  },
  (t) => [index().on(t.status)],
);
