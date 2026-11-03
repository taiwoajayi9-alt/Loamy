import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  adminRoleAssignments,
  auditLogs,
  careTaskTemplates,
  plantImages,
  plantCategories,
  plantContentSections,
  plantReferences,
  plantSources,
  plants,
} from "@/db/schema";
import {
  aiMayDraft,
  canApprovePlants,
  canEditPlants,
  canOpenPlantLibrary,
  canPublishPlants,
  canReview,
  canSubmit,
  latestByType,
  planEdit,
  publishReadiness,
  type AdminRole,
  type PillarType,
} from "@/lib/plant-workflow";
import { AI_SOURCE_NOTE, type PlantDraft, type SuggestedSource } from "@/lib/ai/plant-draft";
import { BUCKETS, photoPath, PLANT_PHOTO_RULES, type IMAGE_TYPES } from "@/lib/photos";
import { requireUser, type SessionUser } from "./auth";
import { inspectPhoto, removeFrom, uploadTo } from "./storage";

export type Actor = SessionUser & { roles: AdminRole[] };

export async function getRoles(userId: string): Promise<AdminRole[]> {
  const rows = await db.select({ role: adminRoleAssignments.role }).from(adminRoleAssignments).where(eq(adminRoleAssignments.userId, userId));
  return rows.map((r) => r.role);
}

/** Server-side gate for the plant library. Non-admins are sent home. */
export async function requirePlantLibrary(nextPath: string): Promise<Actor> {
  const user = await requireUser(nextPath);
  const roles = await getRoles(user.id);
  if (!canOpenPlantLibrary(roles)) redirect("/");
  return { ...user, roles };
}

export class NotAllowed extends Error {}
export class WorkflowError extends Error {}

