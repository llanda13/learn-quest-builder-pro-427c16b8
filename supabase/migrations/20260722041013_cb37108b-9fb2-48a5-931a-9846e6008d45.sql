
-- collaboration_messages
DROP POLICY IF EXISTS "Authenticated users can view collaboration messages" ON public.collaboration_messages;
DROP POLICY IF EXISTS "Authenticated users can create collaboration messages" ON public.collaboration_messages;
CREATE POLICY "Users can view own collaboration messages"
  ON public.collaboration_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own collaboration messages"
  ON public.collaboration_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- document_activity
DROP POLICY IF EXISTS "Authenticated users can view document activity" ON public.document_activity;
DROP POLICY IF EXISTS "Authenticated users can create document activity" ON public.document_activity;
CREATE POLICY "Users can view own document activity"
  ON public.document_activity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own document activity"
  ON public.document_activity FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- learning_competencies: admin-only writes, keep read
DROP POLICY IF EXISTS "Authenticated users can manage learning competencies" ON public.learning_competencies;
CREATE POLICY "Admins can manage learning competencies"
  ON public.learning_competencies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- question_similarities: admin-only writes
DROP POLICY IF EXISTS "Authenticated users can manage question similarities" ON public.question_similarities;
CREATE POLICY "Admins can manage question similarities"
  ON public.question_similarities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- question_standards: admin-only writes
DROP POLICY IF EXISTS "Authenticated users can manage question standards" ON public.question_standards;
CREATE POLICY "Admins can manage question standards"
  ON public.question_standards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Revoke SELECT from anon on all public app tables (auth-only app)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.tablename);
  END LOOP;
END $$;

-- Revoke EXECUTE on SECURITY DEFINER helper/trigger functions from anon and public
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.log_classification_metric(uuid, numeric, text, numeric) FROM anon, public;
REVOKE ALL ON FUNCTION public.get_user_question_stats(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.cleanup_old_presence() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.calculate_similarity_metrics() FROM anon, public;
REVOKE ALL ON FUNCTION public.mark_question_used(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.check_question_similarity(text, text, text, numeric) FROM anon, public;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
-- has_role stays executable to authenticated (needed by RLS policies)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
