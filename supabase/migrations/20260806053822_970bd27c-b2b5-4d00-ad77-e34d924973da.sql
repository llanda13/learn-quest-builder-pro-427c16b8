UPDATE public.academic_subjects
SET code = regexp_replace(btrim(code), '\s+', ' ', 'g'),
    description = btrim(description)
WHERE code <> regexp_replace(btrim(code), '\s+', ' ', 'g')
   OR description <> btrim(description);