ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS course text;

CREATE TABLE public.department_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  course text NOT NULL,
  chairperson text NOT NULL DEFAULT '',
  dean text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.department_officers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.department_officers TO authenticated;
GRANT ALL ON public.department_officers TO service_role;
ALTER TABLE public.department_officers ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX department_officers_active_unique
  ON public.department_officers (lower(btrim(department)), lower(btrim(course)))
  WHERE status = 'active';
CREATE POLICY "Authenticated can read officers" ON public.department_officers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert officers" ON public.department_officers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins update officers" ON public.department_officers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins delete officers" ON public.department_officers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER update_department_officers_updated_at BEFORE UPDATE ON public.department_officers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, college, course)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
          NULLIF(NEW.raw_user_meta_data->>'college',''), NULLIF(NEW.raw_user_meta_data->>'course',''))
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    college = COALESCE(EXCLUDED.college, public.profiles.college),
    course = COALESCE(EXCLUDED.course, public.profiles.course),
    updated_at = now();
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;