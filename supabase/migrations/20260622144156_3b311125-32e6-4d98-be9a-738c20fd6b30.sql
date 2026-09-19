
DROP POLICY IF EXISTS "Document owners can manage collaborators" ON public.document_collaborators;
CREATE POLICY "Document owners can manage collaborators"
ON public.document_collaborators
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    document_type = 'tos'
    AND EXISTS (
      SELECT 1 FROM public.tos_entries t
      WHERE t.id::text = document_collaborators.document_id
        AND t.owner = auth.uid()
    )
  )
  OR (
    document_type IN ('test','generated_test')
    AND EXISTS (
      SELECT 1 FROM public.generated_tests g
      WHERE g.id::text = document_collaborators.document_id
        AND g.created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can read test exports" ON public.test_exports;
CREATE POLICY "Users can read own test exports"
ON public.test_exports
FOR SELECT
TO authenticated
USING (
  exported_by = auth.uid()::text
  OR has_role(auth.uid(), 'admin'::app_role)
);
