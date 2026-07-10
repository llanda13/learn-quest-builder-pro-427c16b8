ALTER TABLE public.test_validations
  ADD COLUMN IF NOT EXISTS likert_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bloom_alignment text,
  ADD COLUMN IF NOT EXISTS items_for_revision text,
  ADD COLUMN IF NOT EXISTS general_comments text,
  ADD COLUMN IF NOT EXISTS weighted_mean numeric,
  ADD COLUMN IF NOT EXISTS interpretation text;