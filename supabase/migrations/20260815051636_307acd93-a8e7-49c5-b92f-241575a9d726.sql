ALTER TABLE public.generated_tests
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending_validation',
  ADD COLUMN IF NOT EXISTS semester text;

CREATE TABLE IF NOT EXISTS public.test_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_test_id uuid NOT NULL REFERENCES public.generated_tests(id) ON DELETE CASCADE,
  validator_id uuid NOT NULL,
  evaluator_name text,
  evaluator_email text,
  evaluator_role text NOT NULL DEFAULT 'validator',
  percentage_correctness numeric NOT NULL DEFAULT 0,
  decision text NOT NULL DEFAULT 'approved',
  comments text,
  instrument_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  likert_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  weighted_mean numeric,
  interpretation text,
  items_for_revision text,
  general_comments text,
  expert_full_name text,
  expert_position text,
  expert_experience text,
  item_alignment_matrix jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_validity_index numeric,
  reused_from_test_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_validations_test_idx ON public.test_validations(generated_test_id);
CREATE INDEX IF NOT EXISTS test_validations_validator_idx ON public.test_validations(validator_id);

GRANT SELECT, INSERT ON public.test_validations TO authenticated;
GRANT ALL ON public.test_validations TO service_role;

ALTER TABLE public.test_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Evaluators submit their own validations" ON public.test_validations;
CREATE POLICY "Evaluators submit their own validations"
ON public.test_validations FOR INSERT TO authenticated
WITH CHECK (
  validator_id = auth.uid()
  AND public.has_role(auth.uid(), 'validator'::app_role)
);

DROP POLICY IF EXISTS "Evaluators read their own validations" ON public.test_validations;
CREATE POLICY "Evaluators read their own validations"
ON public.test_validations FOR SELECT TO authenticated
USING (validator_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all validations" ON public.test_validations;
CREATE POLICY "Admins read all validations"
ON public.test_validations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Teachers read validations of their own tests" ON public.test_validations;
CREATE POLICY "Teachers read validations of their own tests"
ON public.test_validations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.generated_tests gt
    WHERE gt.id = test_validations.generated_test_id
      AND (gt.owner = auth.uid() OR gt.created_by = auth.uid())
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.has_role(auth.uid(), 'validator'::app_role) THEN
    RAISE EXCEPTION 'Only authorized evaluators may submit an expert validation';
  END IF;

  NEW.validator_id := auth.uid();
  NEW.evaluator_role := 'validator';

  SELECT p.full_name, p.email INTO v_name, v_email
  FROM public.profiles p WHERE p.id = auth.uid();

  NEW.evaluator_name := v_name;
  NEW.evaluator_email := v_email;
  NEW.expert_full_name := v_name;
  NEW.created_at := now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_validation_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_validation_identity() TO service_role;

DROP TRIGGER IF EXISTS enforce_validation_identity_trg ON public.test_validations;
CREATE TRIGGER enforce_validation_identity_trg
BEFORE INSERT ON public.test_validations
FOR EACH ROW EXECUTE FUNCTION public.enforce_validation_identity();

CREATE OR REPLACE FUNCTION public.apply_validation_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.generated_tests
  SET validation_status = CASE WHEN NEW.decision = 'approved' THEN 'validated' ELSE 'revision_requested' END
  WHERE id = NEW.generated_test_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_validation_decision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_validation_decision() TO service_role;

DROP TRIGGER IF EXISTS apply_validation_decision_trg ON public.test_validations;
CREATE TRIGGER apply_validation_decision_trg
AFTER INSERT ON public.test_validations
FOR EACH ROW EXECUTE FUNCTION public.apply_validation_decision();

DROP POLICY IF EXISTS "Evaluators can read pending tests" ON public.generated_tests;
CREATE POLICY "Evaluators can read pending tests"
ON public.generated_tests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'validator'::app_role));