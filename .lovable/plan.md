## Why these pages exist today

Two admin pages were added when the question-rotation engine was implemented:

- **`/admin/rotation` — Rotation Settings**: lets an admin edit `rotation_settings` rows (global + per-subject) — cooldown periods, similarity threshold, max reuse frequency, "prefer unused" toggle.
- **`/admin/rotation-audit` — Rotation Audit**: read-only report (with CSV export) over `rotation_audit_report` RPC, showing per-question reuse counts and last-used period.

The actual rotation logic does **not** require either page. It runs automatically inside the test-generation pipeline via:

- `src/services/rotation/rotationEngine.ts` — `computeRotationWeight`, `applyRotationOrder`, `recordExamUsage`
- `src/services/ai/intelligentSelector.ts` — calls the engine when picking from the bank
- `src/services/db/generatedTests.ts` — records usage after a test is saved

The settings table just holds tunable knobs; sensible defaults (`DEFAULT_ROTATION_SETTINGS`) are already used when no row exists. The audit data is already captured automatically through `record_question_usage` whether or not anyone opens the audit page.

## Recommendation

Agree with you — both pages are non-essential. Remove them from the admin UI and let rotation run as an invisible background process. No DB schema changes; rotation tables stay so generation keeps working.

## Changes

1. **`src/layout/AdminLayout.tsx`** — remove the two menu items (`Rotation Settings`, `Rotation Audit`) and the now-unused `Rotate3D`, `History as HistoryIcon` imports.
2. **`src/App.tsx`** — remove the `/admin/rotation` and `/admin/rotation-audit` routes and their lazy imports.
3. **Delete files**:
   - `src/pages/admin/RotationSettings.tsx`
   - `src/pages/admin/RotationAudit.tsx`
4. **Keep untouched** (still used by the generation engine):
   - `src/services/rotation/rotationSettings.ts` (`loadRotationSettings`, `DEFAULT_ROTATION_SETTINGS`)
   - `src/services/rotation/rotationEngine.ts`
   - `rotation_settings` and usage-tracking tables / `record_question_usage` RPC
5. **Memory update** — add a constraint memory: "Rotation Settings and Rotation Audit admin pages were removed; rotation is an automatic backend process. Do not re-add as user-facing modules."

## Out of scope

- No changes to the rotation algorithm, the `rotation_settings` table, or the audit RPC. If you ever need to tweak the global defaults later, that can be exposed as a single row inside the existing **System Settings** page rather than its own module — happy to add that in a follow-up if you want.