function assert(ok: boolean, msg: string, Err: new (m: string) => Error = NotAllowed) {
  if (!ok) throw new Err(msg);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function audit(tx: Tx, actor: Actor, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
  await tx.insert(auditLogs).values({ actorId: actor.id, action, entityType, entityId, before: before ?? null, after: after ?? null });
}

// ── Reads ──────────────────────────────────────────────────────

export async function listAdminPlants() {
  const rows = await db
    .select({
      id: plants.id,
      slug: plants.slug,
      commonName: plants.commonName,
      status: plants.status,
      category: plantCategories.name,
      isSample: plants.isSample,
    })
    .from(plants)
    .innerJoin(plantCategories, eq(plantCategories.id, plants.categoryId))
    .orderBy(asc(plantCategories.sortOrder), asc(plants.commonName));

  const ids = rows.map((r) => r.id);
  const sections = ids.length
    ? await db
        .select({
          plantId: plantContentSections.plantId,
          sectionType: plantContentSections.sectionType,
          version: plantContentSections.version,
          status: plantContentSections.status,
          reviewStatus: plantContentSections.reviewStatus,
        })
        .from(plantContentSections)
        .where(inArray(plantContentSections.plantId, ids))
    : [];

  const [refCounts, careCounts, imageCounts] = ids.length
    ? await Promise.all([
        db
          .select({ plantId: plantContentSections.plantId, n: sql<number>`count(distinct ${plantReferences.sourceId})`.mapWith(Number) })
          .from(plantReferences)
          .innerJoin(plantContentSections, eq(plantContentSections.id, plantReferences.contentSectionId))
          .where(inArray(plantContentSections.plantId, ids))
          .groupBy(plantContentSections.plantId),
        db
          .select({ plantId: careTaskTemplates.plantId, n: sql<number>`count(*)`.mapWith(Number) })
          .from(careTaskTemplates)
          .where(and(inArray(careTaskTemplates.plantId, ids), eq(careTaskTemplates.reviewStatus, "approved"), eq(careTaskTemplates.status, "published")))
          .groupBy(careTaskTemplates.plantId),
        db
          .select({ plantId: plantImages.plantId, n: sql<number>`count(*)`.mapWith(Number) })
          .from(plantImages)
          .where(inArray(plantImages.plantId, ids))
          .groupBy(plantImages.plantId),
      ])
    : [[], [], []];
  const count = (list: { plantId: string; n: number }[], id: string) => list.find((x) => x.plantId === id)?.n ?? 0;

  return rows.map((r) => {
    const sources = count(refCounts, r.id);
    const care = count(careCounts, r.id);
    const photos = count(imageCounts, r.id);
    const latest = latestByType(sections.filter((s) => s.plantId === r.id));
    const states = [...latest.values()];
    return {
      ...r,
      approved: states.filter((s) => s.reviewStatus === "approved").length,
      inReview: states.filter((s) => s.status === "in_review" && s.reviewStatus === "pending").length,
      drafts: states.filter((s) => s.status === "draft" && s.reviewStatus === "pending").length,
      sources,
      care,
      photos,
      ready: publishReadiness(sections.filter((s) => s.plantId === r.id), sources, care).ready,
      started: states.length,
    };
  });
}

export async function getAdminPlant(id: string) {
  const plant = await db.query.plants.findFirst({ where: eq(plants.id, id) });
  if (!plant) return null;
  const [categories, sections, refs] = await Promise.all([
    db.select({ id: plantCategories.id, name: plantCategories.name }).from(plantCategories).orderBy(asc(plantCategories.sortOrder)),
    db
      .select()
      .from(plantContentSections)
      .where(eq(plantContentSections.plantId, id))
      .orderBy(asc(plantContentSections.sectionType), desc(plantContentSections.version)),
    db
      .select({
        referenceId: plantReferences.id,
        sectionId: plantReferences.contentSectionId,
        sourceId: plantSources.id,
        title: plantSources.title,
        publisher: plantSources.publisher,
        url: plantSources.url,
        sourceType: plantSources.sourceType,
        note: plantReferences.referenceNote,
      })
      .from(plantReferences)
      .innerJoin(plantSources, eq(plantSources.id, plantReferences.sourceId))
      .innerJoin(plantContentSections, eq(plantContentSections.id, plantReferences.contentSectionId))
      .where(eq(plantContentSections.plantId, id)),
  ]);
  const sourceCount = new Set(refs.map((r) => r.sourceId)).size;
  const care = await getCareTemplates(id);
  const approvedCare = care.filter((c) => c.reviewStatus === "approved" && c.status === "published").length;
  const images = await getPlantImages(id);
  return { plant, categories, sections, refs, care, images, readiness: publishReadiness(sections, sourceCount, approvedCare) };
}

/** Latest "changes requested" note per section, so the writer sees what the expert asked for. */
export async function getReviewNotes(sectionIds: string[]): Promise<Map<string, string>> {
  if (!sectionIds.length) return new Map();
  const rows = await db
    .select({ entityId: auditLogs.entityId, after: auditLogs.after, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "plant_section.request_changes"), inArray(auditLogs.entityId, sectionIds)))
    .orderBy(desc(auditLogs.createdAt));
  const out = new Map<string, string>();
  for (const r of rows) {
    const note = (r.after as { note?: string } | null)?.note;
    if (note && !out.has(r.entityId)) out.set(r.entityId, note);
  }
  return out;
}

/** Plants that still have at least one empty section (never started). Published plants are left alone. */
export async function plantsNeedingDraft() {
  const rows = await db
    .select({ id: plants.id, commonName: plants.commonName })
    .from(plants)
    .where(and(eq(plants.status, "draft"), eq(plants.isSample, false)))
    .orderBy(asc(plants.commonName));
  if (!rows.length) return [];
  const started = await db
    .select({ plantId: plantContentSections.plantId, n: sql<number>`count(distinct ${plantContentSections.sectionType})`.mapWith(Number) })
    .from(plantContentSections)
    .where(inArray(plantContentSections.plantId, rows.map((r) => r.id)))
    .groupBy(plantContentSections.plantId);
  const count = new Map(started.map((s) => [s.plantId, s.n]));
  return rows.filter((r) => (count.get(r.id) ?? 0) < 6);
}

export type DraftAllStatus =
  | { state: "idle" }
  | { state: "running" | "finished" | "stopped"; total: number; done: number; failed: string[]; current: string | null; reason?: string; startedAt: Date };

