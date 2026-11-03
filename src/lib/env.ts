import { z } from "zod";

/**
 * Typed, validated environment access.
 * Read lazily so `next build` works without secrets; a missing variable fails loudly where it's used.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  /** Supabase publishable key (sb_publishable_…). Safe in the browser; data access is still locked by RLS. */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  /** Supabase secret key (sb_secret_…). Server-only admin access; never import into client code. */
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function readPublic(): PublicEnv {
  // Each NEXT_PUBLIC_ var must be referenced literally so Next can inline it in the browser bundle.
  return publicSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export const env = {
  public: readPublic,
  server(): ServerEnv {
    if (typeof window !== "undefined") throw new Error("Server env read in the browser.");
    return serverSchema.parse(process.env);
  },
  /** True when Supabase Auth is configured. Lets pages render a clear notice instead of crashing in local dev. */
  authConfigured(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  },
};
