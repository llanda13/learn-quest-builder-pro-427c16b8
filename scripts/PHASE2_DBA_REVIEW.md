# Phase 2 audit package — DBA review required

This package is prepared for schema and query review only. It is not approval
to connect to production or execute the export. Do not execute the SQL until an
authorized DBA has validated the deployed schema, reviewed operational impact,
and separately approved the read-only method and transaction context.

The previously reported counts (1,428 total questions, 997 synthetic-code
rows, one blank-code row, and 430 remaining rows) are unverified expectations,
not snapshot evidence, acceptance criteria, or proof that remaining records
are legitimate curriculum questions. Repository migrations are not proof of
the deployed schema.

## Review status and test-count discrepancy

The deployed Supabase schema, RLS visibility, generated-test identifier
semantics, and execution plans have **not** been independently verified in this
workspace. The SQL has not been run against Supabase. This document is a DBA
handoff and verification request, not a finding that the SQL is production
valid or approved.

The independently reported run of the extracted `scripts.zip` found 23 tests.
The current local `scripts/test_audit_question_subjects.py` contains 29 test
methods, and its complete suite was run locally with 29 passing tests. The
archive itself is not present in the current workspace, so a direct file/hash
comparison cannot establish its exact contents. The six additional local test
methods introduced in the latest evidence-model work are:

- `test_matching_tos_id_is_candidate_only_and_visible`
- `test_questions_sharing_tos_id_are_classified_independently`
- `test_generated_test_usage_without_tos_is_candidate_context_only`
- `test_verified_independent_source_can_confirm_subject`
- `test_blank_code_requires_blank_description_for_blank_assignment_class`
- `test_ai_log_context_without_subject_metadata_is_candidate_only`

These six cases account for the difference between the reported 23-test
archive run and the current 29-test local suite if they are absent from that
archive. Because the archive was unavailable for direct inspection, that
explanation remains a likely version-drift explanation, not a proven archive
comparison. Do not describe the archive as having 29 tests or claim those six
pass in it. The exact archive and local files must be compared before calling
the archive synchronized.

## Files

- `question_subject_audit_export.sql` — twelve SELECT-only exports,
  diagnostics, and schema-introspection queries. Export each result under the
  filename shown in its SQL comment.
- `audit_question_subjects.py` — local CSV-only classifier; it does not connect
  to a database. Run it with separate input and output directories:

  ```text
  python scripts/audit_question_subjects.py --exports "phase2_exports" --out "phase2_audit_reports"
  ```

- `test_audit_question_subjects.py` — synthetic regression fixtures. They are
  not production evidence.
- `question_subject_audit_export.sql` is a twelve-statement package. The
  statement/output inventory below is the exact set for DBA review; the first
  two outputs are schema evidence and the remaining outputs are data or
  reference diagnostics. Do not execute it until the separate authorization
  gate in this document is satisfied.

## DBA handoff: statements and expected outputs

Review all four files together:

1. `scripts/question_subject_audit_export.sql` — SQL text, schema inspection,
   count queries, primary export, and diagnostics.
2. `scripts/audit_question_subjects.py` — local CSV-only auditor and its
   candidate-only evidence rules.
3. `scripts/test_audit_question_subjects.py` — synthetic regression suite;
   fixtures do not establish production facts.
4. `scripts/PHASE2_DBA_REVIEW.md` — schema assumptions, required approvals,
   controls, and reconciliation checklist.

The twelve SQL statements and expected output filenames are:

