# Project Rules

## Test Generation
- The selected Exam Format is the source of truth for question types, section names, item counts, and numbering: TOS slot types that conflict with the selected format's section are overridden, not preserved. The AI edge function (`generate-questions-from-tos`) must be told the requested question type (`requested_question_type`) and a dedup blacklist of already-accepted stems (`existing_stems`) — it never decides types from its internal default distribution.
- Duplicate detection in format-aware generation is exam-wide (all previously accepted questions, across topics/batches/sources) using normalized stems, 0.7 semantic similarity, concept + expected-answer equality, and structural fingerprints; an incomplete exam must never be saved — a clear filled/unfilled error is thrown instead.
- The print/preview render model (`src/print/useExamRenderModel.ts`) groups items by stored section metadata (section_id/label/title) and uses stored question numbers when present; type-based grouping is only the legacy fallback.
