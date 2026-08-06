-- 1) Fix subject classification from the subject code
UPDATE public.academic_subjects
SET subject_type = CASE
  WHEN code ~* '^NSTP' THEN 'nstp'::subject_type
  WHEN code ~* '^(PE|PATHFIT)' THEN 'pe'::subject_type
  WHEN code ~* '^GE[[:space:]]*[0-9]' THEN 'ge'::subject_type
  ELSE 'major'::subject_type
END
WHERE deleted = false;

-- 2) Fill applicable program codes (single source of truth for the Course field)
UPDATE public.academic_subjects s
SET course_codes = CASE
  -- Shared / general subjects are taken by both programs
  WHEN s.subject_type IN ('ge','pe','nstp') THEN ARRAY['BSIT','BSIS']
  -- Common computing core / professional / elective codes are shared
  WHEN s.code ~* '^(ITCC|CC|GE[[:space:]]*(IT|IS))' THEN ARRAY['BSIT','BSIS']
  ELSE CASE upper(coalesce(sp.name,''))
    WHEN 'IT' THEN ARRAY['BSIT']
    WHEN 'IS' THEN ARRAY['BSIS']
    WHEN 'CS' THEN ARRAY['BSCS']
    WHEN 'EMC' THEN ARRAY['BSEMC']
    ELSE ARRAY['BSIT','BSIS']
  END
END
FROM public.academic_specializations sp
WHERE sp.id = s.specialization_id
  AND s.deleted = false
  AND (s.course_codes IS NULL OR array_length(s.course_codes, 1) IS NULL);