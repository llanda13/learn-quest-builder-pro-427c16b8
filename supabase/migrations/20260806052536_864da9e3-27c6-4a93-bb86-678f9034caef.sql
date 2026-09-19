DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subject_type') THEN
    CREATE TYPE public.subject_type AS ENUM ('major','minor','ge','pe','nstp');
  END IF;
END $$;

ALTER TABLE public.academic_subjects
  ADD COLUMN IF NOT EXISTS subject_type public.subject_type NOT NULL DEFAULT 'major',
  ADD COLUMN IF NOT EXISTS course_codes text[] NOT NULL DEFAULT '{}';

UPDATE public.academic_subjects s
SET course_codes = ARRAY[up.code]
FROM (
  SELECT sp.id,
    CASE
      WHEN upper(sp.name) LIKE '%BSIT%' OR upper(sp.name) LIKE '%INFORMATION TECHNOLOGY%' THEN 'BSIT'
      WHEN upper(sp.name) LIKE '%BSIS%' OR upper(sp.name) LIKE '%INFORMATION SYSTEM%' THEN 'BSIS'
      WHEN upper(sp.name) LIKE '%BSCS%' OR upper(sp.name) LIKE '%COMPUTER SCIENCE%' THEN 'BSCS'
      ELSE NULL
    END AS code
  FROM public.academic_specializations sp
) up
WHERE s.specialization_id = up.id
  AND up.code IS NOT NULL
  AND cardinality(s.course_codes) = 0;