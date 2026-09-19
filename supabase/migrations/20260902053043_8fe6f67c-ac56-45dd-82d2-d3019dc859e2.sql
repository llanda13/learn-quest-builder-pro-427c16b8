ALTER TABLE public.generated_tests
  ALTER COLUMN validation_status SET DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

UPDATE public.generated_tests SET submitted_at = created_at
WHERE submitted_at IS NULL AND validation_status <> 'draft';

CREATE OR REPLACE FUNCTION public.enforce_test_draft_edit_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Content is immutable once the questionnaire has been submitted for expert
  -- validation (or already approved). Only Draft / Revision Requested is editable.
  IF OLD.validation_status IN ('pending_validation', 'validated')
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.items IS DISTINCT FROM OLD.items
       OR NEW.answer_key IS DISTINCT FROM OLD.answer_key THEN
      RAISE EXCEPTION 'This questionnaire is locked: it is under or has completed expert validation.';
    END IF;
  END IF;

  -- Track submission moment on transition into pending validation.
  IF NEW.validation_status = 'pending_validation'
     AND OLD.validation_status IS DISTINCT FROM 'pending_validation' THEN
    NEW.submitted_at := now();
  END IF;

  -- Returning to an editable state clears the submission stamp.
  IF NEW.validation_status = 'draft' AND OLD.validation_status <> 'draft' THEN
    NEW.submitted_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_test_draft_edit_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_test_draft_edit_lock() TO service_role;

DROP TRIGGER IF EXISTS enforce_test_draft_edit_lock_trg ON public.generated_tests;
CREATE TRIGGER enforce_test_draft_edit_lock_trg
BEFORE UPDATE ON public.generated_tests
FOR EACH ROW EXECUTE FUNCTION public.enforce_test_draft_edit_lock();