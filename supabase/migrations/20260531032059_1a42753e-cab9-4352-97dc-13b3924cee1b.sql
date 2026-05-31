ALTER TABLE public.tos_entries ADD COLUMN IF NOT EXISTS semester TEXT;
ALTER TABLE public.generated_tests ADD COLUMN IF NOT EXISTS semester TEXT;