-- ============================================================================
-- Academic-Year Question Rotation & Historical Reuse Control
-- Apply this in: Supabase Dashboard > SQL Editor
-- (Or `supabase db push` if you use the local CLI.)
-- ============================================================================

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_school_year text,
  ADD COLUMN IF NOT EXISTS last_used_semester text,
  ADD COLUMN IF NOT EXISTS last_used_term text,
  ADD COLUMN IF NOT EXISTS last_used_exam_type text,
  ADD COLUMN IF NOT EXISTS rotation_score numeric DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS idx_questions_last_used_at ON public.questions(last_used_at);
CREATE INDEX IF NOT EXISTS idx_questions_last_used_period
  ON public.questions(last_used_school_year, last_used_semester);

ALTER TABLE public.generated_tests
  ADD COLUMN IF NOT EXISTS term text,
  ADD COLUMN IF NOT EXISTS exam_type text;

CREATE TABLE IF NOT EXISTS public.question_usage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  test_id uuid,
  tos_id uuid,
  used_at timestamptz NOT NULL DEFAULT now(),
  school_year text,
  semester text,
  term text,
  exam_type text,
  exam_period text,
  used_by uuid,
  item_number integer
);

GRANT SELECT, INSERT ON public.question_usage_history TO authenticated;
GRANT ALL ON public.question_usage_history TO service_role;

ALTER TABLE public.question_usage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read usage history" ON public.question_usage_history;
CREATE POLICY "Authenticated read usage history"
  ON public.question_usage_history FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Owner or admin insert usage history" ON public.question_usage_history;
CREATE POLICY "Owner or admin insert usage history"
  ON public.question_usage_history FOR INSERT
  TO authenticated WITH CHECK (
    used_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_quh_question ON public.question_usage_history(question_id);
CREATE INDEX IF NOT EXISTS idx_quh_period
  ON public.question_usage_history(school_year, semester);
CREATE INDEX IF NOT EXISTS idx_quh_test ON public.question_usage_history(test_id);
CREATE INDEX IF NOT EXISTS idx_quh_used_at ON public.question_usage_history(used_at DESC);

CREATE TABLE IF NOT EXISTS public.rotation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text,
  cooldown_periods integer NOT NULL DEFAULT 2,
  similarity_threshold numeric NOT NULL DEFAULT 0.85,
  max_reuse_frequency integer NOT NULL DEFAULT 3,
  prefer_unused boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject)
);

GRANT SELECT ON public.rotation_settings TO authenticated;
GRANT ALL ON public.rotation_settings TO service_role;

ALTER TABLE public.rotation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read rotation settings" ON public.rotation_settings;
CREATE POLICY "Authenticated read rotation settings"
  ON public.rotation_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage rotation settings" ON public.rotation_settings;
CREATE POLICY "Admins manage rotation settings"
  ON public.rotation_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.rotation_settings (subject)
SELECT NULL
WHERE NOT EXISTS (SELECT 1 FROM public.rotation_settings WHERE subject IS NULL);

CREATE OR REPLACE FUNCTION public.record_question_usage(
  p_test_id uuid,
  p_question_ids uuid[],
  p_school_year text,
  p_semester text,
  p_term text,
  p_exam_type text,
  p_exam_period text,
  p_tos_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qid uuid;
  idx integer := 0;
BEGIN
  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH qid IN ARRAY p_question_ids LOOP
    idx := idx + 1;

    INSERT INTO public.question_usage_history (
      question_id, test_id, tos_id, school_year, semester, term,
      exam_type, exam_period, used_by, item_number
    ) VALUES (
      qid, p_test_id, p_tos_id, p_school_year, p_semester, p_term,
      p_exam_type, p_exam_period, auth.uid(), idx
    );

    UPDATE public.questions
       SET used_count = COALESCE(used_count, 0) + 1,
           last_used_at = now(),
           last_used_school_year = COALESCE(p_school_year, last_used_school_year),
           last_used_semester    = COALESCE(p_semester,    last_used_semester),
           last_used_term        = COALESCE(p_term,        last_used_term),
           last_used_exam_type   = COALESCE(p_exam_type,   last_used_exam_type),
           used_history = COALESCE(used_history, '[]'::jsonb) ||
             jsonb_build_object(
               'test_id', p_test_id,
               'used_at', now(),
               'school_year', p_school_year,
               'semester', p_semester,
               'term', p_term,
               'exam_type', p_exam_type
             )
     WHERE id = qid;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_question_usage(
  uuid, uuid[], text, text, text, text, text, uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rotation_audit_report(
  p_school_year text DEFAULT NULL,
  p_semester text DEFAULT NULL,
  p_subject text DEFAULT NULL
) RETURNS TABLE (
  question_id uuid,
  topic text,
  subject text,
  question_text text,
  used_count integer,
  last_used_at timestamptz,
  last_used_school_year text,
  last_used_semester text,
  distinct_periods bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.topic, q.subject, q.question_text,
         q.used_count, q.last_used_at,
         q.last_used_school_year, q.last_used_semester,
         (SELECT COUNT(DISTINCT (h.school_year, h.semester))
            FROM public.question_usage_history h
           WHERE h.question_id = q.id) AS distinct_periods
    FROM public.questions q
   WHERE q.deleted = false
     AND (p_subject IS NULL OR q.subject = p_subject)
     AND (
       p_school_year IS NULL
       OR EXISTS (
         SELECT 1 FROM public.question_usage_history h
          WHERE h.question_id = q.id
            AND h.school_year = p_school_year
            AND (p_semester IS NULL OR h.semester = p_semester)
       )
     )
   ORDER BY q.used_count DESC NULLS LAST, q.last_used_at DESC NULLS LAST
   LIMIT 1000;
$$;

GRANT EXECUTE ON FUNCTION public.rotation_audit_report(text, text, text)
  TO authenticated, service_role;