/**
 * Progress of the latest "Draft all plants" run, read from the audit log
 * so it survives page reloads and works without any extra tables.
 */
export async function getDraftAllStatus(): Promise<DraftAllStatus> {
  const [start] = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, "plant.ai_draft_all.start"))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  if (!start) return { state: "idle" };
  const job = start.after as { plants: { id: string; name: string }[] };
  const ids = job.plants.map((p) => p.id);
  const events = await db
    .select({ action: auditLogs.action, entityId: auditLogs.entityId, after: auditLogs.after, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      and(
        inArray(auditLogs.action, ["plant.ai_draft", "plant.ai_draft_failed", "plant.ai_draft_all.stopped", "plant.ai_draft_all.finished"]),
        gte(auditLogs.createdAt, start.createdAt),
      ),
    )
    .orderBy(asc(auditLogs.createdAt));
  const doneIds = new Set(events.filter((e) => (e.action === "plant.ai_draft" || e.action === "plant.ai_draft_failed") && ids.includes(e.entityId)).map((e) => e.entityId));
  const failed = events
    .filter((e) => e.action === "plant.ai_draft_failed")
    .map((e) => job.plants.find((p) => p.id === e.entityId)?.name ?? "A plant");
  const stopped = events.find((e) => e.action === "plant.ai_draft_all.stopped");
  const finished = events.some((e) => e.action === "plant.ai_draft_all.finished");
  const next = job.plants.find((p) => !doneIds.has(p.id));
  const last = events.length ? events[events.length - 1].createdAt : start.createdAt;
  // A run with no progress for 10 minutes has died (for example, the server was restarted).
  const stale = !finished && !stopped && Date.now() - last.getTime() > 10 * 60_000;
  const base = { total: ids.length, done: doneIds.size, failed, startedAt: start.createdAt };
  if (stopped) return { ...base, state: "stopped", current: null, reason: (stopped.after as { reason?: string })?.reason };
  if (finished || !next) return { ...base, state: "finished", current: null };
  if (stale) return { ...base, state: "stopped", current: null, reason: "It stopped part-way, probably because the app was restarted." };
  return { ...base, state: "running", current: next.name };
}

export async function logDraftAll(actor: Actor, action: string, entityId: string, after: unknown) {
  await db.insert(auditLogs).values({ actorId: actor.id, action, entityType: "plant", entityId, after: after ?? null });
}

// ── Writes ─────────────────────────────────────────────────────

export type PlantBasics = {
  commonName: string;
  botanicalName: string | null;
  localNames: string[];
  categoryId: string;
  tagline: string | null;
  summaryLine: string | null;
};

export async function updatePlantBasics(actor: Actor, plantId: string, data: PlantBasics) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  await db.transaction(async (tx) => {
    const before = await tx.query.plants.findFirst({ where: eq(plants.id, plantId) });
    assert(Boolean(before), "Plant not found.", WorkflowError);
    await tx.update(plants).set({ ...data, isSample: false }).where(eq(plants.id, plantId));
    await audit(tx, actor, "plant.update_basics", "plant", plantId, pick(before!, Object.keys(data)), data);
  });
}

async function latestSection(tx: Tx, plantId: string, type: PillarType) {
  const [row] = await tx
    .select()
    .from(plantContentSections)
    .where(and(eq(plantContentSections.plantId, plantId), eq(plantContentSections.sectionType, type)))
    .orderBy(desc(plantContentSections.version))
    .limit(1);
  return row;
}

