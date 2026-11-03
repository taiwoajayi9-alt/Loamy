import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Server-only database client. Uses the pooled DATABASE_URL (Supabase transaction pooler in production),
 * so prepared statements are disabled. Never import this from client components.
 *
 * The connection is created lazily on first use so `next build` and pages that don't touch the
 * database work without DATABASE_URL.
 */
export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { loamyDb?: Db };

function connect(): Db {
  if (globalForDb.loamyDb) return globalForDb.loamyDb;
  const sql = postgres(env.server().DATABASE_URL, { prepare: false, max: 5 });
  const instance = drizzle(sql, { schema, casing: "snake_case" });
  globalForDb.loamyDb = instance;
  return instance;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = connect();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
