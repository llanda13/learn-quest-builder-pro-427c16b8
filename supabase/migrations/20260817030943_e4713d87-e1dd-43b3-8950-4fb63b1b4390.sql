REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated, PUBLIC;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated, PUBLIC;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','f','p')
  LOOP
    EXECUTE format(
      'COMMENT ON TABLE public.%I IS %L',
      r.relname,
      '@graphql({"totalCount": {"enabled": false}, "hide": true})'
    );
  END LOOP;
END $$;