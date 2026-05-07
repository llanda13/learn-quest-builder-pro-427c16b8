ALTER TABLE public.tos_entries
ADD COLUMN IF NOT EXISTS checked_by text;

ALTER TABLE public.ai_generation_logs
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS approved_at timestamptz,
ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.questions
ALTER COLUMN semantic_vector TYPE text USING CASE
  WHEN semantic_vector IS NULL THEN NULL
  ELSE semantic_vector::text
END;

CREATE TABLE IF NOT EXISTS public.learning_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tos_id uuid,
  topic_name text NOT NULL,
  hours numeric DEFAULT 3,
  competencies jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.learning_competencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.question_similarities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question1_id uuid NOT NULL,
  question2_id uuid NOT NULL,
  similarity_score numeric NOT NULL DEFAULT 0,
  algorithm_used text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(question1_id, question2_id)
);
ALTER TABLE public.question_similarities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.educational_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'local',
  grade_level text,
  subject_area text NOT NULL DEFAULT 'General',
  framework text,
  parent_standard_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.educational_standards ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.question_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  standard_id uuid NOT NULL,
  alignment_strength numeric NOT NULL DEFAULT 0,
  validated_by uuid,
  validated_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(question_id, standard_id)
);
ALTER TABLE public.question_standards ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_learning_competencies_tos_id ON public.learning_competencies(tos_id);
CREATE INDEX IF NOT EXISTS idx_question_similarities_q1 ON public.question_similarities(question1_id);
CREATE INDEX IF NOT EXISTS idx_question_similarities_q2 ON public.question_similarities(question2_id);
CREATE INDEX IF NOT EXISTS idx_question_standards_question_id ON public.question_standards(question_id);
CREATE INDEX IF NOT EXISTS idx_question_standards_standard_id ON public.question_standards(standard_id);

DROP POLICY IF EXISTS "Authenticated users can read learning competencies" ON public.learning_competencies;
CREATE POLICY "Authenticated users can read learning competencies"
ON public.learning_competencies FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage learning competencies" ON public.learning_competencies;
CREATE POLICY "Authenticated users can manage learning competencies"
ON public.learning_competencies FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read question similarities" ON public.question_similarities;
CREATE POLICY "Authenticated users can read question similarities"
ON public.question_similarities FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage question similarities" ON public.question_similarities;
CREATE POLICY "Authenticated users can manage question similarities"
ON public.question_similarities FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read standards" ON public.educational_standards;
CREATE POLICY "Authenticated users can read standards"
ON public.educational_standards FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage standards" ON public.educational_standards;
CREATE POLICY "Admins can manage standards"
ON public.educational_standards FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read question standards" ON public.question_standards;
CREATE POLICY "Authenticated users can read question standards"
ON public.question_standards FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage question standards" ON public.question_standards;
CREATE POLICY "Authenticated users can manage question standards"
ON public.question_standards FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.mark_question_used(p_question_id uuid, p_test_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.questions
  SET used_count = COALESCE(used_count, 0) + 1,
      used_history = COALESCE(used_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('test_id', p_test_id, 'used_at', now()))
  WHERE id = p_question_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_question_similarity(
  p_question_text text,
  p_topic text DEFAULT NULL,
  p_bloom_level text DEFAULT NULL,
  p_threshold numeric DEFAULT 0.75
)
RETURNS TABLE(similar_question_id uuid, similarity_score numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, 0.0::numeric
  FROM public.questions q
  WHERE q.deleted = false
    AND (p_topic IS NULL OR q.topic = p_topic)
    AND (p_bloom_level IS NULL OR q.bloom_level = p_bloom_level)
    AND lower(q.question_text) = lower(p_question_text)
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.mark_question_used(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_question_similarity(text, text, text, numeric) TO authenticated;