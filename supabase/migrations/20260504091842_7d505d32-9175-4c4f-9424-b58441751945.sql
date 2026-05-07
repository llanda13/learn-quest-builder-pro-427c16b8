ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS college text;

ALTER TABLE public.tos_entries
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS distribution jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS cognitive_level text;

CREATE TABLE IF NOT EXISTS public.test_assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  tos_id uuid,
  created_by uuid NOT NULL,
  params jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'draft',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.test_assemblies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assembly_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid REFERENCES public.test_assemblies(id) ON DELETE CASCADE,
  version_label text,
  question_order jsonb DEFAULT '[]'::jsonb,
  shuffle_seed text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.assembly_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New Conversation',
  messages jsonb DEFAULT '[]'::jsonb,
  active_intent text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb DEFAULT 'null'::jsonb,
  updated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_test_assemblies_created_by ON public.test_assemblies(created_by);
CREATE INDEX IF NOT EXISTS idx_assembly_versions_assembly_id ON public.assembly_versions(assembly_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_tags ON public.questions USING gin(tags);

DROP TRIGGER IF EXISTS set_test_assemblies_updated_at ON public.test_assemblies;
CREATE TRIGGER set_test_assemblies_updated_at
BEFORE UPDATE ON public.test_assemblies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_assembly_versions_updated_at ON public.assembly_versions;
CREATE TRIGGER set_assembly_versions_updated_at
BEFORE UPDATE ON public.assembly_versions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_ai_conversations_updated_at ON public.ai_conversations;
CREATE TRIGGER set_ai_conversations_updated_at
BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER set_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER set_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Users can manage own test assemblies" ON public.test_assemblies;
CREATE POLICY "Users can manage own test assemblies"
ON public.test_assemblies FOR ALL TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own assembly versions" ON public.assembly_versions;
CREATE POLICY "Users can manage own assembly versions"
ON public.assembly_versions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.test_assemblies ta WHERE ta.id = assembly_id AND (ta.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))))
WITH CHECK (EXISTS (SELECT 1 FROM public.test_assemblies ta WHERE ta.id = assembly_id AND (ta.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can manage own AI conversations" ON public.ai_conversations;
CREATE POLICY "Users can manage own AI conversations"
ON public.ai_conversations FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings"
ON public.user_settings FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
CREATE POLICY "Admins can manage system settings"
ON public.system_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read system settings" ON public.system_settings;
CREATE POLICY "Authenticated users can read system settings"
ON public.system_settings FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.log_classification_metric(
  p_question_id uuid DEFAULT NULL,
  p_confidence numeric DEFAULT 0,
  p_cognitive_level text DEFAULT NULL,
  p_response_time_ms numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_generation_logs (question_id, generation_type, model_used, metadata, generated_by)
  VALUES (
    p_question_id,
    'classification_metric',
    'taxonomy_classifier',
    jsonb_build_object('confidence', p_confidence, 'cognitive_level', p_cognitive_level, 'response_time_ms', p_response_time_ms),
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_question_stats(user_uuid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_presence()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count integer := 0;
BEGIN
  DELETE FROM public.document_activity
  WHERE timestamp < now() - interval '1 hour'
    AND action_type = 'presence';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_similarity_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'question_count', COUNT(*),
    'average_confidence', COALESCE(AVG(ai_confidence_score), 0),
    'generated_at', now()
  )
  FROM public.questions
  WHERE deleted = false;
$$;

GRANT EXECUTE ON FUNCTION public.log_classification_metric(uuid, numeric, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_question_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_similarity_metrics() TO authenticated;