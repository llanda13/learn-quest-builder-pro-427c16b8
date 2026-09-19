-- 1. collaboration_messages: owner-scoped update/delete
DROP POLICY IF EXISTS "Users can update own collaboration messages" ON public.collaboration_messages;
CREATE POLICY "Users can update own collaboration messages"
ON public.collaboration_messages FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can delete own collaboration messages" ON public.collaboration_messages;
CREATE POLICY "Users can delete own collaboration messages"
ON public.collaboration_messages FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2. document_activity: owner-scoped update/delete
DROP POLICY IF EXISTS "Users can update own document activity" ON public.document_activity;
CREATE POLICY "Users can update own document activity"
ON public.document_activity FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can delete own document activity" ON public.document_activity;
CREATE POLICY "Users can delete own document activity"
ON public.document_activity FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. questions: enforce trustworthy authorship server-side
CREATE OR REPLACE FUNCTION public.enforce_question_authorship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.owner := auth.uid();
    ELSE
      NEW.owner := OLD.owner;
    END IF;
  END IF;

  -- created_by is a descriptive label only; never a trust signal
  IF NEW.created_by IS NULL OR lower(NEW.created_by) NOT IN ('ai', 'teacher', 'import') THEN
    NEW.created_by := 'teacher';
  ELSE
    NEW.created_by := lower(NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_question_authorship() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_question_authorship_trg ON public.questions;
CREATE TRIGGER enforce_question_authorship_trg
BEFORE INSERT OR UPDATE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.enforce_question_authorship();

-- 4. Hide all public tables/views from GraphQL
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