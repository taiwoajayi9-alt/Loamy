-- Lock every app table behind row-level security.
-- Supabase exposes the public schema through its Data API to anyone holding the publishable key.
-- With RLS on and no policies, those roles see nothing. The app connects directly as the table owner,
-- which bypasses RLS, and enforces access in server code (requireUser / requireEntitlement / requireAdmin).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