| # | Statement | Purpose / DBA review focus | Expected output |
|---|---|---|---|
| 1 | Column inventory | Inspect visible `public` columns, types, nullability, and ordinal positions for the referenced application tables. Confirm the results are complete for the approved role. | `schema_columns.csv` |
| 2 | Foreign-key inventory | Enumerate visible FK constraints for listed tables. Confirm composite key pairing and note that application-level relationships are not shown. | `schema_foreign_keys.csv` |
| 3 | Anomaly count detail | Count question rows grouped by normalized suspect/blank code and description, using the audit predicate. | `count_check.csv` |
| 4 | Overall count reconciliation | Count synthetic codes 528/499/596, blank codes, remaining non-anomaly rows, and total questions from `public.questions` in one query. Verify `counts_reconcile`; do not treat remaining records as valid subjects. | `count_summary.csv` |
| 5 | Primary affected-question extraction | Export the affected question rows directly from `public.questions`, without provenance joins, preserving one row per question ID and carrying the explicit TOS NULL marker. | `questions.csv` |
| 6 | Academic subject registry | Export subject records and their specialization/category hierarchy. Verify join columns, uniqueness, deleted-row semantics, and RLS visibility. | `academic_subjects.csv` |
| 7 | Related TOS entries | Export TOS records selected through exact linked IDs from affected questions and the usage/log branches in the SQL. These records are candidates, not proof of ownership. | `tos_entries.csv` |
| 8 | Dangling question TOS references | Return each question with non-NULL `tos_id` and no exact `tos_entries.id` match. Confirm compatible types and reconcile every row; no replacement is inferred. | `dangling_question_tos_references.csv` |
| 9 | AI generation logs | Export log context linked to affected questions using the SQL's exact relationship. Treat question/TOS links and log metadata as candidates unless independently verified. | `ai_generation_logs.csv` |
| 10 | Generated tests | Export tests selected by the SQL's `tos_id` or explicit question-ID item matches. Confirm identifiers and relationships; usage does not establish subject ownership. | `generated_tests.csv` |
| 11 | Test versions | Standalone export using the reported deployed columns. Keep `questions`, `answer_key`, and `question_order` opaque; do not infer relationships. | `test_versions.csv` |
| 12 | Generated-test reference diagnostics | Preserve malformed, orphaned, empty, unsupported, duplicate, or ambiguous item references and resolution counts. Verify expected JSON shape and identifier semantics. | `generated_test_reference_diagnostics.csv` |

These are twelve SQL result sets. They do not include local auditor outputs.
After a separately approved export, the auditor writes
`question_subject_audit.csv`, `ambiguous_questions.csv`,
`confirmed_questions.csv`, `needs_review_questions.csv`,
`unresolved_questions.csv`, `blank_code_anomalies.csv`,
`provenance_reference_diagnostics.csv`, `tos_reference_diagnostics.csv`, and
`question_subject_audit_summary.json`. `verified_source_records.csv` is an
optional manually prepared evidence input, not a SQL result; its `verified`
values must be backed by independently reviewed source records.

## DBA validation and reconciliation checklist

Before any export authorization, the DBA must record the evidence and decision
for every item below. No baseline number is an expected result.

- [ ] Verify deployed names, data types, nullability, uniqueness, and
  relationship columns used by every one of the twelve statements. For each
  referenced field, record table, column, PostgreSQL type, nullability, and
  applicable key/constraint from the deployed schema; include optional columns
  accessed via `to_jsonb`, JSON/JSONB operators, catalog fields, and type
  compatibility for every equality comparison and join.
- [ ] Validate all twelve statements against the deployed schema. For each,
  record successful parse/prepare evidence, statement-specific execution plan
  or approved plan estimate, expected scan/index behavior, and resource
  estimate. Use only a DBA-approved non-production validation environment or
  procedure until production export authorization is separately granted.
  Static checks and local tests are not database parsing or execution.
- [ ] Establish the semantics of `questions.tos_id`, `tos_entries.id`,
  `generated_tests.tos_id`, `ai_generation_logs.question_id`/`tos_id`, and
  generated-test JSON identifiers. Confirm whether each relationship is an
  enforced FK or application-level association and document its actual meaning.
  An FK or exact ID match proves identifier integrity/existence only, not
  original curriculum provenance.