/** Writes a section edit, following planEdit: approved text stays live while the new version is reviewed. */
async function writeSection(tx: Tx, plantId: string, type: PillarType, title: string, body: string, aiDrafted: boolean) {
  const latest = await latestSection(tx, plantId, type);
  const plan = planEdit(latest);
  if (plan.kind === "update") {
    await tx
      .update(plantContentSections)
      .set({ title, body, aiDrafted, status: "draft", reviewStatus: "pending", reviewedBy: null, reviewedAt: null })
      .where(eq(plantContentSections.id, latest!.id));
    return latest!.id;
  }
  const [created] = await tx
    .insert(plantContentSections)
    .values({ plantId, sectionType: type, title, body, version: plan.version, aiDrafted, status: "draft", reviewStatus: "pending" })
    .returning({ id: plantContentSections.id });
  // Carry sources forward to the new version.
  if (latest) {
    const refs = await tx.select().from(plantReferences).where(eq(plantReferences.contentSectionId, latest.id));
    if (refs.length)
      await tx.insert(plantReferences).values(refs.map((r) => ({ contentSectionId: created.id, sourceId: r.sourceId, referenceNote: r.referenceNote })));
  }
  return created.id;
}

export async function saveSection(actor: Actor, plantId: string, type: PillarType, title: string, body: string) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  await db.transaction(async (tx) => {
    const latest = await latestSection(tx, plantId, type);
    const id = await writeSection(tx, plantId, type, title, body, false);
    await audit(tx, actor, "plant_section.save", "plant_content_section", id, latest ? { version: latest.version, title: latest.title } : null, { type, title });
  });
}

/** Sends every draft section (not ones sent back with changes requested) for review. One plant, or all plants. */
export async function submitAllDrafts(actor: Actor, plantId?: string): Promise<number> {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(plantContentSections)
      .where(plantId ? eq(plantContentSections.plantId, plantId) : sql`true`);
    // Only the latest version of each section counts.
    const latest = new Map<string, typeof rows[number]>();
    for (const r of rows) {
      const key = `${r.plantId}:${r.sectionType}`;
      if (!latest.has(key) || latest.get(key)!.version < r.version) latest.set(key, r);
    }
    const toSend = [...latest.values()].filter((r) => r.status === "draft" && r.reviewStatus === "pending");
    if (toSend.length) {
      await tx.update(plantContentSections).set({ status: "in_review" }).where(inArray(plantContentSections.id, toSend.map((r) => r.id)));
      await audit(tx, actor, "plant_section.submit_all", "plant", plantId ?? "all", null, { count: toSend.length });
    }
    return toSend.length;
  });
}

export async function submitSection(actor: Actor, plantId: string, type: PillarType) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  await db.transaction(async (tx) => {
    const latest = await latestSection(tx, plantId, type);
    assert(canSubmit(latest), "Only a draft can be sent for review.", WorkflowError);
    await tx.update(plantContentSections).set({ status: "in_review", reviewStatus: "pending" }).where(eq(plantContentSections.id, latest!.id));
    await audit(tx, actor, "plant_section.submit", "plant_content_section", latest!.id, null, { type, version: latest!.version });
  });
}

export async function reviewSection(actor: Actor, plantId: string, type: PillarType, decision: "approve" | "request_changes", note: string | null) {
  assert(canApprovePlants(actor.roles), "Only a plant expert can review content.");
  await db.transaction(async (tx) => {
    const latest = await latestSection(tx, plantId, type);
    assert(canReview(latest), "This section isn't waiting for review.", WorkflowError);
    const approve = decision === "approve";
    await tx
      .update(plantContentSections)
      .set({
        status: approve ? "published" : "draft",
        reviewStatus: approve ? "approved" : "rejected",
        reviewedBy: actor.id,
        reviewedAt: new Date(),
      })
      .where(eq(plantContentSections.id, latest!.id));
    // Older approved versions are retired once a newer one is approved.
    if (approve)
      await tx
        .update(plantContentSections)
        .set({ status: "archived" })
        .where(
          and(
            eq(plantContentSections.plantId, plantId),
            eq(plantContentSections.sectionType, type),
            sql`${plantContentSections.version} < ${latest!.version}`,
            eq(plantContentSections.status, "published"),
          ),
        );
    await audit(tx, actor, approve ? "plant_section.approve" : "plant_section.request_changes", "plant_content_section", latest!.id, null, {
      type,
      version: latest!.version,
      note,
    });
  });
}

export type SourceInput = { title: string; publisher: string | null; url: string | null; sourceType: string; note: string | null };

