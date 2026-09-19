DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS obj
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','f','p')
  LOOP
    EXECUTE format('COMMENT ON TABLE %s IS %L', r.obj, '@graphql({"totalCount": {"enabled": false}, "hide": true})');
  END LOOP;
END $$;

REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated, PUBLIC;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM anon, authenticated, PUBLIC;