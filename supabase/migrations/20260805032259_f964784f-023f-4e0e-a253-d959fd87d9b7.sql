-- 1. question_similarities: restrict reads to owners/admins, writes admin-only
DROP POLICY IF EXISTS "Authenticated users can read question similarities" ON public.question_similarities;
DROP POLICY IF EXISTS "Admins can manage question similarities" ON public.question_similarities;

CREATE POLICY "Owners or admins can read question similarities"
ON public.question_similarities
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id IN (question_similarities.question1_id, question_similarities.question2_id)
      AND q.owner = auth.uid()
  )
);

CREATE POLICY "Admins can insert question similarities"
ON public.question_similarities
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update question similarities"
ON public.question_similarities
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete question similarities"
ON public.question_similarities
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.question_similarities FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_similarities TO authenticated;
GRANT ALL ON public.question_similarities TO service_role;

-- 2. Hide all public tables from the GraphQL schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', r.tablename, '@graphql({"visible": false})');
  END LOOP;
END $$;

REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;