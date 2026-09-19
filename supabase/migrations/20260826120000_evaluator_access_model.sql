-- Evaluator access is additive: teachers keep their teacher role and may also
-- receive validator permission. Admins may evaluate directly.

DROP POLICY IF EXISTS "Evaluators submit their own validations" ON public.test_validations;
DROP POLICY IF EXISTS "validators_admins_insert_validations" ON public.test_validations;
CREATE POLICY "Authorized users submit their own validations"
ON public.test_validations FOR INSERT TO authenticated
WITH CHECK (
  validator_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'validator'::app_role)
  )
);

CREATE OR REPLACE FUNCTION public.enforce_validation_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_email text;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'validator'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only authorized evaluators may submit an expert validation';
  END IF;

  NEW.validator_id := auth.uid();
  v_role := CASE
    WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN 'admin'
    WHEN public.has_role(auth.uid(), 'teacher'::app_role) THEN 'teacher'
    ELSE 'validator'
  END;
  NEW.evaluator_role := v_role;

  SELECT p.full_name, p.email INTO v_name, v_email
  FROM public.profiles p WHERE p.id = auth.uid();

  NEW.evaluator_name := v_name;
  NEW.evaluator_email := v_email;
  NEW.expert_full_name := v_name;
  NEW.created_at := now();

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Evaluators can read pending tests" ON public.generated_tests;
CREATE POLICY "Authorized users can read pending tests"
ON public.generated_tests FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'validator'::app_role)
);