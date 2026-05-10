
-- Academic Topic Taxonomy
-- Permanent, normalized topic registry scoped to each academic subject.
-- Bulk Import and AI tagging must validate every detected topic against this table.

CREATE TABLE IF NOT EXISTS public.academic_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.academic_subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  approved BOOLEAN NOT NULL DEFAULT true,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'admin', -- seed | imported | admin | ai
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT academic_topics_unique_per_subject UNIQUE (subject_id, normalized_name),
  CONSTRAINT academic_topics_name_length CHECK (char_length(btrim(name)) BETWEEN 2 AND 80)
);

CREATE INDEX IF NOT EXISTS idx_academic_topics_subject ON public.academic_topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_academic_topics_approved ON public.academic_topics(subject_id, approved);
-- Trigram index for fuzzy fallback matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_academic_topics_name_trgm ON public.academic_topics USING gin (normalized_name gin_trgm_ops);

ALTER TABLE public.academic_topics ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all approved topics; admins can read everything
DROP POLICY IF EXISTS "academic_topics_read" ON public.academic_topics;
CREATE POLICY "academic_topics_read" ON public.academic_topics
  FOR SELECT TO authenticated
  USING (approved = true OR public.is_admin(auth.uid()));

-- Authenticated users can suggest new topics (will land as needs_review=true via app logic)
DROP POLICY IF EXISTS "academic_topics_insert_authenticated" ON public.academic_topics;
CREATE POLICY "academic_topics_insert_authenticated" ON public.academic_topics
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "academic_topics_update_admin" ON public.academic_topics;
CREATE POLICY "academic_topics_update_admin" ON public.academic_topics
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "academic_topics_delete_admin" ON public.academic_topics;
CREATE POLICY "academic_topics_delete_admin" ON public.academic_topics
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_academic_topics_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_academic_topics ON public.academic_topics;
CREATE TRIGGER trg_touch_academic_topics
  BEFORE UPDATE ON public.academic_topics
  FOR EACH ROW EXECUTE FUNCTION public.touch_academic_topics_updated_at();

-- ─── Fuzzy resolver: match a candidate topic name to the nearest approved topic for a subject ───
CREATE OR REPLACE FUNCTION public.resolve_topic_for_subject(
  p_subject_id UUID,
  p_candidate TEXT,
  p_min_similarity REAL DEFAULT 0.5
)
RETURNS TABLE(topic_id UUID, topic_name TEXT, similarity REAL, matched BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm TEXT := lower(btrim(coalesce(p_candidate, '')));
BEGIN
  IF v_norm = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0::REAL, FALSE;
    RETURN;
  END IF;

  -- 1) Exact normalized match
  RETURN QUERY
    SELECT t.id, t.name, 1.0::REAL, TRUE
    FROM public.academic_topics t
    WHERE t.subject_id = p_subject_id
      AND t.approved = TRUE
      AND t.normalized_name = v_norm
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 2) Alias match
  RETURN QUERY
    SELECT t.id, t.name, 0.95::REAL, TRUE
    FROM public.academic_topics t
    WHERE t.subject_id = p_subject_id
      AND t.approved = TRUE
      AND v_norm = ANY (SELECT lower(btrim(a)) FROM unnest(t.aliases) AS a)
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 3) Trigram similarity fallback
  RETURN QUERY
    SELECT t.id, t.name, similarity(t.normalized_name, v_norm)::REAL AS sim,
           (similarity(t.normalized_name, v_norm) >= p_min_similarity)
    FROM public.academic_topics t
    WHERE t.subject_id = p_subject_id
      AND t.approved = TRUE
    ORDER BY similarity(t.normalized_name, v_norm) DESC
    LIMIT 1;
END; $$;

-- ─── Seed academic_topics from existing questions ───
INSERT INTO public.academic_topics (subject_id, name, source, approved)
SELECT DISTINCT ON (s.id, lower(btrim(q.topic)))
  s.id, btrim(q.topic), 'seed', TRUE
FROM public.questions q
JOIN public.academic_subjects s ON lower(btrim(s.code)) = lower(btrim(q.subject_code))
WHERE q.deleted IS NOT TRUE
  AND q.topic IS NOT NULL
  AND char_length(btrim(q.topic)) BETWEEN 2 AND 80
ON CONFLICT (subject_id, normalized_name) DO NOTHING;
