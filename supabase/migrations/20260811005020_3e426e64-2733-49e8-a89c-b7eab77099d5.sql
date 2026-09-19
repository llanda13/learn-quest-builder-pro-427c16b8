CREATE OR REPLACE FUNCTION public.enforce_document_activity_identity()
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

  NEW.user_id := auth.uid();

  SELECT p.full_name, p.email INTO v_name, v_email
  FROM public.profiles p WHERE p.id = auth.uid();

  NEW.user_name := COALESCE(v_name, NEW.user_name);
  NEW.user_email := v_email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_document_activity_identity_trg ON public.document_activity;
CREATE TRIGGER enforce_document_activity_identity_trg
BEFORE INSERT OR UPDATE ON public.document_activity
FOR EACH ROW EXECUTE FUNCTION public.enforce_document_activity_identity();