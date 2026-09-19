
REVOKE SELECT ON public.academic_categories FROM anon;
REVOKE SELECT ON public.academic_specializations FROM anon;
REVOKE SELECT ON public.academic_subjects FROM anon;

DROP POLICY IF EXISTS "Anyone can view academic categories" ON public.academic_categories;
DROP POLICY IF EXISTS "Anyone can view academic specializations" ON public.academic_specializations;
DROP POLICY IF EXISTS "Anyone can view academic subjects" ON public.academic_subjects;

CREATE POLICY "Authenticated users can view academic categories"
ON public.academic_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view academic specializations"
ON public.academic_specializations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view academic subjects"
ON public.academic_subjects FOR SELECT TO authenticated USING (true);
