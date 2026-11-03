import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    // Use the direct (non-pooled) connection for migrations.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