export async function addSource(actor: Actor, plantId: string, type: PillarType, input: SourceInput) {
  assert(canEditPlants(actor.roles) || canApprovePlants(actor.roles), "You don't have permission to add sources.");
  await db.transaction(async (tx) => {
    const latest = await latestSection(tx, plantId, type);
    assert(Boolean(latest), "Write this section before adding a source.", WorkflowError);
    const [src] = await tx
      .insert(plantSources)
      .values({ title: input.title, publisher: input.publisher, url: input.url, sourceType: input.sourceType })
      .returning({ id: plantSources.id });
    await tx.insert(plantReferences).values({ contentSectionId: latest!.id, sourceId: src.id, referenceNote: input.note });
    await audit(tx, actor, "plant_source.add", "plant_content_section", latest!.id, null, { type, ...input });
  });
}

export async function removeReference(actor: Actor, plantId: string, referenceId: string) {
  assert(canEditPlants(actor.roles) || canApprovePlants(actor.roles), "You don't have permission to remove sources.");
  await db.transaction(async (tx) => {
    const [ref] = await tx
      .select({ id: plantReferences.id, sectionId: plantReferences.contentSectionId, status: plantContentSections.status, note: plantReferences.referenceNote })
      .from(plantReferences)
      .innerJoin(plantContentSections, eq(plantContentSections.id, plantReferences.contentSectionId))
      .where(and(eq(plantReferences.id, referenceId), eq(plantContentSections.plantId, plantId)));
    assert(Boolean(ref), "Source not found.", WorkflowError);
    // AI-suggested sources can always be removed: the expert may spot a weak one after approving.
    assert(ref!.status !== "published" || ref!.note === AI_SOURCE_NOTE, "This source backs approved text. Edit the section to change its sources.", WorkflowError);
    await tx.delete(plantReferences).where(eq(plantReferences.id, referenceId));
    await audit(tx, actor, "plant_source.remove", "plant_reference", referenceId, ref, null);
  });
}

/** Draft plants (not samples) with no care routine yet (retired tasks don't count). */
export async function plantsNeedingCare() {
  const rows = await db
    .select({ id: plants.id, commonName: plants.commonName })
    .from(plants)
    .where(and(eq(plants.status, "draft"), eq(plants.isSample, false)))
    .orderBy(asc(plants.commonName));
  if (!rows.length) return [];
  const withCare = await db
    .selectDistinct({ plantId: careTaskTemplates.plantId })
    .from(careTaskTemplates)
    .where(and(inArray(careTaskTemplates.plantId, rows.map((r) => r.id)), ne(careTaskTemplates.status, "archived")));
  const has = new Set(withCare.map((r) => r.plantId));
  return rows.filter((r) => !has.has(r.id));
}

/**
 * Owner-only launch shortcut: approves everything waiting for review on every draft plant,
 * then publishes each plant that's ready. Plants that still miss something are listed, not published.
 */
export async function approveAndPublishAll(actor: Actor) {
  assert(actor.roles.includes("super_admin"), "Only the owner can approve and publish everything at once.");
  const list = await db
    .select({ id: plants.id, name: plants.commonName })
    .from(plants)
    .where(and(eq(plants.status, "draft"), eq(plants.isSample, false)))
    .orderBy(asc(plants.commonName));
  const published: string[] = [];
  const notReady: { name: string; missing: string[] }[] = [];
  for (const p of list) {
    await approveAllForPlant(actor, p.id);
    const data = await getAdminPlant(p.id);
    if (data?.readiness.ready) {
      await setPlantPublished(actor, p.id, true);
      published.push(p.name);
    } else notReady.push({ name: p.name, missing: data?.readiness.missing ?? ["Plant not found"] });
  }
  return { published, notReady };
}

/** Draft plants (not samples) with no sources at all, for the AI to suggest some. */
export async function plantsNeedingSources() {
  const rows = await db
    .select({ id: plants.id, commonName: plants.commonName })
    .from(plants)
    .where(and(eq(plants.status, "draft"), eq(plants.isSample, false)))
    .orderBy(asc(plants.commonName));
  if (!rows.length) return [];
  const withRefs = await db
    .selectDistinct({ plantId: plantContentSections.plantId })
    .from(plantReferences)
    .innerJoin(plantContentSections, eq(plantContentSections.id, plantReferences.contentSectionId))
    .where(inArray(plantContentSections.plantId, rows.map((r) => r.id)));
  const has = new Set(withRefs.map((r) => r.plantId));
  return rows.filter((r) => !has.has(r.id));
}