- [ ] Inspect representative generated-test JSON. Confirm the supported
  explicit string fields (`id`, `question_id`, `questionId`) truly identify
  `questions.id`; confirm fallback/pseudo IDs are not mistaken for question
  records unless independently matched to a real question ID. Record the
  deployed `items` type and representative object/array shapes; report
  unexpected shapes without coercing them into question IDs.
- [ ] Confirm the DBA-managed read-only role can see the complete required data
  despite RLS, table grants, views, pagination, soft-delete behavior, and
  export-size limits. Specify how RLS visibility and completeness will be
  demonstrated for every source table. No RLS bypass or privileged
  service-role credential is requested or authorized by this package.
- [ ] Specify the target (read replica or primary), transaction isolation,
  read-only enforcement, statement timeout, execution window, concurrency,
  maximum export size, expected scan/resource impact, and snapshot method.
  Confirm all result sets can be exported from a consistent snapshot.
- [ ] Reconcile `count_check.csv` and `count_summary.csv` to the affected rows
  in `questions.csv`. Verify `counts_reconcile`, category sums, total rows,
  unique question IDs, and one-row-per-question cardinality. Explain any
  differences; do not substitute the reported 1,428/997/1/430 figures.
- [ ] Reconcile `dangling_question_tos_references.csv` against a DBA-approved
  exact-ID anti-join/count on the same snapshot. Confirm NULL IDs are excluded
  and every non-NULL unmatched question is present once. Reconcile the local
  `tos_reference_diagnostics.csv` separately for the anomaly-scope questions.
- [ ] Review generated-test reference diagnostic totals by status and verify
  no malformed, empty, unsupported, orphaned, duplicate, or ambiguous item
  was silently dropped. Compare question IDs and row counts with the source
  query results.
- [ ] Compare the exact extracted `scripts.zip` test and documentation files
  against the 29-test local versions. Verify that all six test methods named
  in the test-count section above are present and passing before reporting the
  archive as synchronized. Preserve the prior sandbox/archive files as a
  backup before any authorized synchronization.
- [ ] Preserve export originals, record snapshot context and UTC time, and
  calculate file checksums in approved storage. Report skipped, failed, or
  permission-hidden records and all exceptions.

Security precautions: use only the DBA-authorized read-only connection and
approved storage; do not place credentials in files, chat, shell history, or
the package; do not use service-role/superuser credentials or bypass RLS; do
not send exported question content or metadata to unapproved destinations.
This project copy and its local tests are not a production connection.

The local candidate-only classification contract is mandatory during review:
TOS links, generated-test occurrences, question metadata, and AI-generation
logs cannot independently establish `CONFIRMED_RECOVERABLE`. That class
requires explicit, independent verification of source provenance for exactly
one active canonical subject and no conflicting evidence. Do not classify all
remaining non-anomaly rows as valid curriculum records. Do not alter production
questions or begin Phase 3 remediation.

The local classifier treats `questions.tos_id`, generated-test references,
question metadata, and AI-generation logs as candidate context only. Even a
valid foreign-key relationship or exact match to an exported `tos_entries.id`
establishes identifier existence, not that the TOS was the question's original
curriculum source. These sources cannot independently produce
`CONFIRMED_RECOVERABLE`. Confirmation requires independently verified source
evidence identifying one active canonical academic subject, with no conflicting
evidence. The optional `verified_source_records.csv` input is explicitly marked
verified and must be supported by original-source review or equivalent
independent curriculum verification.

For affected rows, `NEEDS_REVIEW` means candidate context exists but ownership
is not independently verified. `UNRESOLVED_ANOMALY` means no reliable evidence
or candidate context is available. `ANOMALY_BLANK_CODE` is reserved for records
where both subject code and subject description are NULL, empty, or
whitespace-only. A blank code with a nonblank description remains separately
reviewable and is not labeled as that fully blank assignment.
Unverified out-of-scope rows are not called valid; they remain `NEEDS_REVIEW`.
The reported synthetic/blank counts are not hardcoded as acceptance criteria.
Missing or duplicate question IDs, malformed IDs, missing required exports, or
snapshot count mismatches stop classification.

