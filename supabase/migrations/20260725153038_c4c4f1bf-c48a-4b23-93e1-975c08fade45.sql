
-- Convert has_role to SECURITY INVOKER (works because user_roles has "Users can view their own roles" policy)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Revoke EXECUTE from callable roles on SECURITY DEFINER trigger/maintenance functions
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_presence() FROM PUBLIC, anon, authenticated;

-- Ensure GraphQL visibility is disabled on all public tables (re-apply defensively)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r'
  LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', r.relname, '@graphql({"visible": false})');
    -- Also explicitly revoke SELECT from authenticated/anon to remove GraphQL introspection surface
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;