/**
 * Attaches AI-suggested, link-checked sources to the plant's latest version of every section.
 * They're labelled so the expert knows to confirm them while reviewing. Returns how many were added.
 */
export async function attachAiSources(actor: Actor, plantId: string, sources: SuggestedSource[]): Promise<number> {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  if (!sources.length) return 0;
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(plantContentSections).where(eq(plantContentSections.plantId, plantId));
    const latest = [...latestByType(rows).values()];
    if (!latest.length) return 0;
    const existing = await tx
      .select({ url: plantSources.url })
      .from(plantReferences)
      .innerJoin(plantSources, eq(plantSources.id, plantReferences.sourceId))
      .where(inArray(plantReferences.contentSectionId, latest.map((l) => l.id)));
    const known = new Set(existing.map((e) => e.url?.replace(/\/+$/, "").toLowerCase()));
    let added = 0;
    for (const s of sources) {
      if (known.has(s.url.replace(/\/+$/, "").toLowerCase())) continue;
      const [src] = await tx
        .insert(plantSources)
        .values({ title: s.title, publisher: s.publisher, url: s.url, sourceType: s.sourceType })
        .returning({ id: plantSources.id });
      await tx.insert(plantReferences).values(latest.map((l) => ({ contentSectionId: l.id, sourceId: src.id, referenceNote: AI_SOURCE_NOTE })));
      added++;
    }
    await audit(tx, actor, "plant.ai_sources", "plant", plantId, null, { added, urls: sources.map((s) => s.url) });
    return added;
  });
}

/** Saves an AI draft into sections that aren't approved or in review. Returns which pillars were filled. */
export async function applyAiDraft(actor: Actor, plantId: string, draft: PlantDraft, opts: { onlyEmpty?: boolean } = {}) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  return db.transaction(async (tx) => {
    const filled: PillarType[] = [];
    const skipped: PillarType[] = [];
    for (const s of draft.sections) {
      const latest = await latestSection(tx, plantId, s.type);
      // Bulk drafting only fills empty sections, so nobody's edits are replaced.
      if (opts.onlyEmpty ? latest !== undefined : !aiMayDraft(latest)) {
        skipped.push(s.type);
        continue;
      }
      const sectionId = await writeSection(tx, plantId, s.type, s.title, s.body, true);
      // Owner decision: AI drafts go straight to the expert's review queue.
      await tx.update(plantContentSections).set({ status: "in_review", reviewStatus: "pending" }).where(eq(plantContentSections.id, sectionId));
      filled.push(s.type);
    }
    await tx.update(plants).set({ aiDrafted: true }).where(eq(plants.id, plantId));
    await audit(tx, actor, "plant.ai_draft", "plant", plantId, null, { filled, skipped });
    return { filled, skipped };
  });
}

