
INSERT INTO public.system_settings (key, value, updated_at)
VALUES
  ('active_school_year', to_jsonb(((extract(year from now())::int)::text || '-' || (extract(year from now())::int + 1)::text)), now()),
  ('dept_officers', '{}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
