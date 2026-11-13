-- Read-only Phase 2 audit exports.
-- Have a DBA validate the deployed schema and JSON shapes before use.
-- Run all SELECTs in one authorized, read-only repeatable-read snapshot when
-- supported by the SQL client, and export each result as the named CSV.
-- Do not run this file with any migration or write statements.

-- schema_columns.csv
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'questions',
    'academic_subjects',
    'academic_specializations',
    'academic_categories',
    'tos_entries',
    'generated_tests',
    'ai_generation_logs',
    'test_versions'
  )
ORDER BY table_name, ordinal_position;

-- schema_foreign_keys.csv
SELECT
  source_table.relname AS table_name,
  source_column.attname AS column_name,
  target_table.relname AS referenced_table,
  target_column.attname AS referenced_column,
  constraint_info.conname AS constraint_name
FROM pg_constraint AS constraint_info
JOIN pg_class AS source_table
  ON source_table.oid = constraint_info.conrelid
JOIN pg_namespace AS source_schema
  ON source_schema.oid = source_table.relnamespace
JOIN pg_class AS target_table
  ON target_table.oid = constraint_info.confrelid
JOIN LATERAL unnest(constraint_info.conkey) WITH ORDINALITY AS source_key(attnum, position)
  ON true
JOIN LATERAL unnest(constraint_info.confkey) WITH ORDINALITY AS target_key(attnum, position)
  ON target_key.position = source_key.position
JOIN pg_attribute AS source_column
  ON source_column.attrelid = source_table.oid
  AND source_column.attnum = source_key.attnum
JOIN pg_attribute AS target_column
  ON target_column.attrelid = target_table.oid
  AND target_column.attnum = target_key.attnum
WHERE constraint_info.contype = 'f'
  AND source_schema.nspname = 'public'
  AND source_table.relname IN (
    'questions',
    'academic_subjects',
    'academic_specializations',
    'academic_categories',
    'tos_entries',
    'generated_tests',
    'ai_generation_logs',
    'test_versions'
  )
ORDER BY table_name, column_name;

-- count_check.csv
-- Includes the three synthetic codes and NULL/empty/whitespace-only codes.
SELECT
  regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') AS current_subject_code,
  coalesce(q.subject_description, '') AS current_subject_description,
  count(*) AS question_count
FROM public.questions AS q
WHERE (
  regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
  OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
)
GROUP BY regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), coalesce(q.subject_description, '')
ORDER BY current_subject_code, current_subject_description;

-- count_summary.csv
-- All categories are counted from the same questions table scan. Remaining
-- rows are not thereby validated as canonical curriculum subjects.
WITH categorized AS (
  SELECT
    CASE
      WHEN regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = '528' THEN 'synthetic_528'
      WHEN regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = '499' THEN 'synthetic_499'
      WHEN regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = '596' THEN 'synthetic_596'
      WHEN regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = '' THEN 'blank_code'
      ELSE 'remaining_non_anomaly'
    END AS count_category
  FROM public.questions AS q
),
counts AS (
  SELECT
    count(*) FILTER (WHERE count_category = 'synthetic_528') AS synthetic_528_count,
    count(*) FILTER (WHERE count_category = 'synthetic_499') AS synthetic_499_count,
    count(*) FILTER (WHERE count_category = 'synthetic_596') AS synthetic_596_count,
    count(*) FILTER (WHERE count_category = 'blank_code') AS blank_code_count,
    count(*) FILTER (WHERE count_category = 'remaining_non_anomaly') AS remaining_non_anomaly_count,
    count(*) AS total_question_count
  FROM categorized
)
SELECT
  synthetic_528_count,
  synthetic_499_count,
  synthetic_596_count,
  blank_code_count,
  remaining_non_anomaly_count,
  total_question_count,
  synthetic_528_count + synthetic_499_count + synthetic_596_count + blank_code_count
    AS anomaly_count,
  synthetic_528_count + synthetic_499_count + synthetic_596_count + blank_code_count
    + remaining_non_anomaly_count AS reconciled_category_total,
  total_question_count =
    synthetic_528_count + synthetic_499_count + synthetic_596_count + blank_code_count
    + remaining_non_anomaly_count AS counts_reconcile
FROM counts;

