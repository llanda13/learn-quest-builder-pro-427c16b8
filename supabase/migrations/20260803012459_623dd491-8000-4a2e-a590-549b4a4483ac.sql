
-- 1. ai_generation_logs: explicit admin-only UPDATE/DELETE
DROP POLICY IF EXISTS "Admins can update AI logs" ON public.ai_generation_logs;
CREATE POLICY "Admins can update AI logs"
ON public.ai_generation_logs FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete AI logs" ON public.ai_generation_logs;
CREATE POLICY "Admins can delete AI logs"
ON public.ai_generation_logs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. assembly_versions: guarantee referential integrity so ownership subquery can never orphan
DELETE FROM public.assembly_versions av
WHERE av.assembly_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.test_assemblies t WHERE t.id = av.assembly_id);

ALTER TABLE public.assembly_versions ALTER COLUMN assembly_id SET NOT NULL;

ALTER TABLE public.assembly_versions DROP CONSTRAINT IF EXISTS assembly_versions_assembly_id_fkey;
ALTER TABLE public.assembly_versions
  ADD CONSTRAINT assembly_versions_assembly_id_fkey
  FOREIGN KEY (assembly_id) REFERENCES public.test_assemblies(id) ON DELETE CASCADE;

-- 3. system_settings: restrict broad read to non-sensitive keys only
DROP POLICY IF EXISTS "Authenticated users can read system settings" ON public.system_settings;
CREATE POLICY "Authenticated users can read public system settings"
ON public.system_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR key IN ('active_school_year', 'dept_officers')
);

-- 4. Re-hide all public tables from GraphQL
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace
             AND c.relkind IN ('r','v','m','f')
  LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', r.relname, '@graphql({"visible": false})');
  END LOOP;
END $$;

REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
