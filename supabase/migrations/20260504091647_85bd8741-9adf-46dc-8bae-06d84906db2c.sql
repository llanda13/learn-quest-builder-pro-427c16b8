CREATE TABLE IF NOT EXISTS public.tos_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_no text,
  subject_code text,
  subject text,
  course text,
  description text,
  subject_description text,
  year_section text,
  exam_period text,
  period text,
  school_year text,
  total_items integer DEFAULT 0,
  topics jsonb DEFAULT '[]'::jsonb,
  bloom_distribution jsonb DEFAULT '{}'::jsonb,
  matrix jsonb DEFAULT '{}'::jsonb,
  prepared_by text,
  noted_by text,
  approved_by text,
  owner uuid,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tos_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tos_id uuid,
  topic text NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'mcq',
  choices jsonb,
  correct_answer text,
  bloom_level text NOT NULL DEFAULT 'understanding',
  difficulty text NOT NULL DEFAULT 'average',
  knowledge_dimension text DEFAULT 'conceptual',
  category text,
  specialization text,
  subject_code text,
  subject_description text,
  created_by text DEFAULT 'teacher',
  owner uuid,
  approved boolean NOT NULL DEFAULT false,
  status text DEFAULT 'pending',
  ai_confidence_score numeric DEFAULT 0,
  needs_review boolean DEFAULT true,
  used_count integer DEFAULT 0,
  used_history jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  semantic_vector jsonb,
  validation_status text DEFAULT 'pending',
  validation_timestamp timestamptz,
  approved_by text,
  approval_timestamp timestamptz,
  deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT questions_question_type_check CHECK (question_type IN ('mcq', 'essay', 'true_false', 'short_answer')),
  CONSTRAINT questions_bloom_level_check CHECK (lower(bloom_level) IN ('remembering','understanding','applying','analyzing','evaluating','creating')),
  CONSTRAINT questions_difficulty_check CHECK (lower(difficulty) IN ('easy','average','difficult')),
  CONSTRAINT questions_knowledge_dimension_check CHECK (knowledge_dimension IS NULL OR lower(knowledge_dimension) IN ('factual','conceptual','procedural','metacognitive'))
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.generated_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tos_id uuid,
  title text,
  test_title text,
  subject text,
  course text,
  year_section text,
  exam_period text,
  school_year text,
  instructions text,
  items jsonb DEFAULT '[]'::jsonb,
  answer_key jsonb DEFAULT '[]'::jsonb,
  answer_keys jsonb DEFAULT '[]'::jsonb,
  versions jsonb DEFAULT '[]'::jsonb,
  time_limit integer,
  points_per_question integer DEFAULT 1,
  total_points integer,
  num_versions integer DEFAULT 1,
  shuffle_questions boolean DEFAULT true,
  shuffle_choices boolean DEFAULT true,
  parent_test_id uuid,
  version_label text,
  version_number integer DEFAULT 1,
  created_by uuid,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.generated_tests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.classification_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid,
  original_bloom_level text,
  suggested_bloom_level text,
  original_difficulty text,
  suggested_difficulty text,
  original_knowledge_dimension text,
  suggested_knowledge_dimension text,
  confidence_score numeric DEFAULT 0,
  validation_status text DEFAULT 'pending',
  reviewer_id uuid,
  reviewer_notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.classification_validations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ai_generation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid,
  generation_type text NOT NULL DEFAULT 'question_generation',
  prompt_used text,
  model_used text,
  generated_by uuid,
  tos_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_questions_topic_bloom_difficulty ON public.questions(topic, bloom_level, difficulty) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS idx_questions_subject_code ON public.questions(subject_code) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS idx_questions_owner ON public.questions(owner);
CREATE INDEX IF NOT EXISTS idx_questions_approved ON public.questions(approved) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS idx_generated_tests_created_by ON public.generated_tests(created_by);
CREATE INDEX IF NOT EXISTS idx_generated_tests_tos_id ON public.generated_tests(tos_id);
CREATE INDEX IF NOT EXISTS idx_classification_validations_question_id ON public.classification_validations(question_id);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_question_id ON public.ai_generation_logs(question_id);
CREATE INDEX IF NOT EXISTS idx_tos_entries_owner ON public.tos_entries(owner);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tos_entries_updated_at ON public.tos_entries;
CREATE TRIGGER set_tos_entries_updated_at
BEFORE UPDATE ON public.tos_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_questions_updated_at ON public.questions;
CREATE TRIGGER set_questions_updated_at
BEFORE UPDATE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_generated_tests_updated_at ON public.generated_tests;
CREATE TRIGGER set_generated_tests_updated_at
BEFORE UPDATE ON public.generated_tests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_classification_validations_updated_at ON public.classification_validations;
CREATE TRIGGER set_classification_validations_updated_at
BEFORE UPDATE ON public.classification_validations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Users can view own TOS entries" ON public.tos_entries;
CREATE POLICY "Users can view own TOS entries"
ON public.tos_entries FOR SELECT TO authenticated
USING (owner = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can create own TOS entries" ON public.tos_entries;
CREATE POLICY "Users can create own TOS entries"
ON public.tos_entries FOR INSERT TO authenticated
WITH CHECK (owner = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can update own TOS entries" ON public.tos_entries;
CREATE POLICY "Users can update own TOS entries"
ON public.tos_entries FOR UPDATE TO authenticated
USING (owner = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (owner = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view approved questions" ON public.questions;
CREATE POLICY "Authenticated users can view approved questions"
ON public.questions FOR SELECT TO authenticated
USING (deleted = false AND (approved = true OR owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users can create own questions" ON public.questions;
CREATE POLICY "Users can create own questions"
ON public.questions FOR INSERT TO authenticated
WITH CHECK (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can update own questions" ON public.questions;
CREATE POLICY "Users can update own questions"
ON public.questions FOR UPDATE TO authenticated
USING (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can soft-delete own questions" ON public.questions;
CREATE POLICY "Users can soft-delete own questions"
ON public.questions FOR DELETE TO authenticated
USING (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view own generated tests" ON public.generated_tests;
CREATE POLICY "Users can view own generated tests"
ON public.generated_tests FOR SELECT TO authenticated
USING (created_by = auth.uid() OR owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can create own generated tests" ON public.generated_tests;
CREATE POLICY "Users can create own generated tests"
ON public.generated_tests FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() OR owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can update own generated tests" ON public.generated_tests;
CREATE POLICY "Users can update own generated tests"
ON public.generated_tests FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (created_by = auth.uid() OR owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can delete own generated tests" ON public.generated_tests;
CREATE POLICY "Users can delete own generated tests"
ON public.generated_tests FOR DELETE TO authenticated
USING (created_by = auth.uid() OR owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own validations" ON public.classification_validations;
CREATE POLICY "Users can manage own validations"
ON public.classification_validations FOR ALL TO authenticated
USING (created_by = auth.uid() OR reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (created_by = auth.uid() OR reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view own AI logs" ON public.ai_generation_logs;
CREATE POLICY "Users can view own AI logs"
ON public.ai_generation_logs FOR SELECT TO authenticated
USING (generated_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can create own AI logs" ON public.ai_generation_logs;
CREATE POLICY "Users can create own AI logs"
ON public.ai_generation_logs FOR INSERT TO authenticated
WITH CHECK (generated_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));