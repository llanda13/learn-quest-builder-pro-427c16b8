# Expert Validation Workflow (Per-TQ)

Treat every generated Test Questionnaire as its own validation instance. Each TQ gets a status (`pending_validation` → `validated` / `revision_requested`), and only Validated TQs can be printed or exported.

## 1. Database changes (migration)

Extend `generated_tests` and add supporting tables.

**`generated_tests` — new columns**
- `validation_status text NOT NULL DEFAULT 'pending_validation'` (`pending_validation | validated | revision_requested`)
- `content_hash text` — SHA-256 of normalized items + answer key + order (for optional dedup reuse)
- `validated_at timestamptz`, `validated_by uuid`

**New role**
- Add `'validator'` to `app_role` enum. Admins keep full access; validators can read all pending TQs and submit validations.

**New table `test_validations`**
- `id uuid pk`, `generated_test_id uuid → generated_tests(id) on delete cascade`
- `validator_id uuid → auth.users`
- `percentage_correctness numeric(5,2)` (0–100)
- `decision text` (`approved | revision_requested`)
- `comments text`
- `instrument_scores jsonb` (per-criterion answers from the validation instrument)
- `reused_from_test_id uuid null` (set when a matching content_hash reused an existing validation)
- `created_at timestamptz default now()`
- RLS: validators + admins insert/select all; teachers select rows for their own tests.
- GRANTs: authenticated (select/insert), service_role (all).

**Trigger** on `test_validations` insert with `decision='approved'` → update parent `generated_tests` to `validation_status='validated'`, set `validated_at`, `validated_by`. `revision_requested` → set `validation_status='revision_requested'`.

## 2. Generation flow

`src/services/db/generatedTests.ts`
- On `create` / `createVersion` / `createMultipleVersions`: compute `content_hash` from shuffled items + answer key; insert with `validation_status='pending_validation'`.
- Optional reuse: if an existing row for the same `created_by`-scope (or globally, per subject) has identical `content_hash` and is already `validated`, auto-insert a `test_validations` row referencing it (`reused_from_test_id`) so the new TQ instantly becomes Validated. Otherwise stays Pending.

## 3. Evaluator (Validator) dashboard

New route `/validator` (and link from admin sidebar since admins can also validate):
- `src/pages/validator/ValidatorDashboard.tsx` — table of pending TQs: Subject, Teacher (join profiles), TOS title, Exam period, Created date, Status, Actions (Review).
- `src/pages/validator/ValidateTestPage.tsx` — full TQ preview + validation instrument form:
  - Criterion checklist producing per-item scores → auto-computes Percentage of Correctness
  - Comments textarea
  - Buttons: **Approve** / **Request Revision**
  - Submits to `test_validations`; on success routes back to dashboard.
- New layout `ValidatorLayout.tsx` mirroring existing role layouts.

## 4. Teacher-facing changes

- `MyTests.tsx` / `TeacherDashboard.tsx`: show a status badge (Pending Validation / Validated / Revision Requested) and, if revision requested, surface validator comments.
- `TestPreview.tsx`, print button in `GeneratedTestPage.tsx`, `exportExamPdf.ts` callers: **gate Print/Export/PDF on `validation_status === 'validated'`**. Non-validated tests show a locked state with a tooltip "Awaiting expert validation."

## 5. Routing & role wiring

- `App.tsx`: add `/validator/*` routes protected by `useUserRole` (allow `validator` + `admin`).
- `Sidebar.tsx` / role layouts: add "Expert Validation" nav for validator/admin.
- `useUserRole` already returns role text; extend switch to recognize `validator`.

## Technical notes

- Content hash: stable JSON-stringify of `items.map(i => ({q, choices, answer}))` sorted deterministically before hashing to avoid false negatives from insertion order.
- The trigger keeps status transitions server-authoritative so client bugs cannot bypass gating.
- Admin can assign the `validator` role via existing `assign_user_role` RPC (already supports arbitrary roles).

## Files touched

- Migration (new columns, enum value, new table, trigger, RLS, grants)
- `src/services/db/generatedTests.ts` (hash + status + optional reuse)
- `src/services/db/testValidations.ts` (new)
- `src/pages/validator/ValidatorDashboard.tsx`, `ValidateTestPage.tsx` (new)
- `src/components/layout/ValidatorLayout.tsx` (new)
- `src/App.tsx`, `src/components/layout/Sidebar.tsx`
- `src/pages/teacher/MyTests.tsx`, `TestPreview.tsx`, `GeneratedTestPage.tsx` (status badge + print gating)
- `src/hooks/useUserRole.ts` (recognize validator)

Approve to proceed and I'll ship the migration first, then the code.
