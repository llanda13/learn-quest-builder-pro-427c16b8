
CREATE TABLE IF NOT EXISTS public.academic_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_categories TO authenticated;
GRANT ALL ON public.academic_categories TO service_role;
ALTER TABLE public.academic_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view categories" ON public.academic_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage categories" ON public.academic_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.academic_specializations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.academic_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_specializations TO authenticated;
GRANT ALL ON public.academic_specializations TO service_role;
ALTER TABLE public.academic_specializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view specializations" ON public.academic_specializations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage specializations" ON public.academic_specializations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.academic_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specialization_id uuid REFERENCES public.academic_specializations(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject_type text NOT NULL DEFAULT 'major',
  course_codes text[] NOT NULL DEFAULT '{}',
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_subjects_type_check CHECK (subject_type IN ('major','minor','ge','pe','nstp'))
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_subjects_code_unique ON public.academic_subjects (lower(code)) WHERE deleted = false;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_subjects TO authenticated;
GRANT ALL ON public.academic_subjects TO service_role;
ALTER TABLE public.academic_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view subjects" ON public.academic_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage subjects" ON public.academic_subjects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER set_academic_categories_updated_at BEFORE UPDATE ON public.academic_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_academic_specializations_updated_at BEFORE UPDATE ON public.academic_specializations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_academic_subjects_updated_at BEFORE UPDATE ON public.academic_subjects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.academic_categories IS '@graphql({"visible": false})';
COMMENT ON TABLE public.academic_specializations IS '@graphql({"visible": false})';
COMMENT ON TABLE public.academic_subjects IS '@graphql({"visible": false})';

INSERT INTO public.academic_categories (name)
SELECT 'College of Computer Studies'
WHERE NOT EXISTS (SELECT 1 FROM public.academic_categories);

INSERT INTO public.academic_specializations (category_id, name)
SELECT c.id, v.name
FROM public.academic_categories c
CROSS JOIN (VALUES ('BSIT'), ('BSIS')) AS v(name)
WHERE c.name = 'College of Computer Studies'
  AND NOT EXISTS (SELECT 1 FROM public.academic_specializations s WHERE s.name = v.name);
