import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  adminRoleAssignments,
  auditLogs,
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
import type { PlantDraft } from "@/lib/ai/plant-draft";
import { requireUser, type SessionUser } from "./auth";

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

  return rows.map((r) => {
    const latest = latestByType(sections.filter((s) => s.plantId === r.id));
    const states = [...latest.values()];
    return {
      ...r,
      approved: states.filter((s) => s.reviewStatus === "approved").length,
      inReview: states.filter((s) => s.status === "in_review" && s.reviewStatus === "pending").length,
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
  return { plant, categories, sections, refs, readiness: publishReadiness(sections, sourceCount) };
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
      .select({ id: plantReferences.id, sectionId: plantReferences.contentSectionId, status: plantContentSections.status })
      .from(plantReferences)
      .innerJoin(plantContentSections, eq(plantContentSections.id, plantReferences.contentSectionId))
      .where(and(eq(plantReferences.id, referenceId), eq(plantContentSections.plantId, plantId)));
    assert(Boolean(ref), "Source not found.", WorkflowError);
    assert(ref!.status !== "published", "This source backs approved text. Edit the section to change its sources.", WorkflowError);
    await tx.delete(plantReferences).where(eq(plantReferences.id, referenceId));
    await audit(tx, actor, "plant_source.remove", "plant_reference", referenceId, ref, null);
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
      await writeSection(tx, plantId, s.type, s.title, s.body, true);
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