export async function setPlantPublished(actor: Actor, plantId: string, publish: boolean) {
  assert(canPublishPlants(actor.roles), "You don't have permission to publish plants.");
  if (publish) {
    const data = await getAdminPlant(plantId);
    assert(Boolean(data), "Plant not found.", WorkflowError);
    assert(data!.readiness.ready, `Not ready yet: ${data!.readiness.missing.join("; ")}.`, WorkflowError);
  }
  await db.transaction(async (tx) => {
    const before = await tx.query.plants.findFirst({ where: eq(plants.id, plantId) });
    await tx
      .update(plants)
      .set(publish ? { status: "published", publishedAt: new Date(), isSample: false } : { status: "draft" })
      .where(eq(plants.id, plantId));
    await audit(tx, actor, publish ? "plant.publish" : "plant.unpublish", "plant", plantId, { status: before?.status }, { status: publish ? "published" : "draft" });
  });
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

// ── Care routine (reviewed templates the care engine turns into members' daily tasks) ──

export type CareInput = { taskType: string; title: string; instructions: string; everyDays: number; startAfterDays: number };

export async function getCareTemplates(plantId: string) {
  return db
    .select()
    .from(careTaskTemplates)
    .where(and(eq(careTaskTemplates.plantId, plantId), sql`${careTaskTemplates.status} <> 'archived'`))
    .orderBy(asc(careTaskTemplates.createdAt));
}

async function careRow(tx: Tx, plantId: string, id: string) {
  const [row] = await tx.select().from(careTaskTemplates).where(and(eq(careTaskTemplates.id, id), eq(careTaskTemplates.plantId, plantId))).for("update");
  assert(Boolean(row), "Care task not found.", WorkflowError);
  return row!;
}

const careValues = (c: CareInput) => ({
  taskType: c.taskType as typeof careTaskTemplates.$inferInsert.taskType,
  title: c.title,
  instructions: c.instructions,
  timingRule: { everyDays: c.everyDays, startAfterDays: c.startAfterDays },
});

export async function addCareTemplate(actor: Actor, plantId: string, c: CareInput) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(careTaskTemplates).values({ plantId, ...careValues(c), reviewStatus: "pending", status: "draft" }).returning({ id: careTaskTemplates.id });
    await audit(tx, actor, "care_template.add", "care_task_template", row.id, null, c);
  });
}

/** Drafts can be edited freely. Approved tasks are retired and replaced instead, so members' schedules stay stable. */
export async function updateCareTemplate(actor: Actor, plantId: string, id: string, c: CareInput) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  await db.transaction(async (tx) => {
    const row = await careRow(tx, plantId, id);
    assert(row.reviewStatus !== "approved", "This task is approved and in use. Add a new task, then retire this one.", WorkflowError);
    await tx.update(careTaskTemplates).set({ ...careValues(c), reviewStatus: "pending", status: "draft" }).where(eq(careTaskTemplates.id, id));
    await audit(tx, actor, "care_template.update", "care_task_template", id, { title: row.title, timingRule: row.timingRule }, c);
  });
}

export async function reviewCareTemplate(actor: Actor, plantId: string, id: string, approve: boolean, note: string | null) {
  assert(canApprovePlants(actor.roles), "Only a plant expert can review content.");
  await db.transaction(async (tx) => {
    const row = await careRow(tx, plantId, id);
    assert(row.reviewStatus !== "approved", "This task is already approved.", WorkflowError);
    await tx
      .update(careTaskTemplates)
      .set(approve ? { reviewStatus: "approved", status: "published" } : { reviewStatus: "rejected", status: "draft" })
      .where(eq(careTaskTemplates.id, id));
    await audit(tx, actor, approve ? "care_template.approve" : "care_template.request_changes", "care_task_template", id, null, { note });
  });
}

/** Removes a task from new and existing schedules. History is kept. */
export async function retireCareTemplate(actor: Actor, plantId: string, id: string) {
  assert(canEditPlants(actor.roles) || canApprovePlants(actor.roles), "You don't have permission to edit plants.");
  await db.transaction(async (tx) => {
    await careRow(tx, plantId, id);
    await tx.update(careTaskTemplates).set({ status: "archived" }).where(eq(careTaskTemplates.id, id));
    await audit(tx, actor, "care_template.retire", "care_task_template", id, null, null);
  });
}

export async function applyAiCareDraft(actor: Actor, plantId: string, tasks: CareInput[]) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  await db.transaction(async (tx) => {
    for (const c of tasks) await tx.insert(careTaskTemplates).values({ plantId, ...careValues(c), reviewStatus: "pending", status: "draft" });
    await audit(tx, actor, "care_template.ai_draft", "plant", plantId, null, { count: tasks.length });
  });
}

/**
 * Super admins only: approves every section and care task of one plant that's waiting for review.
 * Same effect as approving each one, including retiring older approved versions. Audited as a bulk approval.
 */