The audit requires `count_summary.csv` as well as `count_check.csv` and
`questions.csv`. The summary counts the three synthetic codes, blank codes,
remaining non-anomaly rows, and all question rows in one query over
`public.questions`. "Remaining non-anomaly" is a count category only; it is not
a finding that those assignments are valid curriculum subjects. The local
classifier stops if the anomaly totals do not reconcile with the extracted
questions.

The SQL emits `generated_test_reference_diagnostics.csv` separately from
classification. It includes orphaned, malformed UUID-shaped, missing/empty,
unsupported, duplicate, and ambiguous references. The local classifier also
writes `provenance_reference_diagnostics.csv` from that export. These are
historical usage references only, not proof of original subject ownership.

The SQL also emits `dangling_question_tos_references.csv` as a separate
diagnostic. It returns one row per `public.questions` record where `tos_id` is
non-NULL and no `public.tos_entries.id` exactly matches. Each row includes the
question ID, TOS ID, current subject fields, question text, metadata, and
timestamps for manual reconciliation. It does not use description matching,
deduplicate questions, or assign a replacement TOS ID. NULL TOS IDs are
excluded from this dangling-reference query. The question export includes an
explicit `tos_id_is_null` value so the local auditor can distinguish a SQL NULL
from an empty but non-NULL value; `tos_reference_diagnostics.csv` reports
`NULL_TOS_ID`, `DANGLING_TOS_REFERENCE`, and `MATCHED_TOS_ENTRY_ID` separately
for rows in the anomaly audit scope. A matching TOS ID is only an identifier
match; its provenance semantics and subject ownership remain DBA/human review
questions. The audit report exposes `candidate_tos_ids` and
`unverified_subject_suggestions` so the matched ID and any candidate subject
remain visible without presenting them as confirmed assignments. Matched
generated-test references and AI-log references are likewise retained as
candidate context.

The DBA-verified `public.test_versions` columns are `id`, `test_metadata_id`,
`version_label`, `questions`, `answer_key`, `total_points`, `question_order`,
and `created_at`; the DBA reports zero rows. The SQL contains no references to
`test_versions.test_id` or `test_versions.question_ids` and does not join
`test_metadata_id` to `generated_tests.id`. Its standalone `test_versions.csv`
query exports only the verified columns, using `to_jsonb` to preserve the raw
`questions`, `answer_key`, and `question_order` values without interpreting
their structures. An empty table naturally yields an empty result. No test
version is used to establish a question link or subject.

## Required DBA validations

Before any production execution, please provide a written response covering:

1. **Deployed schema and types.** Verify every referenced table and column.
   The deployed `test_versions` schema listed above is DBA-reported; retain
   that evidence with the package. Verify the types and historical shapes of
   `test_versions.questions`, `answer_key`, and `question_order`. This package
   exports them as opaque JSON values and intentionally does not parse or link
   them to questions. Confirm the DBA-verified `generated_tests.items` type and
   JSON array-of-objects shape, including supported identifier fields.

2. **Question identity and archived records.** Verify that explicit string
   identifiers in `generated_tests.items` genuinely identify `questions.id`.
   The query uses exact textual equality and no arbitrary UUID cast. Confirm
   the relation for archived, soft-deleted, or otherwise inactive questions
   and that the primary extraction does not omit them. `test_versions` is not
   joined to questions because its deployed schema has no `test_id` or
   `question_ids` columns and `test_metadata_id` is not an established
   relationship to `generated_tests`.

