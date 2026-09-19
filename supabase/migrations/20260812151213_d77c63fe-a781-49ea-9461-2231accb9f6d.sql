-- 1) Lock down SECURITY DEFINER trigger function executable by anon/authenticated
REVOKE ALL ON FUNCTION public.enforce_document_activity_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_document_activity_identity() TO service_role;

-- Defensive: ensure other SECURITY DEFINER functions are not client-callable
REVOKE ALL ON FUNCTION public.enforce_collaboration_message_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_question_authorship() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_presence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_presence() TO service_role;

-- 2) Keep the GraphQL API closed to client roles and hide every public object from it
REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','f')
  LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', r.relname, '@graphql({"visible": false})');
  END LOOP;
END $$;