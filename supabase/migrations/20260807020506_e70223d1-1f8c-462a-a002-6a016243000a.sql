
-- 1. collaboration_messages: prevent identity/email spoofing; derive from the caller's profile
CREATE OR REPLACE FUNCTION public.enforce_collaboration_message_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  NEW.user_id := auth.uid();

  SELECT p.full_name, p.email INTO v_name, v_email
  FROM public.profiles p WHERE p.id = auth.uid();

  NEW.user_name := COALESCE(v_name, NEW.user_name);
  NEW.user_email := v_email;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_collaboration_message_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_collaboration_message_identity_trg ON public.collaboration_messages;
CREATE TRIGGER enforce_collaboration_message_identity_trg
BEFORE INSERT OR UPDATE ON public.collaboration_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_collaboration_message_identity();

-- 2. ai_generation_logs: reviewers can read the logs they approved
DROP POLICY IF EXISTS "Users can view own AI logs" ON public.ai_generation_logs;
CREATE POLICY "Users can view own AI logs"
ON public.ai_generation_logs
FOR SELECT
TO authenticated
USING (
  generated_by = auth.uid()
  OR approved_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Hide every public table/view from the GraphQL schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','f','p')
  LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', r.relname, '@graphql({"visible": false})');
  END LOOP;
END $$;

REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
