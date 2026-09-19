
-- 1) Profiles: add INSERT + DELETE policies for owning user
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE TO authenticated
  USING (auth.uid() = id);

-- 2) test_exports: add owner-scoped UPDATE and DELETE policies
CREATE POLICY "Users can update own test exports"
  ON public.test_exports FOR UPDATE TO authenticated
  USING (exported_by_user = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (exported_by_user = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own test exports"
  ON public.test_exports FOR DELETE TO authenticated
  USING (exported_by_user = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Tighten INSERT to require exported_by_user = auth.uid()
DROP POLICY IF EXISTS "Users can create own test exports" ON public.test_exports;
CREATE POLICY "Users can create own test exports"
  ON public.test_exports FOR INSERT TO authenticated
  WITH CHECK (exported_by_user = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 3) SECURITY DEFINER functions: switch app-callable ones to SECURITY INVOKER
--    with explicit auth checks. has_role must remain DEFINER (used by RLS).
--    handle_new_user, set_updated_at, update_updated_at, cleanup_old_presence
--    are trigger/maintenance functions and are not granted to authenticated.

CREATE OR REPLACE FUNCTION public.calculate_similarity_metrics()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'question_count', COUNT(*),
    'average_confidence', COALESCE(AVG(ai_confidence_score), 0),
    'generated_at', now()
  )
  FROM public.questions
  WHERE deleted = false;
$function$;

CREATE OR REPLACE FUNCTION public.check_question_similarity(
  p_question_text text,
  p_topic text DEFAULT NULL::text,
  p_bloom_level text DEFAULT NULL::text,
  p_threshold numeric DEFAULT 0.75
)
 RETURNS TABLE(similar_question_id uuid, similarity_score numeric)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT q.id, 0.0::numeric
  FROM public.questions q
  WHERE q.deleted = false
    AND (p_topic IS NULL OR q.topic = p_topic)
    AND (p_bloom_level IS NULL OR q.bloom_level = p_bloom_level)
    AND lower(q.question_text) = lower(p_question_text)
  LIMIT 10;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_question_stats(user_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> user_uuid AND NOT public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total', COUNT(*),
      'approved', COUNT(*) FILTER (WHERE approved = true),
      'needs_review', COUNT(*) FILTER (WHERE needs_review = true),
      'by_bloom', COALESCE(jsonb_object_agg(bloom_level, bloom_count) FILTER (WHERE bloom_level IS NOT NULL), '{}'::jsonb)
    )
    FROM (
      SELECT q.*, COUNT(*) OVER (PARTITION BY q.bloom_level) AS bloom_count
      FROM public.questions q
      WHERE q.deleted = false AND (q.owner = user_uuid OR public.has_role(user_uuid, 'admin'::app_role))
    ) s
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_classification_metric(
  p_question_id uuid DEFAULT NULL::uuid,
  p_confidence numeric DEFAULT 0,
  p_cognitive_level text DEFAULT NULL::text,
  p_response_time_ms numeric DEFAULT 0
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  INSERT INTO public.ai_generation_logs (question_id, generation_type, model_used, metadata, generated_by)
  VALUES (
    p_question_id,
    'classification_metric',
    'taxonomy_classifier',
    jsonb_build_object('confidence', p_confidence, 'cognitive_level', p_cognitive_level, 'response_time_ms', p_response_time_ms),
    auth.uid()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_question_used(p_question_id uuid, p_test_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  UPDATE public.questions
  SET used_count = COALESCE(used_count, 0) + 1,
      used_history = COALESCE(used_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('test_id', p_test_id, 'used_at', now()))
  WHERE id = p_question_id;
END;
$function$;

-- 4) Hide all public tables from the pg_graphql schema for signed-in users
--    (app uses PostgREST, not GraphQL)
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
  LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', t, '@graphql({"visible": false})');
  END LOOP;
END $$;
