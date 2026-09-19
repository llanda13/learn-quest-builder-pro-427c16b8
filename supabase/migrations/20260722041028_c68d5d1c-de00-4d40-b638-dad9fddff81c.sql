
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format($f$COMMENT ON TABLE public.%I IS '@graphql({"visible": false})'$f$, r.tablename);
  END LOOP;
END $$;
