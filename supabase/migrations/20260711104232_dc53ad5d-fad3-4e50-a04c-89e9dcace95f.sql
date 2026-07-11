
ALTER TABLE public.test_validations
  ADD COLUMN IF NOT EXISTS expert_full_name text,
  ADD COLUMN IF NOT EXISTS expert_position text,
  ADD COLUMN IF NOT EXISTS expert_experience text,
  ADD COLUMN IF NOT EXISTS item_alignment_matrix jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS content_validity_index numeric;
