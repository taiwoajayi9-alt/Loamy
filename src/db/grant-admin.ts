/**
 * Gives an existing Loamy account an admin role.
 * Usage: npm run admin:grant -- you@example.com super_admin
 * Roles: super_admin, content_admin, commerce_admin, support_admin, plant_expert
 * The person must have signed up (and logged in once) first.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as s from "./schema";

try {
  process.loadEnvFile(".env.local");
} catch {}

const ROLES = ["super_admin", "content_admin", "commerce_admin", "support_admin", "plant_expert"] as const;

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !ROLES.includes(role as (typeof ROLES)[number])) {
    console.error(`Usage: npm run admin:grant -- <email> <${ROLES.join("|")}>`);
    process.exit(1);
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or DIRECT_URL) first.");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema: s, casing: "snake_case" });
  try {
    const user = await db.query.users.findFirst({ where: eq(s.users.email, email.toLowerCase()) });
    if (!user) {
      console.error(`No account for ${email}. Sign up and log in once, then try again.`);
      process.exitCode = 1;
      return;
    }
    await db
      .insert(s.adminRoleAssignments)
      .values({ userId: user.id, role: role as (typeof ROLES)[number] })
      .onConflictDoNothing();
    await db.insert(s.auditLogs).values({ actorId: null, action: "admin_role.grant", entityType: "user", entityId: user.id, after: { role, via: "cli" } });
    console.log(`${email} is now ${role}.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
