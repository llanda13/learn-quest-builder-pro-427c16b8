ALTER TABLE public.generated_tests
  ADD COLUMN IF NOT EXISTS format_id text;
