
-- Disable pg_graphql access for client roles (PostgREST/REST continues to work)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='graphql') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA graphql FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='graphql_public') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA graphql_public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated';
  END IF;
END $$;