-- questions.csv
-- Keep this filter identical to count_check.csv so both exports reconcile.
-- No provenance joins are used here; this is one row per questions.id.
SELECT
  q.id AS question_id,
  q.question_text,
  q.choices,
  q.correct_answer,
  q.bloom_level,
  q.difficulty,
  to_jsonb(q)->>'points' AS question_points,
  to_jsonb(q)->>'topic' AS topic,
  q.category AS current_category,
  q.specialization AS current_specialization,
  q.subject AS current_subject,
  q.subject_code AS current_subject_code,
  q.subject_description AS current_subject_description,
  q.tos_id,
  q.tos_id IS NULL AS tos_id_is_null,
  q.metadata,
  q.created_by,
  q.created_at,
  q.updated_at,
  q.deleted
FROM public.questions AS q
WHERE (
  regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
  OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
)
ORDER BY q.id;

-- academic_subjects.csv
SELECT
  s.id AS academic_subject_id,
  s.code AS subject_code,
  s.description AS subject_description,
  s.specialization_id,
  sp.name AS specialization,
  c.name AS category,
  s.deleted
FROM public.academic_subjects AS s
LEFT JOIN public.academic_specializations AS sp
  ON sp.id = s.specialization_id
LEFT JOIN public.academic_categories AS c
  ON c.id = sp.category_id
ORDER BY s.id;

-- tos_entries.csv
-- Rows are selected by direct question TOS links and exact-ID generated-test
-- usage. Generated-test usage is not proof of original subject.
SELECT
  t.id AS tos_id,
  to_jsonb(t)->>'subject_no' AS subject_no,
  to_jsonb(t)->>'subject_code' AS subject_code,
  to_jsonb(t)->>'subject' AS subject,
  to_jsonb(t)->>'course' AS course,
  to_jsonb(t)->>'description' AS description,
  to_jsonb(t)->>'subject_description' AS subject_description,
  t.created_at,
  t.updated_at
FROM public.tos_entries AS t
WHERE t.id IN (
  SELECT DISTINCT q.tos_id
  FROM public.questions AS q
  WHERE q.tos_id IS NOT NULL
    AND (
      regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
      OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
    )
)
OR EXISTS (
  SELECT 1
  FROM public.generated_tests AS gt
  CROSS JOIN LATERAL (
    SELECT array_item AS item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(coalesce(to_jsonb(gt)->'items', 'null'::jsonb)) = 'array'
          THEN coalesce(to_jsonb(gt)->'items', 'null'::jsonb)
        ELSE '[]'::jsonb
      END
    ) AS array_items(array_item)
  ) AS expanded
  JOIN public.questions AS q
    ON (
      regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
      OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
    )
   AND (
     jsonb_typeof(expanded.item) = 'object'
     AND (
       (jsonb_typeof(expanded.item->'id') = 'string' AND expanded.item->>'id' = q.id::text)
       OR (jsonb_typeof(expanded.item->'question_id') = 'string' AND expanded.item->>'question_id' = q.id::text)
       OR (jsonb_typeof(expanded.item->'questionId') = 'string' AND expanded.item->>'questionId' = q.id::text)
     )
   )
  WHERE gt.tos_id = t.id
)
OR t.id IN (
  SELECT DISTINCT log.tos_id
  FROM public.ai_generation_logs AS log
  JOIN public.questions AS q
    ON q.id = log.question_id
  WHERE log.tos_id IS NOT NULL
    AND (
      regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
      OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
    )
)
ORDER BY t.id;

-- dangling_question_tos_references.csv
-- Exact-ID anti-join only. One row per question; no subject-based matching,
-- reassignment, or filtering to the anomaly-code subset.
SELECT
  q.id AS question_id,
  q.tos_id,
  q.subject_code AS current_subject_code,
  q.subject_description AS current_subject_description,
  q.question_text,
  q.subject AS current_subject,
  q.category AS current_category,
  q.specialization AS current_specialization,
  q.metadata,
  q.created_at,
  q.updated_at
FROM public.questions AS q
WHERE q.tos_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tos_entries AS t
    WHERE t.id = q.tos_id
  )
ORDER BY q.id;

-- ai_generation_logs.csv
-- Prompt text is excluded; metadata and direct question/TOS links are retained.
SELECT
  log.id AS generation_log_id,
  log.question_id,
  log.tos_id,
  log.generation_type,
  log.model_used,
  log.metadata,
  coalesce(to_jsonb(log)->>'generated_at', to_jsonb(log)->>'created_at') AS generated_at