3. **Historical generated-test references.** Inspect representative historical
   `items` values and establish whether explicit string `id`, `question_id`,
   or `questionId` fields contain exact question-bank UUIDs. The SQL only
   interprets object fields in the DBA-verified JSON array-of-objects format.
   Fallback pseudo-IDs are not question-bank records unless exact matching
   identifies an actual `questions.id`. Do not treat object keys, question
   numbers, item positions, topic names, or similar text as question identity.
   These matches show test usage only, not the original subject.

4. **TOS and AI provenance.** Confirm the foreign-key/reference semantics and
   separately determine whether any relationship has evidence that it
   identifies the originating subject for a question. A valid foreign key or
   exact ID match proves referential integrity/identifier existence only; it
   does not establish historical curriculum ownership. The local classifier
   therefore treats direct `questions.tos_id` matches as unverified candidates,
   never as independent confirmation. Generated-test item links prove usage,
   not original subject. Generated-test usage, question metadata, and AI-log
   context are candidates only. `CONFIRMED_RECOVERABLE` requires independently
   verified source evidence mapping the question to one active canonical
   subject, without conflicting evidence.
   `test_versions` is exported separately for opaque structural inspection and
   is not linked to questions. AI generation-log metadata is also an unverified
   candidate unless independently verified; no topic or description similarity
   is used to establish identity. Review each row in
   `dangling_question_tos_references.csv`; verify whether the exact-ID anti-join
   matches deployed type/semantics and reconcile missing IDs only from
   independently authoritative records. The query intentionally does not infer
   replacements. NULL `questions.tos_id` values are not dangling references.

5. **Scope and completeness.** Confirm the exact affected predicate is applied
   to both `count_check.csv` and `questions.csv`:
   `regexp_replace(coalesce(subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') IN ('528', '499', '596') OR
   regexp_replace(coalesce(subject_code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') = ''`.
   This trims POSIX whitespace and includes NULL, empty, and whitespace-only
   codes. Verify the count and
   extracted rows reconcile, that each question ID occurs once, and that no
   matching rows are hidden by RLS, pagination, soft-delete filters, or export
   limits. The primary question extraction has no provenance joins; the local
   audit stops if exported question IDs are missing or duplicated, or counts
   do not reconcile. `count_summary.csv` derives all categories from one scan
   of `public.questions` and includes `counts_reconcile`; confirm that the
   exported summary agrees with the count and extraction queries. Report
   duplicate IDs and all skipped/error rows.

6. **Authorized execution and snapshot.** Make and document an explicit
   decision for each control below; do not infer settings from this package:
   primary database versus read replica, transaction isolation, read-only
   transaction enforcement, statement timeout, execution window, RLS visibility
   and permissions, expected scan/resource impact, maximum export size, and
   connection/concurrency limits. SELECT-only SQL is not proof of zero
   operational impact. If separately authorized, run exports in an approved
   consistent snapshot when supported; record UTC time and snapshot context.
   Preserve untouched originals and calculate checksums after export.

## Schema and optional-field notes

- `to_jsonb(q)->>'points'` and `to_jsonb(q)->>'topic'` avoid directly naming
  those optional question columns. Other question columns selected directly
  remain subject to deployed-schema verification.
- TOS subject aliases and generated-test `items` are read through `to_jsonb`
  to inspect JSON values and optional keys. The SQL uses `generated_tests.items`
  only; it no longer falls back to a legacy `questions` field. The DBA-verified
  item contract is a JSON array of objects. Non-array values and unsupported
  item/identifier shapes are reported for review; JSON serialized inside a
  text scalar is not reparsed.
- The subject hierarchy query joins `academic_subjects` to
  `academic_specializations` and `academic_categories`; verify those deployed
  relationships before using the exported hierarchy as authoritative.
- Supported `generated_tests.items` forms are native JSON/JSONB arrays
  containing objects with explicit `id`, `question_id`, or `questionId`
  properties whose values are strings. Missing, empty, duplicate, malformed,
  orphaned, or conflicting identifiers are diagnosed. Scalar array entries,
  root objects, question-number-only formats, nested/serialized JSON strings,
  and other structures are not interpreted as question identity.
