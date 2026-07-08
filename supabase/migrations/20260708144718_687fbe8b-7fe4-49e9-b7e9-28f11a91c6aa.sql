
-- 2. Extend generated_tests with validation lifecycle columns
ALTER TABLE public.generated_tests
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending_validation'
    CHECK (validation_status IN ('pending_validation','validated','revision_requested')),
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_by uuid;

CREATE INDEX IF NOT EXISTS idx_generated_tests_validation_status
  ON public.generated_tests(validation_status);
CREATE INDEX IF NOT EXISTS idx_generated_tests_content_hash
  ON public.generated_tests(content_hash);

-- 3. test_validations table
CREATE TABLE IF NOT EXISTS public.test_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_test_id uuid NOT NULL REFERENCES public.generated_tests(id) ON DELETE CASCADE,
  validator_id uuid NOT NULL,
  percentage_correctness numeric(5,2) NOT NULL CHECK (percentage_correctness >= 0 AND percentage_correctness <= 100),
  decision text NOT NULL CHECK (decision IN ('approved','revision_requested')),
  comments text,
  instrument_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  reused_from_test_id uuid REFERENCES public.generated_tests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.test_validations TO authenticated;
GRANT ALL ON public.test_validations TO service_role;

ALTER TABLE public.test_validations ENABLE ROW LEVEL SECURITY;

-- Validators + admins can see all; teachers can see validations for their own tests
CREATE POLICY "validators_admins_read_all_validations"
  ON public.test_validations FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'validator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.generated_tests gt
      WHERE gt.id = test_validations.generated_test_id
        AND gt.created_by = auth.uid()
    )
  );

-- Only validators/admins can submit validations
CREATE POLICY "validators_admins_insert_validations"
  ON public.test_validations FOR INSERT
  WITH CHECK (
    validator_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'validator'::app_role)
    )
  );

CREATE INDEX IF NOT EXISTS idx_test_validations_test_id
  ON public.test_validations(generated_test_id);

-- 4. Trigger: keep generated_tests.validation_status in sync
CREATE OR REPLACE FUNCTION public.apply_test_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.decision = 'approved' THEN
    UPDATE public.generated_tests
      SET validation_status = 'validated',
          validated_at = NEW.created_at,
          validated_by = NEW.validator_id
      WHERE id = NEW.generated_test_id;
  ELSIF NEW.decision = 'revision_requested' THEN
    UPDATE public.generated_tests
      SET validation_status = 'revision_requested',
          validated_at = NULL,
          validated_by = NULL
      WHERE id = NEW.generated_test_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_test_validation ON public.test_validations;
CREATE TRIGGER trg_apply_test_validation
  AFTER INSERT ON public.test_validations
  FOR EACH ROW EXECUTE FUNCTION public.apply_test_validation();

-- 5. Add SELECT policy so admins/validators can see all generated_tests (needed for the dashboard)
DROP POLICY IF EXISTS "validators_admins_read_all_tests" ON public.generated_tests;
CREATE POLICY "validators_admins_read_all_tests"
  ON public.generated_tests FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'validator'::app_role)
  );
