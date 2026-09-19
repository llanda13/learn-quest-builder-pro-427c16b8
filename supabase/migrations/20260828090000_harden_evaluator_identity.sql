-- Keep validation identity tied to the authenticated account.  This is an
-- additive hardening migration for existing test_validations installations.

CREATE OR REPLACE FUNCTION public.enforce_validation_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_email text;
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
  NEW.evaluator_role := CASE
    WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN 'admin'
    ELSE 'validator'
  END;

  SELECT COALESCE(p.full_name, u.raw_user_meta_data->>'full_name'), u.email
  INTO v_name, v_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();

  NEW.evaluator_name := v_name;
  NEW.evaluator_email := v_email;
  NEW.expert_full_name := v_name;
  NEW.created_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_validation_identity_trg ON public.test_validations;
CREATE TRIGGER enforce_validation_identity_trg
BEFORE INSERT ON public.test_validations
FOR EACH ROW EXECUTE FUNCTION public.enforce_validation_identity();

DROP POLICY IF EXISTS "Authorized users submit their own validations" ON public.test_validations;
CREATE POLICY "Authorized users submit their own validations"
ON public.test_validations FOR INSERT TO authenticated
WITH CHECK (
  validator_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'validator'::app_role)
  )
);