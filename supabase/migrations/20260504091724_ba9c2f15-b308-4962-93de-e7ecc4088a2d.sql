ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS subject text,
ADD COLUMN IF NOT EXISTS grade_level text,
ADD COLUMN IF NOT EXISTS term text,
ADD COLUMN IF NOT EXISTS classification_confidence numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_score numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS validated_by uuid,
ADD COLUMN IF NOT EXISTS approval_notes text;

ALTER TABLE public.classification_validations
ADD COLUMN IF NOT EXISTS validator_id uuid,
ADD COLUMN IF NOT EXISTS original_classification jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS validated_classification jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS validation_confidence numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS validation_type text DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS public.document_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text NOT NULL,
  document_type text NOT NULL,
  user_name text,
  user_email text,
  user_id uuid,
  action_type text NOT NULL,
  action_details jsonb,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.document_activity ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.collaboration_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text NOT NULL,
  document_type text,
  user_name text,
  user_email text,
  user_id uuid,
  message text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.collaboration_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.test_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_version_id text,
  generated_test_id uuid,
  export_type text NOT NULL,
  file_name text,
  storage_url text,
  exported_by text,
  exported_by_user uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.test_exports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_document_activity_document_id ON public.document_activity(document_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_messages_document_id ON public.collaboration_messages(document_id);
CREATE INDEX IF NOT EXISTS idx_test_exports_generated_test_id ON public.test_exports(generated_test_id);
CREATE INDEX IF NOT EXISTS idx_questions_classification_confidence ON public.questions(classification_confidence);

DROP POLICY IF EXISTS "Authenticated users can view document activity" ON public.document_activity;
CREATE POLICY "Authenticated users can view document activity"
ON public.document_activity FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can create document activity" ON public.document_activity;
CREATE POLICY "Authenticated users can create document activity"
ON public.document_activity FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage document activity" ON public.document_activity;
CREATE POLICY "Admins can manage document activity"
ON public.document_activity FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view collaboration messages" ON public.collaboration_messages;
CREATE POLICY "Authenticated users can view collaboration messages"
ON public.collaboration_messages FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can create collaboration messages" ON public.collaboration_messages;
CREATE POLICY "Authenticated users can create collaboration messages"
ON public.collaboration_messages FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own test exports" ON public.test_exports;
CREATE POLICY "Users can view own test exports"
ON public.test_exports FOR SELECT TO authenticated
USING (exported_by_user = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can create own test exports" ON public.test_exports;
CREATE POLICY "Users can create own test exports"
ON public.test_exports FOR INSERT TO authenticated
WITH CHECK (exported_by_user = auth.uid() OR exported_by_user IS NULL OR public.has_role(auth.uid(), 'admin'::app_role));