export async function approveAllForPlant(actor: Actor, plantId: string): Promise<{ sections: number; care: number }> {
  assert(actor.roles.includes("super_admin"), "Only a super admin can approve everything at once.");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(plantContentSections).where(eq(plantContentSections.plantId, plantId)).for("update");
    const latest = latestByType(rows);
    const waiting = [...latest.values()].filter((s) => canReview(s));
    const now = new Date();
    for (const s of waiting) {
      await tx
        .update(plantContentSections)
        .set({ status: "archived" })
        .where(and(eq(plantContentSections.plantId, plantId), eq(plantContentSections.sectionType, s.sectionType), sql`${plantContentSections.version} < ${s.version}`, eq(plantContentSections.status, "published")));
      await tx.update(plantContentSections).set({ status: "published", reviewStatus: "approved", reviewedBy: actor.id, reviewedAt: now }).where(eq(plantContentSections.id, s.id));
    }
    const care = await tx
      .update(careTaskTemplates)
      .set({ reviewStatus: "approved", status: "published" })
      .where(and(eq(careTaskTemplates.plantId, plantId), eq(careTaskTemplates.reviewStatus, "pending"), eq(careTaskTemplates.status, "draft")))
      .returning({ id: careTaskTemplates.id });
    if (waiting.length || care.length)
      await audit(tx, actor, "plant.approve_all", "plant", plantId, null, { sections: waiting.map((s) => s.sectionType), careTasks: care.length });
    return { sections: waiting.length, care: care.length };
  });
}

// ── Plant photos (public; shown on Discover, plant pages and in gardens) ──

export async function getPlantImages(plantId: string) {
  return db.select().from(plantImages).where(eq(plantImages.plantId, plantId)).orderBy(asc(plantImages.sortOrder), asc(plantImages.createdAt));
}

export async function addPlantImage(actor: Actor, plantId: string, file: File, altText: string, caption: string | null) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  const problem = await inspectPhoto(file, PLANT_PHOTO_RULES);
  if (problem) throw new WorkflowError(problem);
  const plant = await db.query.plants.findFirst({ where: eq(plants.id, plantId), columns: { id: true } });
  assert(Boolean(plant), "Plant not found.", WorkflowError);
  const path = photoPath(`plants/${plantId}`, file.type as keyof typeof IMAGE_TYPES, randomUUID());
  await uploadTo(BUCKETS.plants, path, file);
  try {
    await db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(plantImages).where(eq(plantImages.plantId, plantId));
      await tx.insert(plantImages).values({ plantId, storagePath: path, altText, caption, sortOrder: n });
      await audit(tx, actor, "plant.image_add", "plant", plantId, null, { path, altText });
    });
  } catch (err) {
    await removeFrom(BUCKETS.plants, path);
    throw err;
  }
}

export async function removePlantImage(actor: Actor, plantId: string, imageId: string) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  const path = await db.transaction(async (tx) => {
    const [img] = await tx.select().from(plantImages).where(and(eq(plantImages.id, imageId), eq(plantImages.plantId, plantId)));
    assert(Boolean(img), "Photo not found.", WorkflowError);
    await tx.delete(plantImages).where(eq(plantImages.id, imageId));
    await audit(tx, actor, "plant.image_remove", "plant", plantId, { path: img!.storagePath }, null);
    return img!.storagePath;
  });
  await removeFrom(BUCKETS.plants, path);
}

export async function makePlantCover(actor: Actor, plantId: string, imageId: string) {
  assert(canEditPlants(actor.roles), "You don't have permission to edit plants.");
  await db.transaction(async (tx) => {
    const imgs = await tx.select({ id: plantImages.id }).from(plantImages).where(eq(plantImages.plantId, plantId)).orderBy(asc(plantImages.sortOrder), asc(plantImages.createdAt));
    assert(imgs.some((i) => i.id === imageId), "Photo not found.", WorkflowError);
    const order = [imageId, ...imgs.map((i) => i.id).filter((x) => x !== imageId)];
    for (const [i, id] of order.entries()) await tx.update(plantImages).set({ sortOrder: i }).where(eq(plantImages.id, id));
    await audit(tx, actor, "plant.image_cover", "plant", plantId, null, { imageId });
  });
}
