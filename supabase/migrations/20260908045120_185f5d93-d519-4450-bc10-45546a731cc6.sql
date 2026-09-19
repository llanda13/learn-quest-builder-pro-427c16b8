CREATE POLICY "validators_read_tos_for_tests"
ON public.tos_entries
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'validator'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.generated_tests gt
    WHERE gt.tos_id = tos_entries.id
  )
);