FROM public.ai_generation_logs AS log
WHERE EXISTS (
  SELECT 1
  FROM public.questions AS q
  WHERE q.id = log.question_id
    AND (
      regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
      OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
    )
)
ORDER BY log.question_id, coalesce(to_jsonb(log)->>'generated_at', to_jsonb(log)->>'created_at'), log.id;

-- generated_tests.csv
-- Captures test-level usage context for tests linked by tos_id or containing a
-- matched affected question ID. This is not proof of the question's original
-- subject. Only exact ID links are used; question numbers are not used.
SELECT
  gt.id AS generated_test_id,
  gt.tos_id,
  to_jsonb(gt)->>'subject' AS subject,
  to_jsonb(gt)->>'course' AS course,
  coalesce((
    SELECT jsonb_agg(expanded.item)
    FROM LATERAL (
      SELECT array_item AS item
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(coalesce(to_jsonb(gt)->'items', 'null'::jsonb)) = 'array'
            THEN coalesce(to_jsonb(gt)->'items', 'null'::jsonb)
          ELSE '[]'::jsonb
        END
      ) AS array_items(array_item)
    ) AS expanded
    WHERE EXISTS (
      SELECT 1
      FROM public.questions AS q
      WHERE (
        regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
        OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
      )
        AND (
          jsonb_typeof(expanded.item) = 'object'
          AND (
            (jsonb_typeof(expanded.item->'id') = 'string' AND expanded.item->>'id' = q.id::text)
            OR (jsonb_typeof(expanded.item->'question_id') = 'string' AND expanded.item->>'question_id' = q.id::text)
            OR (jsonb_typeof(expanded.item->'questionId') = 'string' AND expanded.item->>'questionId' = q.id::text)
          )
        )
    )
  ), '[]'::jsonb) AS items,
  gt.created_at,
  to_jsonb(gt)->>'updated_at' AS updated_at
