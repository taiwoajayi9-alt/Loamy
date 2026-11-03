import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { plants, savedPlants } from "@/db/schema";

export async function isSaved(userId: string, plantId: string): Promise<boolean> {
  const row = await db.query.savedPlants.findFirst({ where: and(eq(savedPlants.userId, userId), eq(savedPlants.plantId, plantId)) });
  return Boolean(row);
}

export async function savedCount(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(savedPlants)
    .innerJoin(plants, eq(plants.id, savedPlants.plantId))
    .where(and(eq(savedPlants.userId, userId), eq(plants.status, "published")));
  return r?.n ?? 0;
}

/** Saves or un-saves a published plant. Returns whether it's saved now. */
export async function toggleSaved(userId: string, slug: string): Promise<{ saved: boolean; plantId: string } | null> {
  const plant = await db.query.plants.findFirst({ where: and(eq(plants.slug, slug), eq(plants.status, "published")) });
  if (!plant) return null;
  const removed = await db
    .delete(savedPlants)
    .where(and(eq(savedPlants.userId, userId), eq(savedPlants.plantId, plant.id)))
    .returning({ id: savedPlants.id });
  if (removed.length) return { saved: false, plantId: plant.id };
  await db.insert(savedPlants).values({ userId, plantId: plant.id }).onConflictDoNothing();
  return { saved: true, plantId: plant.id };
}
