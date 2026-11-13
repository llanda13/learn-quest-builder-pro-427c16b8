import csv
import json
import re
import subprocess
import sys
import tempfile
import unittest
import uuid
from collections import Counter
from pathlib import Path


SCRIPT = Path(__file__).with_name("audit_question_subjects.py")
LEGACY_QUESTION_ID = "4a3e8819-8e05-4295-ae94-56e99fe6c601"


QUESTION_FIELDS = [
    "question_id", "question_text", "choices", "correct_answer", "bloom_level",
    "difficulty", "question_points", "topic", "current_category",
    "current_specialization", "current_subject", "current_subject_code",
    "current_subject_description", "tos_id", "tos_id_is_null", "metadata", "created_by",
    "created_at", "updated_at", "deleted",
]


def fixture_id(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return str(uuid.uuid5(uuid.NAMESPACE_URL, value))


def write_csv(folder: Path, filename: str, fields: list[str], rows: list[dict]) -> None:
    with (folder / filename).open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def fixture_question(question_id: str, code: str | None, **overrides: str) -> dict[str, str]:
    row = {
        "question_id": fixture_id(question_id) if question_id else "",
        "question_text": f"Synthetic text for {question_id}",
        "choices": "[]",
        "correct_answer": "A",
        "bloom_level": "Remembering",
        "difficulty": "easy",
        "question_points": "1",
        "topic": "",
        "current_category": "",
        "current_specialization": "",
        "current_subject": "",
        "current_subject_code": code or "",
        "current_subject_description": "",
        "tos_id": "",
        "tos_id_is_null": "true",
        "metadata": "{}",
        "created_by": "synthetic-fixture",
        "created_at": "",
        "updated_at": "",
        "deleted": "false",
    }
    row.update(overrides)
    if "tos_id_is_null" not in overrides:
        row["tos_id_is_null"] = "false" if overrides.get("tos_id") else "true"
    return row


def create_subjects() -> list[dict[str, str]]:
    return [
        {
            "academic_subject_id": "subject-101",
            "subject_code": "ITPC 101",
            "subject_description": "Computer System Servicing",
            "specialization_id": "spec-it",
            "specialization": "IT",
            "category": "Major",
            "deleted": "false",
        },
        {
            "academic_subject_id": "subject-110",
            "subject_code": "ITPC 110",
            "subject_description": "Computer Networking 2",
            "specialization_id": "spec-it",
            "specialization": "IT",
            "category": "Major",
            "deleted": "false",
        },
    ]


def create_exports_tos() -> list[dict[str, str]]:
    return [{
        "tos_id": "tos-101",
        "subject_no": "ITPC 101",
        "subject_code": "",
        "subject": "ITPC 101 - Computer System Servicing",
        "course": "Computer System Servicing",
        "description": "Computer System Servicing",
        "subject_description": "",
        "created_at": "",
        "updated_at": "",
    }]


def create_exports(
    folder: Path,
    questions: list[dict[str, str]],
    *,
    tos_rows: list[dict[str, str]] | None = None,
    generated_tests: list[dict[str, str]] | None = None,
    test_versions: list[dict[str, str]] | None = None,
    subject_rows: list[dict[str, str]] | None = None,
    generation_logs: list[dict[str, str]] | None = None,
    source_rows: list[dict[str, str]] | None = None,
) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    write_csv(folder, "questions.csv", QUESTION_FIELDS, questions)
    groups = Counter(
        (row["current_subject_code"].strip(), row["current_subject_description"])
        for row in questions
    )
    write_csv(
        folder,
        "count_check.csv",
        ["current_subject_code", "current_subject_description", "question_count"],
        [
            {
                "current_subject_code": code,
                "current_subject_description": description,
                "question_count": count,
            }
            for (code, description), count in groups.items()
        ],
    )
    categorized_counts = Counter()
    for row in questions:
        code = row["current_subject_code"].strip()
        category = (
            f"synthetic_{code}"
            if code in {"528", "499", "596"}
            else "blank_code" if not code
            else "remaining_non_anomaly"
        )
        categorized_counts[category] += 1
    anomaly_count = sum(categorized_counts[key] for key in (
        "synthetic_528", "synthetic_499", "synthetic_596", "blank_code",
    ))
    total_count = len(questions)
    write_csv(folder, "count_summary.csv", [
        "synthetic_528_count", "synthetic_499_count", "synthetic_596_count",
        "blank_code_count", "remaining_non_anomaly_count", "total_question_count",
        "anomaly_count", "reconciled_category_total", "counts_reconcile",
    ], [{
        "synthetic_528_count": categorized_counts["synthetic_528"],
        "synthetic_499_count": categorized_counts["synthetic_499"],
        "synthetic_596_count": categorized_counts["synthetic_596"],
        "blank_code_count": categorized_counts["blank_code"],
        "remaining_non_anomaly_count": categorized_counts["remaining_non_anomaly"],
        "total_question_count": total_count,
        "anomaly_count": anomaly_count,
        "reconciled_category_total": anomaly_count + categorized_counts["remaining_non_anomaly"],
        "counts_reconcile": "true",
    }])
    write_csv(
        folder,
        "academic_subjects.csv",
        [
            "academic_subject_id", "subject_code", "subject_description",
            "specialization_id", "specialization", "category", "deleted",
        ],
        subject_rows or create_subjects(),
    )
    write_csv(folder, "academic_specializations.csv", ["id", "category_id", "name"], [
        {"id": "spec-it", "category_id": "cat-major", "name": "IT"},
    ])
    write_csv(folder, "academic_categories.csv", ["id", "name"], [
        {"id": "cat-major", "name": "Major"},
    ])
    write_csv(
        folder,
        "tos_entries.csv",
        [
            "tos_id", "subject_no", "subject_code", "subject", "course",
            "description", "subject_description", "created_at", "updated_at",
        ],
        tos_rows or create_exports_tos(),
    )
    write_csv(
        folder,
        "generated_tests.csv",
        ["generated_test_id", "tos_id", "subject", "course", "items", "created_at", "updated_at"],
        generated_tests or [],
    )
    write_csv(
        folder,
        "test_versions.csv",
        [
            "test_version_id", "test_metadata_id", "version_label", "questions_payload",
            "answer_key_payload", "total_points", "question_order_payload", "created_at",
        ],
        test_versions or [],
    )
    write_csv(
        folder,
        "ai_generation_logs.csv",
        [
            "generation_log_id", "question_id", "tos_id", "generation_type",
            "model_used", "metadata", "generated_at",
        ],
        generation_logs or [],
    )
    if source_rows is not None:
        write_csv(
            folder,
            "verified_source_records.csv",
            ["question_id", "academic_subject_id", "evidence_source", "reference", "verified"],
            source_rows,
        )


def run_audit(exports: Path, reports: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--exports", str(exports), "--out", str(reports)],
        capture_output=True,
        text=True,
        check=False,
    )


def read_audit_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


class AuditQuestionSubjectsTests(unittest.TestCase):
    def test_sql_uses_verified_test_version_schema_without_invalid_joins(self) -> None:
        sql = (SCRIPT.parent / "question_subject_audit_export.sql").read_text(encoding="utf-8")
        self.assertNotRegex(sql, r"\bversion\.(?:test_id|question_ids)\b")
        self.assertNotRegex(sql, r"\b(?:gt|generated_tests)\.parent_test_id\b")
        self.assertNotRegex(
            sql,
            r"test_metadata_id\s*=\s*(?:gt|generated_tests)\.id|"
            r"(?:gt|generated_tests)\.id\s*=\s*test_metadata_id",
        )
        test_versions_query = sql.split("-- test_versions.csv", 1)[1].split("-- `to_jsonb(q)", 1)[0]
        for field in (
            "version.id", "version.test_metadata_id", "version.version_label",
            "version.total_points", "version.created_at",
            "to_jsonb(version)->'questions'", "to_jsonb(version)->'answer_key'",
            "to_jsonb(version)->'question_order'",
        ):
            self.assertIn(field, test_versions_query)
        self.assertNotIn("WHERE", test_versions_query.upper())

    def test_sql_exports_each_dangling_non_null_tos_reference_without_inference(self) -> None:
        sql = (SCRIPT.parent / "question_subject_audit_export.sql").read_text(encoding="utf-8")
        query = sql.split("-- dangling_question_tos_references.csv", 1)[1].split(
            "-- ai_generation_logs.csv", 1
        )[0]
        for field in (
            "q.id AS question_id", "q.tos_id", "q.subject_code AS current_subject_code",
            "q.subject_description AS current_subject_description", "q.metadata",
        ):
            self.assertIn(field, query)
        self.assertRegex(query, r"WHERE\s+q\.tos_id\s+IS\s+NOT\s+NULL")
        self.assertRegex(
            query,
            r"NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.tos_entries\s+AS\s+t\s+"
            r"WHERE\s+t\.id\s*=\s*q\.tos_id\s*\)",
        )
        self.assertNotIn("DISTINCT", query.upper())
        self.assertNotRegex(query, r"(?i)(description|subject)\s*=")

    def test_tos_reference_diagnostics_separate_null_matched_and_dangling_ids(self) -> None:
        questions = [
            fixture_question("null-tos-reference", "528", tos_id_is_null="t"),
            fixture_question("matched-tos-reference", "528", tos_id="tos-101"),
            fixture_question("missing-tos-a-one", "528", tos_id="missing-tos-a"),
            fixture_question("missing-tos-a-two", "499", tos_id="missing-tos-a"),
            fixture_question("missing-tos-b", "596", tos_id="missing-tos-b"),
            fixture_question("empty-nonnull-tos-reference", "528", tos_id_is_null="false"),
        ]
        with tempfile.TemporaryDirectory(prefix="question-subject-tos-diagnostics-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, questions)
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)

            diagnostics = read_audit_rows(reports / "tos_reference_diagnostics.csv")
            rows_by_id = {row["question_id"]: row for row in diagnostics}
            self.assertEqual(len(diagnostics), len(questions))
            self.assertEqual(
                rows_by_id[fixture_id("null-tos-reference")]["tos_reference_status"],
                "NULL_TOS_ID",
            )
            self.assertEqual(
                rows_by_id[fixture_id("matched-tos-reference")]["tos_reference_status"],
                "MATCHED_TOS_ENTRY_ID",
            )
            same_missing_id_rows = [
                row for row in diagnostics if row["tos_id"] == "missing-tos-a"
            ]
            self.assertEqual(len(same_missing_id_rows), 2)
            self.assertEqual(
                {row["tos_reference_status"] for row in same_missing_id_rows},
                {"DANGLING_TOS_REFERENCE"},
            )
            self.assertEqual(
                rows_by_id[fixture_id("missing-tos-b")]["tos_reference_status"],
                "DANGLING_TOS_REFERENCE",
            )
            self.assertEqual(
                rows_by_id[fixture_id("empty-nonnull-tos-reference")]["tos_reference_status"],
                "DANGLING_TOS_REFERENCE",
            )
            summary = json.loads(
                (reports / "question_subject_audit_summary.json").read_text(encoding="utf-8")
            )
            self.assertEqual(summary["tos_reference_diagnostic_counts"], {
                "NULL_TOS_ID": 1,
                "MATCHED_TOS_ENTRY_ID": 1,
                "DANGLING_TOS_REFERENCE": 4,
            })

    def test_empty_test_versions_export_is_supported(self) -> None:
        with tempfile.TemporaryDirectory(prefix="question-subject-empty-versions-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [fixture_question("empty-version-set", "528")])
            self.assertEqual(read_audit_rows(exports / "test_versions.csv"), [])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_generated_test_pseudo_id_is_not_question_bank_ownership(self) -> None:
        question = fixture_question("pseudo-id-target", "528")
        generated_test = {
            "generated_test_id": "gt-pseudo", "tos_id": "tos-101", "subject": "",
            "course": "", "items": json.dumps([{"id": "fallback-question-17"}]),
            "created_at": "", "updated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-pseudo-id-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], generated_tests=[generated_test])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "UNRESOLVED_ANOMALY")
            self.assertEqual(row["proposed_subject_code"], "")
            diagnostics = read_audit_rows(reports / "provenance_reference_diagnostics.csv")
            self.assertEqual(diagnostics[0]["resolution_status"], "MALFORMED_UUID_CANDIDATE")

    def test_synthetic_codes_blank_codes_and_provenance_classifications(self) -> None:
        questions = [
            fixture_question("synthetic-528", "528"),
            fixture_question("synthetic-499", "499"),
            fixture_question("synthetic-596", "596"),
            fixture_question("null-code", None),
            fixture_question("empty-code", ""),
            fixture_question("whitespace-code", " \t "),
            fixture_question("needs-review-from-tos", "528", tos_id="tos-101"),
            fixture_question(
                LEGACY_QUESTION_ID,
                None,
                topic="Introduction to Computing",
                question_text="Synthetic fixture for reported legacy record",
            ),
            fixture_question(
                "conflicting-provenance",
                "528",
                tos_id="tos-101",
                metadata=json.dumps({
                    "academic_subject_id": "subject-110",
                    "subject_code": "ITPC 110",
                    "subject_description": "Computer Networking 2",
                }),
            ),
            fixture_question("unresolved-record", "528"),
            fixture_question(
                "topic-only-hardware",
                "528",
                current_subject_description="Hardware Basic",
                topic="Hardware Basic",
            ),
        ]
        with tempfile.TemporaryDirectory(prefix="question-subject-audit-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, questions)
            result = run_audit(exports, reports)

            self.assertEqual(result.returncode, 0, result.stderr)
            summary = json.loads((reports / "question_subject_audit_summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["affected_record_count_verified_from_export"], len(questions))
            self.assertEqual(summary["classification_counts"]["ANOMALY_BLANK_CODE"], 4)
            self.assertEqual(summary["classification_counts"]["CONFIRMED_RECOVERABLE"], 0)
            self.assertEqual(summary["classification_counts"]["NEEDS_REVIEW"], 2)
            self.assertEqual(summary["blank_subject_code_count"], 4)
            self.assertEqual(summary["current_suspect_code_counts"], {"499": 1, "528": 5, "596": 1})
            self.assertEqual(summary["source_count_reconciliation"]["anomaly_count"], len(questions))
            self.assertEqual(summary["source_count_reconciliation"]["total_question_count"], len(questions))
            self.assertEqual(summary["source_count_reconciliation"]["remaining_non_anomaly_count"], 0)
            self.assertEqual(
                summary["report_files"],
                [
                    "question_subject_audit.csv",
                    "ambiguous_questions.csv",
                    "confirmed_questions.csv",
                    "needs_review_questions.csv",
                    "unresolved_questions.csv",
                    "blank_code_anomalies.csv",
                    "provenance_reference_diagnostics.csv",
                    "tos_reference_diagnostics.csv",
                    "question_subject_audit_summary.json",
                ],
            )

            with (reports / "question_subject_audit.csv").open(encoding="utf-8-sig", newline="") as stream:
                report_rows = list(csv.DictReader(stream))
            rows_by_id: dict[str, list[dict[str, str]]] = {}
            for row in report_rows:
                rows_by_id.setdefault(row["question_id"], []).append(row)

            self.assertEqual(len(rows_by_id[LEGACY_QUESTION_ID]), 1)
            legacy = rows_by_id[LEGACY_QUESTION_ID][0]
            self.assertEqual(legacy["topic"], "Introduction to Computing")
            self.assertEqual(legacy["audit_classification"], "ANOMALY_BLANK_CODE")
            self.assertEqual(legacy["proposed_subject_code"], "")
            self.assertEqual(
                rows_by_id[fixture_id("conflicting-provenance")][0]["audit_classification"],
                "NEEDS_REVIEW",
            )
            self.assertEqual(rows_by_id[fixture_id("unresolved-record")][0]["audit_classification"], "UNRESOLVED_ANOMALY")
            self.assertEqual(rows_by_id[fixture_id("topic-only-hardware")][0]["audit_classification"], "UNRESOLVED_ANOMALY")
            self.assertEqual(rows_by_id[fixture_id("topic-only-hardware")][0]["proposed_subject_code"], "")
            tos_candidate = rows_by_id[fixture_id("needs-review-from-tos")][0]
            self.assertEqual(tos_candidate["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(tos_candidate["candidate_tos_ids"], "tos-101")
            self.assertIn("ITPC 101", tos_candidate["unverified_subject_suggestions"])
            for filename, classification in (
                ("needs_review_questions.csv", "NEEDS_REVIEW"),
                ("unresolved_questions.csv", "UNRESOLVED_ANOMALY"),
                ("blank_code_anomalies.csv", "ANOMALY_BLANK_CODE"),
            ):
                with (reports / filename).open(encoding="utf-8-sig", newline="") as stream:
                    class_rows = list(csv.DictReader(stream))
                self.assertTrue(all(row["audit_classification"] == classification for row in class_rows))
            with (reports / "unresolved_questions.csv").open(encoding="utf-8-sig", newline="") as stream:
                unresolved_rows = list(csv.DictReader(stream))
            self.assertEqual(
                {row["question_id"] for row in unresolved_rows},
                {
                    fixture_id("synthetic-528"), fixture_id("synthetic-499"), fixture_id("synthetic-596"),
                    fixture_id("unresolved-record"), fixture_id("topic-only-hardware"),
                },
            )
            with (reports / "confirmed_questions.csv").open(encoding="utf-8-sig", newline="") as stream:
                confirmed_rows = list(csv.DictReader(stream))
            self.assertEqual(confirmed_rows, [])

    def test_missing_question_id_stops_audit(self) -> None:
        with tempfile.TemporaryDirectory(prefix="question-subject-missing-id-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [fixture_question("", "528")])
            result = run_audit(exports, reports)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("without a question_id", result.stderr)

    def test_malformed_question_id_stops_audit(self) -> None:
        with tempfile.TemporaryDirectory(prefix="question-subject-invalid-id-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            question = fixture_question("invalid-id-fixture", "528")
            question["question_id"] = "not-a-uuid"
            create_exports(exports, [question])
            result = run_audit(exports, reports)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("malformed question IDs", result.stderr)

    def test_duplicate_question_ids_stop_classification(self) -> None:
        with tempfile.TemporaryDirectory(prefix="question-subject-duplicate-id-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [
                fixture_question("duplicate", "528"),
                fixture_question("duplicate", "528"),
            ])
            result = run_audit(exports, reports)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("duplicate question IDs", result.stderr)
            self.assertFalse((reports / "question_subject_audit.csv").exists())

    def test_count_mismatch_stops_audit(self) -> None:
        with tempfile.TemporaryDirectory(prefix="question-subject-count-mismatch-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [fixture_question("question-1", "528")])
            write_csv(exports, "count_check.csv", [
                "current_subject_code", "current_subject_description", "question_count",
            ], [{
                "current_subject_code": "528",
                "current_subject_description": "",
                "question_count": "2",
            }])
            result = run_audit(exports, reports)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("count_check.csv, and count_summary.csv do not reconcile", result.stderr)

    def test_count_summary_mismatch_stops_audit(self) -> None:
        with tempfile.TemporaryDirectory(prefix="question-subject-summary-mismatch-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [fixture_question("question-1", "528")])
            write_csv(exports, "count_summary.csv", [
                "synthetic_528_count", "synthetic_499_count", "synthetic_596_count",
                "blank_code_count", "remaining_non_anomaly_count", "total_question_count",
                "anomaly_count", "reconciled_category_total", "counts_reconcile",
            ], [{
                "synthetic_528_count": 1, "synthetic_499_count": 0, "synthetic_596_count": 0,
                "blank_code_count": 0, "remaining_non_anomaly_count": 0,
                "total_question_count": 2, "anomaly_count": 1,
                "reconciled_category_total": 1, "counts_reconcile": "false",
            }])
            result = run_audit(exports, reports)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("category totals do not reconcile", result.stderr)

    def test_provenance_diagnostics_preserve_bad_and_duplicate_references(self) -> None:
        question_id = fixture_id("diagnostic-target")
        generated_test = {
            "generated_test_id": "gt-diagnostics", "tos_id": "tos-101", "subject": "",
            "course": "", "items": json.dumps([
                {"id": question_id},
                {"question_id": question_id},
                {"id": "not-a-uuid"},
                {"id": fixture_id("orphan-reference")},
                {"topic": "not an identifier"},
                {"id": question_id, "question_id": fixture_id("other-reference")},
                17,
                "fallback-scalar-id",
            ]),
            "created_at": "", "updated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-reference-diagnostics-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(
                exports,
                [fixture_question("diagnostic-target", "528")],
                generated_tests=[generated_test],
            )
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostic_rows = read_audit_rows(reports / "provenance_reference_diagnostics.csv")
            statuses = Counter(row["resolution_status"] for row in diagnostic_rows)
            self.assertGreaterEqual(statuses["ORPHANED_REFERENCE"], 1)
            self.assertGreaterEqual(statuses["MALFORMED_UUID_CANDIDATE"], 1)
            self.assertGreaterEqual(statuses["UNSUPPORTED_IDENTIFIER_STRUCTURE"], 2)
            self.assertGreaterEqual(statuses["AMBIGUOUS_ITEM_IDENTIFIERS"], 2)
            self.assertTrue(any(row["duplicate_status"] for row in diagnostic_rows))
            summary = json.loads((reports / "question_subject_audit_summary.json").read_text(encoding="utf-8"))
            self.assertGreater(summary["duplicate_provenance_reference_count"], 0)
            audit_row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(audit_row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(audit_row["proposed_subject_code"], "")

    def test_missing_and_unexpected_provenance_payloads_are_diagnosed(self) -> None:
        generated_tests = [
            {
                "generated_test_id": "gt-null-items", "tos_id": "", "subject": "",
                "course": "", "items": "null", "created_at": "", "updated_at": "",
            },
            {
                "generated_test_id": "gt-object-items", "tos_id": "", "subject": "",
                "course": "", "items": json.dumps({"0": fixture_id("not-accepted-as-key")}),
                "created_at": "", "updated_at": "",
            },
        ]
        versions = []
        with tempfile.TemporaryDirectory(prefix="question-subject-unexpected-payload-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(
                exports, [fixture_question("scope-only", "528")],
                generated_tests=generated_tests, test_versions=versions,
            )
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            diagnostic_rows = read_audit_rows(reports / "provenance_reference_diagnostics.csv")
            statuses = {row["resolution_status"] for row in diagnostic_rows}
            self.assertIn("MISSING_OR_NULL_REFERENCE_COLLECTION", statuses)
            self.assertIn("UNSUPPORTED_JSON_STRUCTURE", statuses)

    def test_unexpected_subject_code_is_rejected_from_anomaly_export(self) -> None:
        with tempfile.TemporaryDirectory(prefix="question-subject-unexpected-code-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [fixture_question("not-in-scope", "ITCC 100")])
            result = run_audit(exports, reports)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("do not reconcile", result.stderr)

    def test_tos_id_without_canonical_subject_is_not_confirmed(self) -> None:
        question = fixture_question("q-tos-unknown", "528", tos_id="tos-unknown")
        tos = {
            "tos_id": "tos-unknown", "subject_no": "", "subject_code": "",
            "subject": "", "course": "Unknown course", "description": "",
            "subject_description": "", "created_at": "", "updated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-tos-unverified-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], tos_rows=[tos])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(row["proposed_subject_code"], "")

    def test_matching_tos_id_is_candidate_only_and_visible(self) -> None:
        question = fixture_question("q-matching-tos", "528", tos_id="tos-101")
        with tempfile.TemporaryDirectory(prefix="question-subject-tos-candidate-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)

            audit_row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            needs_review_rows = read_audit_rows(reports / "needs_review_questions.csv")
            confirmed_rows = read_audit_rows(reports / "confirmed_questions.csv")
            self.assertEqual(audit_row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(audit_row["candidate_tos_ids"], "tos-101")
            self.assertEqual(audit_row["evidence_source"], "")
            self.assertEqual(audit_row["evidence_reference"], "")
            self.assertIn("ITPC 101 - Computer System Servicing", audit_row["unverified_subject_suggestions"])
            self.assertEqual([row["question_id"] for row in needs_review_rows], [question["question_id"]])
            self.assertEqual(confirmed_rows, [])

    def test_questions_sharing_tos_id_are_classified_independently(self) -> None:
        questions = [
            fixture_question("q-shared-tos-1", "528", tos_id="tos-101"),
            fixture_question("q-shared-tos-2", "499", tos_id="tos-101"),
        ]
        with tempfile.TemporaryDirectory(prefix="question-subject-shared-tos-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, questions)
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)

            rows = read_audit_rows(reports / "question_subject_audit.csv")
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(row["audit_classification"] == "NEEDS_REVIEW" for row in rows))
            self.assertTrue(all(row["candidate_tos_ids"] == "tos-101" for row in rows))

    def test_generated_test_usage_is_only_an_unverified_suggestion(self) -> None:
        question = fixture_question("q-version-only", "528")
        generated_test = {
            "generated_test_id": "gt-110", "tos_id": "tos-110", "subject": "",
            "course": "", "items": json.dumps([{"id": fixture_id("q-version-only")}]),
            "created_at": "", "updated_at": "",
        }
        tos110 = {
            "tos_id": "tos-110", "subject_no": "ITPC 110", "subject_code": "",
            "subject": "ITPC 110 - Computer Networking 2", "course": "Computer Networking 2",
            "description": "Computer Networking 2", "subject_description": "",
            "created_at": "", "updated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-version-only-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(
                exports, [question], tos_rows=[*create_exports_tos(), tos110],
                generated_tests=[generated_test],
            )
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(row["proposed_subject_code"], "")
            self.assertIn("ITPC 110", row["unverified_subject_suggestions"])
            self.assertEqual(row["candidate_tos_ids"], "tos-110")
            self.assertEqual(row["candidate_generated_test_ids"], "gt-110")

    def test_generated_test_usage_without_tos_is_candidate_context_only(self) -> None:
        question = fixture_question("q-usage-only", "528")
        generated_test = {
            "generated_test_id": "gt-usage-only", "tos_id": "", "subject": "",
            "course": "", "items": json.dumps([{"id": fixture_id("q-usage-only")}]),
            "created_at": "", "updated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-usage-only-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], generated_tests=[generated_test])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)

            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(row["proposed_subject_code"], "")
            self.assertEqual(row["candidate_generated_test_ids"], "gt-usage-only")

    def test_generated_test_candidate_conflicting_with_direct_tos_requires_review(self) -> None:
        question = fixture_question("q-conflict", "528", tos_id="tos-101")
        generated_test = {
            "generated_test_id": "gt-110", "tos_id": "tos-110", "subject": "",
            "course": "", "items": json.dumps([{"question_id": fixture_id("q-conflict")}]),
            "created_at": "", "updated_at": "",
        }
        tos110 = {
            "tos_id": "tos-110", "subject_no": "ITPC 110", "subject_code": "",
            "subject": "ITPC 110 - Computer Networking 2", "course": "Computer Networking 2",
            "description": "Computer Networking 2", "subject_description": "",
            "created_at": "", "updated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-version-conflict-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(
                exports, [question], tos_rows=[*create_exports_tos(), tos110],
                generated_tests=[generated_test],
            )
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(row["proposed_subject_code"], "")
            self.assertIn("conflicting", row["reason"])

    def test_unknown_tos_description_and_duplicate_canonical_code_do_not_resolve(self) -> None:
        question = fixture_question("q-description", "528", tos_id="tos-101")
        tos = create_exports_tos()[0] | {"description": "Unknown description"}
        duplicate_subject = {
            "academic_subject_id": "duplicate-101",
            "subject_code": "ITPC 101",
            "subject_description": "Computer System Servicing",
            "specialization_id": "spec-it",
            "specialization": "IT",
            "category": "Major",
            "deleted": "false",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-duplicate-canonical-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(
                exports, [question], tos_rows=[tos],
                subject_rows=[*create_subjects(), duplicate_subject],
            )
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(row["proposed_subject_code"], "")

    def test_verified_independent_source_can_confirm_subject(self) -> None:
        question = fixture_question("q-verified-source", "528")
        source = {
            "question_id": question["question_id"],
            "academic_subject_id": "subject-101",
            "evidence_source": "verified-original-exam",
            "reference": "archive-record-42",
            "verified": "true",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-verified-source-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], source_rows=[source])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)

            audit_row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            confirmed_rows = read_audit_rows(reports / "confirmed_questions.csv")
            self.assertEqual(audit_row["audit_classification"], "CONFIRMED_RECOVERABLE")
            self.assertEqual(audit_row["proposed_subject_code"], "ITPC 101")
            self.assertEqual([row["question_id"] for row in confirmed_rows], [question["question_id"]])

    def test_blank_code_requires_blank_description_for_blank_assignment_class(self) -> None:
        both_blank = fixture_question("q-both-blank", None)
        code_blank_with_description = fixture_question(
            "q-code-blank-description-present",
            None,
            current_subject_description="Legacy subject description",
        )
        with tempfile.TemporaryDirectory(prefix="question-subject-blank-assignment-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [both_blank, code_blank_with_description])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)

            rows = {row["question_id"]: row for row in read_audit_rows(
                reports / "question_subject_audit.csv"
            )}
            self.assertEqual(rows[both_blank["question_id"]]["audit_classification"], "ANOMALY_BLANK_CODE")
            self.assertEqual(
                rows[code_blank_with_description["question_id"]]["audit_classification"],
                "UNRESOLVED_ANOMALY",
            )

    def test_malformed_json_identifier_does_not_link_a_question(self) -> None:
        question = fixture_question(
            "4a3e8819-8e05-4295-ae94-56e99fe6c601",
            "528",
        )
        generated_test = {
            "generated_test_id": "gt-malformed", "tos_id": "tos-101", "subject": "",
            "course": "", "items": json.dumps([{"question_id": "not-a-uuid"}]),
            "created_at": "", "updated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-malformed-id-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], generated_tests=[generated_test])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "UNRESOLVED_ANOMALY")
            self.assertEqual(row["proposed_subject_code"], "")

    def test_ai_log_subject_is_unverified_suggestion_only(self) -> None:
        question = fixture_question("q-ai-candidate", "528")
        log = {
            "generation_log_id": "log-ai",
            "question_id": fixture_id("q-ai-candidate"),
            "tos_id": "",
            "generation_type": "new",
            "model_used": "synthetic",
            "metadata": json.dumps({
                "subject_code": "ITPC 101",
                "subject_description": "Computer System Servicing",
            }),
            "generated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-ai-candidate-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], generation_logs=[log])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(row["proposed_subject_code"], "")
            self.assertEqual(row["ai_generation_log_ids"], "log-ai")
            self.assertIn("ITPC 101", row["unverified_subject_suggestions"])

    def test_ai_log_context_without_subject_metadata_is_candidate_only(self) -> None:
        question = fixture_question("q-ai-context-only", "528")
        log = {
            "generation_log_id": "log-context-only",
            "question_id": fixture_id("q-ai-context-only"),
            "tos_id": "",
            "generation_type": "new",
            "model_used": "synthetic",
            "metadata": "{}",
            "generated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-ai-context-only-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], generation_logs=[log])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)

            row = read_audit_rows(reports / "question_subject_audit.csv")[0]
            self.assertEqual(row["audit_classification"], "NEEDS_REVIEW")
            self.assertEqual(row["proposed_subject_code"], "")
            self.assertEqual(row["ai_generation_log_ids"], "log-context-only")
            self.assertEqual(row["evidence_source"], "")
            self.assertEqual(row["evidence_reference"], "")

    def test_duplicate_provenance_items_do_not_duplicate_primary_rows(self) -> None:
        question = fixture_question("q-multi-item", "528")
        generated_test = {
            "generated_test_id": "gt-duplicate-items", "tos_id": "tos-101", "subject": "",
            "course": "",
            "items": json.dumps([
                {"id": fixture_id("q-multi-item")},
                {"question_id": fixture_id("q-multi-item")},
            ]),
            "created_at": "", "updated_at": "",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-duplicate-provenance-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], generated_tests=[generated_test])
            result = run_audit(exports, reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            rows = read_audit_rows(reports / "question_subject_audit.csv")
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["audit_classification"], "NEEDS_REVIEW")

    def test_canonical_non_target_is_not_claimed_as_valid_by_anomaly_audit(self) -> None:
        question = fixture_question(
            "q-registered", "ITCC 100",
            current_subject_description="Introduction to Computing",
        )
        extra_subject = {
            "academic_subject_id": "subject-100",
            "subject_code": "ITCC 100",
            "subject_description": "Introduction to Computing",
            "specialization_id": "spec-it",
            "specialization": "IT",
            "category": "Major",
            "deleted": "false",
        }
        with tempfile.TemporaryDirectory(prefix="question-subject-out-of-scope-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [question], subject_rows=[*create_subjects(), extra_subject])
            result = run_audit(exports, reports)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("do not reconcile", result.stderr)

    def test_missing_export_file_stops_as_incomplete(self) -> None:
        with tempfile.TemporaryDirectory(prefix="question-subject-incomplete-") as directory:
            root = Path(directory)
            exports, reports = root / "exports", root / "reports"
            create_exports(exports, [fixture_question("q-incomplete", "528")])
            (exports / "test_versions.csv").unlink()
            result = run_audit(exports, reports)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("test_versions.csv", result.stderr)


if __name__ == "__main__":
    unittest.main()
