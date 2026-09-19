
-- Fix ai_generation_logs: restrict teachers to own rows
DROP POLICY IF EXISTS "Teachers can view relevant ai logs" ON public.ai_generation_logs;
CREATE POLICY "Teachers can view own ai logs"
  ON public.ai_generation_logs FOR SELECT
  TO authenticated
  USING (generated_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Remove redundant admin-only read policy on system_settings (kept authenticated read)
DROP POLICY IF EXISTS "Admins can read settings" ON public.system_settings;

-- Restrict cleanup_old_presence to admins only
CREATE OR REPLACE FUNCTION public.cleanup_old_presence()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can run presence cleanup';
  END IF;
  DELETE FROM public.document_presence
  WHERE last_seen < now() - interval '1 hour' OR is_active = false;
END;
$function$;