- `test_versions` is used only in its standalone export:
  `id`, `test_metadata_id`, `version_label`, `questions`, `answer_key`,
  `total_points`, `question_order`, and `created_at`. The query does not assume
  an internal JSON structure for `questions` or `question_order`. The supplied
  DBA report says the table has zero rows; confirm this remains applicable to
  the authorized snapshot. No `test_versions` relationship to
  `generated_tests` or `questions` is assumed.
- The UUID-shape diagnostic assumes question identifiers are UUIDs. The DBA
  must verify the deployed type and representation of `questions.id`; if it is
  not UUID-compatible, revise the UUID checks rather than treating those
  diagnostics as definitive.
- The foreign-key query reports constraints whose source tables are in the
  listed table set. Review both source and target columns and any relationships
  that are application-level rather than database-enforced.

## SQL dependency inventory for deployed-schema validation

The following are query assumptions to verify, not claims about the deployed
schema. `schema_columns.csv` and `schema_foreign_keys.csv` are inspection aids;
the DBA must check actual constraints, data, RLS behavior, and application-level
relationships.

- `public.questions`: `id`, `question_text`, `choices`, `correct_answer`,
  `bloom_level`, `difficulty`, `category`, `specialization`, `subject`,
  `subject_code`, `subject_description`, `tos_id`, `metadata`, `created_by`,
  `created_at`, `updated_at`, and `deleted`. `points` and `topic` are read
  through `to_jsonb`. The primary extraction and count queries assume this is
  the source table and do not filter deleted rows.
- `public.academic_subjects`: `id`, `code`, `description`,
  `specialization_id`, and `deleted`; joined by `specialization_id` to
  `public.academic_specializations.id`, then by
  `academic_specializations.category_id` to `public.academic_categories.id`.
  The export expects specialization/category `name` fields.
- `public.tos_entries`: `id`, `created_at`, and `updated_at`; `subject_no`,
  `subject_code`, `subject`, `course`, `description`, and
  `subject_description` are accessed through `to_jsonb`. The SQL compares
  `questions.tos_id` to `tos_entries.id`. Even if deployed as a valid foreign
  key, this proves identifier integrity only; the DBA must separately confirm
  whether it has historical provenance meaning. The local auditor treats this
  link as candidate context only. The
  dangling-reference diagnostic uses an exact-ID `NOT EXISTS` comparison and
  requires compatible deployed types; the DBA must verify both columns and
  relationship semantics. NULL `questions.tos_id` values are explicitly
  excluded. No replacement mapping is inferred.
- `public.test_versions`: DBA-reported columns are `id`, `test_metadata_id`,
  `version_label`, `questions`, `answer_key`, `total_points`, `question_order`,
  and `created_at`. `questions`, `answer_key`, and `question_order` are read via
  `to_jsonb` and remain opaque. There is no `test_id` or `question_ids` column
  in the verified schema. `test_metadata_id` is not joined to
  `generated_tests.id`; that relationship is unverified.
- `public.generated_tests`: `id`, `tos_id`, `created_at`; `subject`, `course`,
  `updated_at`, and `items` are accessed directly or through `to_jsonb` as
  shown. The query assumes `items` is the DBA-verified JSON array of objects.
  `tos_id` is compared to `tos_entries.id`, and explicit item string IDs are
  compared with `questions.id`. `parent_test_id` is not used because its
  semantics have not been established in this package.
- `public.ai_generation_logs`: `id`, `question_id`, `tos_id`,
  `generation_type`, `model_used`, and `metadata`; timestamp selection probes
  `generated_at`/`created_at` through `to_jsonb`. The query joins
  `ai_generation_logs.question_id` to `questions.id` and may compare
  `ai_generation_logs.tos_id` to `tos_entries.id`; neither relationship is
  declared verified here.