FROM public.generated_tests AS gt
WHERE gt.tos_id IN (
  SELECT DISTINCT q.tos_id
  FROM public.questions AS q
  WHERE q.tos_id IS NOT NULL
    AND (
      regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
      OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
    )
)
OR EXISTS (
  SELECT 1
  FROM public.questions AS q
  CROSS JOIN LATERAL (
    SELECT array_item AS item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(coalesce(to_jsonb(gt)->'items', 'null'::jsonb)) = 'array'
          THEN coalesce(to_jsonb(gt)->'items', 'null'::jsonb)
        ELSE '[]'::jsonb
      END
    ) AS array_items(array_item)
  ) AS expanded
  WHERE (
    regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596')
    OR regexp_replace(coalesce(q.subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''
  )
    AND (
      jsonb_typeof(expanded.item) = 'object'
      AND (
        (jsonb_typeof(expanded.item->'id') = 'string' AND expanded.item->>'id' = q.id::text)
        OR (jsonb_typeof(expanded.item->'question_id') = 'string' AND expanded.item->>'question_id' = q.id::text)
        OR (jsonb_typeof(expanded.item->'questionId') = 'string' AND expanded.item->>'questionId' = q.id::text)
      )
    )
)
ORDER BY gt.id;

-- test_versions.csv
-- Standalone diagnostic export using the DBA-verified deployed columns.
-- questions and question_order are returned as JSON values without interpreting
-- their internal shapes or inferring question ownership.
SELECT
version.id AS test_version_id,
version.test_metadata_id,
version.version_label,
to_jsonb(version)->'questions' AS questions_payload,
to_jsonb(version)->'answer_key' AS answer_key_payload,
version.total_points,
to_jsonb(version)->'question_order' AS question_order_payload,
version.created_at
FROM public.test_versions AS version
ORDER BY version.id;

-- `to_jsonb(q)->>'points'` exports question-level points if that deployed
-- column exists and returns NULL otherwise, without assuming the column.
-- Item-level points, when present, are retained in generated_tests.items.

-- generated_test_reference_diagnostics.csv
-- Supported candidates are JSON arrays of objects with explicit string
-- id/question_id/questionId fields. Other shapes are reported, not guessed.
WITH payloads AS (
  SELECT
    gt.id AS generated_test_id,
    coalesce(to_jsonb(gt)->'items', 'null'::jsonb) AS payload
  FROM public.generated_tests AS gt
),
items AS (
  SELECT
    payloads.generated_test_id,
    elements.ordinality AS item_position,
    elements.value AS item_json,
    jsonb_typeof(payloads.payload) AS payload_type,
    FALSE AS empty_payload
  FROM payloads
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(payloads.payload) = 'array' THEN payloads.payload
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS elements(value, ordinality)
  UNION ALL
  SELECT
    payloads.generated_test_id,
    NULL::bigint AS item_position,
    NULL::jsonb AS item_json,
    jsonb_typeof(payloads.payload) AS payload_type,
    payloads.payload = '[]'::jsonb AS empty_payload
  FROM payloads
  WHERE jsonb_typeof(payloads.payload) IS DISTINCT FROM 'array'
     OR payloads.payload = '[]'::jsonb
),
candidates AS (
  SELECT
    items.*,
    candidate.id_field,
    candidate.question_id_text,
    candidate.identifier_type,
    count(*) FILTER (WHERE candidate.question_id_text IS NOT NULL)
      OVER (PARTITION BY items.generated_test_id, items.item_position) AS item_identifier_count
  FROM items
  CROSS JOIN LATERAL (
    VALUES
      ('id', items.item_json->>'id', jsonb_typeof(items.item_json->'id')),
      ('question_id', items.item_json->>'question_id', jsonb_typeof(items.item_json->'question_id')),
      ('questionId', items.item_json->>'questionId', jsonb_typeof(items.item_json->'questionId'))
  ) AS candidate(id_field, question_id_text, identifier_type)
  WHERE jsonb_typeof(items.item_json) = 'object'
    AND items.item_json ? candidate.id_field
  UNION ALL
  SELECT
    items.*,
    '' AS id_field,
    NULL AS question_id_text,
    NULL AS identifier_type,
    0 AS item_identifier_count
  FROM items
  WHERE items.item_json IS NULL
     OR jsonb_typeof(items.item_json) <> 'object'
     OR NOT (
       items.item_json ? 'id'
       OR items.item_json ? 'question_id'
       OR items.item_json ? 'questionId'
     )
),
diagnosed AS (
  SELECT
    candidates.*,
    count(*) FILTER (WHERE question_id_text IS NOT NULL)
      OVER (PARTITION BY generated_test_id, question_id_text) AS duplicate_reference_count,
    (
      SELECT count(*)
      FROM public.questions AS q
      WHERE to_jsonb(q)->>'id' = candidates.question_id_text
    ) AS matching_question_count
  FROM candidates
)
SELECT
  generated_test_id,
  item_position,
  payload_type,
  jsonb_typeof(item_json) AS item_type,
  item_json,
  id_field,
  identifier_type,
  question_id_text,
  CASE
    WHEN payload_type = 'null' THEN 'MISSING_OR_NULL_REFERENCE_COLLECTION'
    WHEN payload_type <> 'array' THEN 'UNSUPPORTED_JSON_STRUCTURE'
    WHEN empty_payload THEN 'EMPTY_REFERENCE_COLLECTION'
    WHEN item_json IS NULL THEN 'MISSING_REFERENCE'
    WHEN jsonb_typeof(item_json) = 'null' THEN 'EMPTY_REFERENCE'
    WHEN jsonb_typeof(item_json) <> 'object' THEN 'UNSUPPORTED_IDENTIFIER_STRUCTURE'
    WHEN question_id_text IS NULL THEN 'MISSING_REFERENCE'
    WHEN identifier_type <> 'string' THEN 'UNSUPPORTED_IDENTIFIER_STRUCTURE'
    WHEN btrim(coalesce(question_id_text, '')) = '' THEN 'EMPTY_REFERENCE'
    WHEN question_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN 'MALFORMED_UUID_CANDIDATE'
    WHEN item_identifier_count > 1 THEN 'AMBIGUOUS_ITEM_IDENTIFIERS'
    WHEN matching_question_count = 0 THEN 'ORPHANED_REFERENCE'
    WHEN matching_question_count > 1 THEN 'AMBIGUOUS_QUESTION_ID_MATCH'
    ELSE 'RESOLVED_REFERENCE'
  END AS resolution_status,
  CASE
    WHEN question_id_text IS NOT NULL AND duplicate_reference_count > 1
      THEN 'DUPLICATE_REFERENCE_IN_GENERATED_TEST'
    ELSE ''
  END AS duplicate_status,
  matching_question_count
FROM diagnosed
ORDER BY generated_test_id, item_position, id_field;
