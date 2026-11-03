/**
 * Fails if any table in the public schema has row-level security disabled.
 * Run after migrations (CI does). New tables must ship with RLS enabled in their migration:
 *   ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
 */
import postgres from "postgres";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_URL (or DATABASE_URL).");
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql<{ tablename: string }[]>`
      select c.relname as tablename
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by 1`;
    if (rows.length) {
      console.error("Tables without row-level security:\n" + rows.map((r) => ` - ${r.tablename}`).join("\n"));
      process.exitCode = 1;
    } else {
      console.log("Row-level security is enabled on every public table.");
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