- `information_schema.columns` and PostgreSQL catalog tables
  (`pg_constraint`, `pg_class`, `pg_namespace`, `pg_attribute`) are used for
  schema inspection. The foreign-key query only reports constraints from the
  listed source tables and does not establish application-level links or prove
  referential completeness.
- The schema queries assume `information_schema.columns` exposes
  `table_schema`, `table_name`, `column_name`, `data_type`, `is_nullable`,
  `udt_name`, and `ordinal_position`. The foreign-key query reads
  `pg_constraint.contype`, `conrelid`, `confrelid`, `conkey`, `confkey`, and
  `conname`; joins `pg_class.oid`/`relname`, `pg_namespace.oid`/`nspname`, and
  `pg_attribute.attrelid`/`attnum`/`attname`; and pairs composite key columns
  by array ordinality. Confirm catalog access is permitted to the approved
  role and that all relevant constraints are visible.

Confirm compatible data types for every direct join/comparison above, the
actual nullability and uniqueness constraints, whether soft-deleted/archived
rows must be included, and whether RLS or permissions hide rows from the
authorized extraction role. No relationship is considered production-verified
until the DBA supplies evidence.

## Approval gate

Do not treat repository migrations, local tests, or reported counts as
deployed-schema validation or production evidence. Schema-review approval is
not production-export authorization; the DBA must separately approve execution
and its operational impact. If any SQL assumption needs correction, document
the change and re-review the revised SQL before execution. No database write,
permission change, RLS bypass, remediation, or Phase 3 work is authorized by
this package.

## Phase 2 Database Administrator sign-off

Complete this form after reviewing the deployed schema, query compatibility,
provenance limitations, export completeness, and execution impact. Enter counts
from the approved production query only; do not use reported baseline figures
as expected values.

### 1. Deployed schema compatibility (Checkpoint 1)

- [ ] Verified match
- [ ] Type / structure mismatch detected

Notes: ____________________________________________________________

### 2. Referential integrity and provenance (Checkpoint 2)

- [ ] Verified
- [ ] Orphan references found
- [ ] Provenance insufficient / ambiguous

Notes: ____________________________________________________________

### 3. JSON extraction compatibility (Checkpoint 3)

- [ ] Query expressions reviewed
- [ ] Representative payloads verified
- [ ] Adjustments required

Notes: ____________________________________________________________

### 4. Export completeness and anomaly scope (Checkpoint 4)

Synthetic code 528:       ______
Synthetic code 499:       ______
Synthetic code 596:       ______
Blank / NULL / whitespace: ______
Total anomaly matches:    ______
Remaining records:        ______
Total question records:   ______

- [ ] Counts reconciled
- [ ] Discrepancies require investigation

Notes: ____________________________________________________________

### 5. Row cardinality and usage semantics (Checkpoint 5)

- [ ] One row per question ID confirmed
- [ ] Primary export independent of usage joins
- [ ] Adjustments required

Notes: ____________________________________________________________

### 6. Execution safety and isolation (Checkpoint 6)

- [ ] Safe under approved conditions
- [ ] Reschedule to approved maintenance window
- [ ] Additional safeguards required

Approved environment: _____________________________________________
Database target (replica / primary): ______________________________
Transaction isolation: ____________________________________________
Read-only enforcement: ____________________________________________
Statement timeout: ________________________________________________
Execution window: __________________________________________________
RLS visibility / permissions: ______________________________________
Expected scan / resource impact: __________________________________
Export size / connection limits: __________________________________

### Authorization decision

- [ ] **AUTHORIZED** — Execute the reviewed read-only extraction SQL under the
  approved conditions documented above.
- [ ] **WITHHELD** — Additional schema, query, provenance, or safety review is
  required before production execution.

DBA name / signature: _____________________________________________
Date / timestamp: _________________________________________________
Notes / conditions: _______________________________________________
