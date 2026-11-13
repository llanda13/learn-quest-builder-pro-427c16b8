#!/usr/bin/env python3
"""Classify exported suspect and blank-subject-code rows without a database connection."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import uuid
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


SUSPECT_CODES = {"528", "499", "596"}
CLASSIFICATIONS = {
    "CONFIRMED_RECOVERABLE",
    "NEEDS_REVIEW",
    "UNRESOLVED_ANOMALY",
    "ANOMALY_BLANK_CODE",
    "OUT_OF_SCOPE_NONANOMALY",
}


def norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def is_blank_subject_code(value: Any) -> bool:
    return not str(value or "").strip()


def has_blank_subject_assignment(question: dict[str, str]) -> bool:
    return (
        is_blank_subject_code(question.get("current_subject_code"))
        and not str(question.get("current_subject_description") or "").strip()
    )


def is_valid_question_id(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return False
    return True


def parse_json(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if not value:
        return None
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return None


def truthy(value: Any) -> bool:
    return str(value or "").strip().casefold() in {"true", "t", "1", "yes", "verified"}


def reference_status(reference: Any, question_ids: set[str]) -> str:
    if reference is None:
        return "EMPTY_REFERENCE"
    if not isinstance(reference, str):
        return "UNSUPPORTED_IDENTIFIER_STRUCTURE"
    if not reference.strip():
        return "EMPTY_REFERENCE"
    if not is_valid_question_id(reference):
        return "MALFORMED_UUID_CANDIDATE"
    if reference not in question_ids:
        return "ORPHANED_REFERENCE"
    return "RESOLVED_REFERENCE"


def build_tos_reference_diagnostics(
    questions: list[dict[str, str]],
    tos_entries: list[dict[str, str]],
) -> list[dict[str, str]]:
    tos_id_counts = Counter(
        row["tos_id"] for row in tos_entries if row.get("tos_id") != ""
    )
    diagnostics = []
    for question in questions:
        tos_id = question.get("tos_id", "")
        is_null = truthy(question.get("tos_id_is_null"))
        match_count = tos_id_counts.get(tos_id, 0) if not is_null else 0
        if is_null:
            status = "NULL_TOS_ID"
        elif match_count:
            status = "MATCHED_TOS_ENTRY_ID"
        else:
            status = "DANGLING_TOS_REFERENCE"
        diagnostics.append({
            "question_id": question.get("question_id", ""),
            "tos_id": tos_id,
            "tos_reference_status": status,
            "matching_tos_entry_count": str(match_count),
        })
    return diagnostics


def build_reference_diagnostics(
    generated_tests: list[dict[str, str]],
    question_ids: set[str],
) -> list[dict[str, str]]:
    diagnostics: list[dict[str, str]] = []

    def add_rows(
        kind: str,
        parent_id: str,
        entries: list[tuple[str, Any, Any]],
        payload_status: str = "",
    ) -> None:
        references = [value for _, value, _ in entries if isinstance(value, str) and value.strip()]
        reference_counts = Counter(references)
        for position, reference, raw_payload in entries:
            status = payload_status or reference_status(reference, question_ids)
            diagnostics.append({
                "provenance_kind": kind,
                "parent_record_id": parent_id,
                "reference_position": position,
                "question_id_text": reference if isinstance(reference, str) else "",
                "resolution_status": status,
                "duplicate_status": (
                    "DUPLICATE_REFERENCE_IN_PARENT"
                    if isinstance(reference, str) and reference_counts[reference] > 1
                    else ""
                ),
                "raw_payload": raw_payload if isinstance(raw_payload, str) else json.dumps(
                    raw_payload, ensure_ascii=False
                ),
            })

    for test in generated_tests:
        parent_id = test.get("generated_test_id", "")
        raw = test.get("items", "")
        parsed = parse_json(raw)
        if parsed is None:
            add_rows("generated_test", parent_id, [("", None, raw)], "MISSING_OR_NULL_REFERENCE_COLLECTION")
        elif not isinstance(parsed, list):
            add_rows("generated_test", parent_id, [("", None, raw)], "UNSUPPORTED_JSON_STRUCTURE")
        elif not parsed:
            add_rows("generated_test", parent_id, [("", None, raw)], "EMPTY_REFERENCE_COLLECTION")
        else:
            entries: list[tuple[str, Any, Any]] = []
            ambiguous_positions: set[str] = set()
            missing_positions: set[str] = set()
            unsupported_positions: set[str] = set()
            for index, item in enumerate(parsed, 1):
                position = str(index)
                if isinstance(item, str):
                    entries.append((position, item, raw))
                    unsupported_positions.add(position)
                elif isinstance(item, dict):
                    identifiers = [
                        item[key] for key in ("id", "question_id", "questionId")
                        if key in item
                    ]
                    if not identifiers:
                        entries.append((position, None, raw))
                        missing_positions.add(position)
                    elif len(identifiers) > 1:
                        ambiguous_positions.add(position)
                        for identifier in identifiers:
                            entries.append((position, identifier, raw))
                    else:
                        entries.append((position, identifiers[0], raw))
                else:
                    entries.append((position, item, raw))
            before_count = len(diagnostics)
            add_rows("generated_test", parent_id, entries)
            for diagnostic in diagnostics[before_count:]:
                if diagnostic["reference_position"] in ambiguous_positions:
                    diagnostic["resolution_status"] = "AMBIGUOUS_ITEM_IDENTIFIERS"
                elif diagnostic["reference_position"] in missing_positions:
                    diagnostic["resolution_status"] = "MISSING_REFERENCE"
                elif diagnostic["reference_position"] in unsupported_positions:
                    diagnostic["resolution_status"] = "UNSUPPORTED_IDENTIFIER_STRUCTURE"
    return diagnostics


def read_csv(path: Path, required: set[str], optional: bool = False) -> list[dict[str, str]]:
    if optional and not path.exists():
        return []
    if not path.exists():
        raise ValueError(f"Required export is missing: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = set(reader.fieldnames or [])
        missing = required - fields
        if missing:
            raise ValueError(f"{path.name} is missing required columns: {', '.join(sorted(missing))}")
        return list(reader)


def subject_record(row: dict[str, str], specializations: dict[str, dict[str, str]],
                   categories: dict[str, dict[str, str]]) -> dict[str, str]:
    specialization_id = row.get("specialization_id", "")
    specialization = row.get("specialization", "")
    category = row.get("category", "")
    if not specialization:
        specialization = specializations.get(specialization_id, {}).get("name", "")
    if not category:
        spec_row = specializations.get(specialization_id, {})
        category = categories.get(spec_row.get("category_id", ""), {}).get("name", "")
    return {
        "id": row.get("academic_subject_id", row.get("id", "")),
        "code": row.get("subject_code", row.get("code", "")),
        "description": row.get("subject_description", row.get("description", "")),
        "category": category,
        "specialization": specialization,
        "deleted": row.get("deleted", ""),
    }


def resolve_subject(code: Any, descriptions: list[Any], subjects_by_code: dict[str, list[dict[str, str]]]) -> tuple[dict[str, str] | None, str]:
    matches = subjects_by_code.get(norm(code), []) if norm(code) else []
    if not matches:
        return None, "subject code does not match an exported academic_subjects record"
    if len(matches) != 1:
        return None, "subject code has duplicate canonical matches; description text cannot disambiguate identity"
    if truthy(matches[0]["deleted"]):
        return None, "subject record is deleted and is not an active canonical match"
    return matches[0], ""


def evidence_from_tos(tos: dict[str, str] | None,
                      subjects_by_code: dict[str, list[dict[str, str]]]) -> tuple[dict[str, str] | None, str]:
    if not tos:
        return None, "no exported TOS record for tos_id"
    codes = [tos.get(key) for key in ("subject_no", "subject_code") if norm(tos.get(key))]
    if not codes:
        return None, "TOS has no explicit subject_no or subject_code"
    descriptions = [
        tos.get("course"), tos.get("description"), tos.get("subject_description"),
    ]
    matches: list[dict[str, str]] = []
    for code in codes:
        match, issue = resolve_subject(code, descriptions, subjects_by_code)
        if not match:
            return None, f"TOS code {code!r} is unresolved: {issue}"
        matches.append(match)
    if len({match["id"] for match in matches}) != 1:
        return None, "TOS subject_no and subject_code identify different registered subjects"
    matched = matches[0]
    conflicting_descriptions = [
        value for value in descriptions
        if norm(value) and norm(value) != norm(matched["description"])
    ]
    if conflicting_descriptions:
        return None, "TOS official description fields conflict with the registered subject description"
    tos_subject = tos.get("subject")
    if norm(tos_subject) and norm(tos_subject) not in {
        norm(matched["code"]),
        norm(matched["description"]),
        norm(f'{matched["code"]} - {matched["description"]}'),
    }:
        return None, "TOS subject field conflicts with the registered subject code and description"
    return matched, ""


def evidence_from_metadata(metadata: dict[str, Any],
                           subjects_by_code: dict[str, list[dict[str, str]]]) -> tuple[list[tuple[str, dict[str, str]]], list[str]]:
    evidence: list[tuple[str, dict[str, str]]] = []
    issues: list[str] = []
    subject_id = metadata.get("academic_subject_id")
    if subject_id:
        subject_id_text = str(subject_id)
        candidates = [subject for rows in subjects_by_code.values() for subject in rows
                      if subject["id"] == subject_id_text and not truthy(subject["deleted"])]
        if len(candidates) == 1:
            evidence.append(("metadata.academic_subject_id", candidates[0]))
        else:
            issues.append("metadata.academic_subject_id does not match exactly one active academic_subjects record")

    explicit_code = metadata.get("subject_code") or metadata.get("subject_no")
    if explicit_code:
        explicit_description = metadata.get("subject_description") or metadata.get("description")
        candidate, issue = resolve_subject(
            explicit_code,
            [explicit_description] if explicit_description else [],
            subjects_by_code,
        )
        if candidate:
            if explicit_description and norm(explicit_description) != norm(candidate["description"]):
                issues.append("metadata explicit subject description conflicts with registered subject")
            else:
                evidence.append(("metadata.explicit_subject_code", candidate))
        else:
            issues.append(f"explicit generation subject metadata unresolved: {issue}")
    return evidence, issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exports", required=True, type=Path, help="Directory containing exported CSV files")
    parser.add_argument("--out", required=True, type=Path, help="Separate output directory; must not be the export directory")
    args = parser.parse_args()
    export_dir = args.exports.resolve()
    output_dir = args.out.resolve()
    if export_dir == output_dir or export_dir in output_dir.parents:
        parser.error("--out must be a separate directory outside --exports")

    try:
        questions = read_csv(export_dir / "questions.csv", {
            "question_id", "question_text", "choices", "correct_answer", "bloom_level",
            "difficulty", "question_points", "topic", "current_category", "current_specialization",
            "current_subject", "current_subject_code", "current_subject_description", "tos_id", "metadata",
            "tos_id_is_null",
            "created_by", "created_at", "updated_at", "deleted",
        })
        count_check = read_csv(export_dir / "count_check.csv", {
            "current_subject_code", "current_subject_description", "question_count",
        })
        count_summary_rows = read_csv(export_dir / "count_summary.csv", {
            "synthetic_528_count", "synthetic_499_count", "synthetic_596_count",
            "blank_code_count", "remaining_non_anomaly_count", "total_question_count",
            "anomaly_count", "reconciled_category_total", "counts_reconcile",
        })
        subject_rows = read_csv(export_dir / "academic_subjects.csv", {
            "academic_subject_id", "subject_code", "subject_description",
            "specialization_id", "specialization", "category", "deleted",
        })
        tos_rows = read_csv(export_dir / "tos_entries.csv", {
            "tos_id", "subject_no", "subject_code", "subject", "course",
            "description", "subject_description", "created_at", "updated_at",
        })
        generated_tests = read_csv(export_dir / "generated_tests.csv", {
            "generated_test_id", "tos_id", "subject", "course", "items",
            "created_at", "updated_at",
        })
        test_versions = read_csv(export_dir / "test_versions.csv", {
            "test_version_id", "test_metadata_id", "version_label", "questions_payload",
            "answer_key_payload", "total_points", "question_order_payload", "created_at",
        })
        generation_logs = read_csv(export_dir / "ai_generation_logs.csv", {
            "generation_log_id", "question_id", "tos_id", "generation_type",
            "model_used", "metadata", "generated_at",
        })
        source_rows = read_csv(export_dir / "verified_source_records.csv", {
            "question_id", "academic_subject_id", "evidence_source",
            "reference", "verified",
        }, optional=True)
        specialization_rows = read_csv(export_dir / "academic_specializations.csv", {
            "id", "category_id", "name",
        }, optional=True)
        category_rows = read_csv(export_dir / "academic_categories.csv", {
            "id", "name",
        }, optional=True)
    except ValueError as error:
        print(f"Audit not run: {error}", file=sys.stderr)
        return 2

    try:
        if len(count_summary_rows) != 1:
            raise ValueError("count_summary.csv must contain exactly one summary row")
        count_summary = count_summary_rows[0]
        summary_counts = {
            key: int(count_summary[key])
            for key in (
                "synthetic_528_count", "synthetic_499_count", "synthetic_596_count",
                "blank_code_count", "remaining_non_anomaly_count", "total_question_count",
                "anomaly_count", "reconciled_category_total",
            )
        }
        category_total = sum(
            summary_counts[key] for key in (
                "synthetic_528_count", "synthetic_499_count", "synthetic_596_count",
                "blank_code_count", "remaining_non_anomaly_count",
            )
        )
        if (
            not truthy(count_summary["counts_reconcile"])
            or category_total != summary_counts["total_question_count"]
            or summary_counts["reconciled_category_total"] != summary_counts["total_question_count"]
            or sum(summary_counts[key] for key in (
                "synthetic_528_count", "synthetic_499_count", "synthetic_596_count",
                "blank_code_count",
            )) != summary_counts["anomaly_count"]
        ):
            raise ValueError("count_summary.csv category totals do not reconcile")

        expected_counts = Counter()
        expected_groups = Counter()
        for row in count_check:
            amount = int(row["question_count"])
            code_key = norm(row["current_subject_code"])
            description_key = norm(row["current_subject_description"])
            expected_counts[code_key] += amount
            expected_groups[(code_key, description_key)] += amount
    except (KeyError, TypeError, ValueError) as error:
        print(f"Audit not run: invalid count summary or count_check.csv: {error}", file=sys.stderr)
        return 2
    exported_counts = Counter(norm(row["current_subject_code"]) for row in questions)
    exported_groups = Counter(
        (norm(row["current_subject_code"]), norm(row["current_subject_description"]))
        for row in questions
    )
    summary_anomaly_counts = {
        "528": summary_counts["synthetic_528_count"],
        "499": summary_counts["synthetic_499_count"],
        "596": summary_counts["synthetic_596_count"],
        "": summary_counts["blank_code_count"],
    }
    if (
        expected_counts != exported_counts
        or expected_groups != exported_groups
        or sum(expected_counts.values()) != summary_counts["anomaly_count"]
        or len(questions) != summary_counts["anomaly_count"]
        or any(exported_counts.get(code, 0) != amount for code, amount in summary_anomaly_counts.items())
    ):
        print(
            "Audit not run: questions.csv, count_check.csv, and count_summary.csv do not reconcile. "
            f"Expected {dict(expected_groups)}, exported {dict(exported_groups)}, "
            f"summary {summary_counts}.",
            file=sys.stderr,
        )
        return 2

    subject_id_counts = Counter(row["academic_subject_id"] for row in subject_rows)
    duplicate_subject_ids = sorted(subject_id for subject_id, count in subject_id_counts.items() if count > 1)
    if duplicate_subject_ids:
        print(
            "Audit not run: academic_subjects.csv contains duplicate subject IDs: "
            + ", ".join(duplicate_subject_ids),
            file=sys.stderr,
        )
        return 2
    duplicate_specialization_ids = sorted(
        identifier for identifier, count in Counter(
            row["id"] for row in specialization_rows if row.get("id")
        ).items() if count > 1
    )
    duplicate_category_ids = sorted(
        identifier for identifier, count in Counter(
            row["id"] for row in category_rows if row.get("id")
        ).items() if count > 1
    )
    specializations = {row["id"]: row for row in specialization_rows}
    categories = {row["id"]: row for row in category_rows}
    subjects = [
        subject_record(row, specializations, categories)
        for row in subject_rows
    ]
    subject_by_id = {item["id"]: item for item in subjects if item["id"]}
    subjects_by_code: dict[str, list[dict[str, str]]] = defaultdict(list)
    for item in subjects:
        if item["code"]:
            subjects_by_code[norm(item["code"])].append(item)

    tos_by_id = {row["tos_id"]: row for row in tos_rows if row.get("tos_id")}
    duplicate_tos_ids = sorted(
        tos_id for tos_id, count in Counter(row["tos_id"] for row in tos_rows if row.get("tos_id")).items()
        if count > 1
    )
    duplicate_test_ids = sorted(
        identifier for identifier, count in Counter(
            row["generated_test_id"] for row in generated_tests if row.get("generated_test_id")
        ).items() if count > 1
    )
    duplicate_version_ids = sorted(
        identifier for identifier, count in Counter(
            row["test_version_id"] for row in test_versions if row.get("test_version_id")
        ).items() if count > 1
    )
    logs_by_question: dict[str, list[dict[str, str]]] = defaultdict(list)
    for log in generation_logs:
        if log.get("question_id"):
            logs_by_question[log["question_id"]].append(log)
    duplicate_log_ids = sorted(
        log_id for log_id, count in Counter(
            row["generation_log_id"] for row in generation_logs if row.get("generation_log_id")
        ).items() if count > 1
    )
    duplicate_provenance = {
        "TOS": duplicate_tos_ids,
        "generated test": duplicate_test_ids,
        "test version": duplicate_version_ids,
        "AI generation log": duplicate_log_ids,
        "academic specialization": duplicate_specialization_ids,
        "academic category": duplicate_category_ids,
    }
    duplicate_provenance = {
        name: identifiers for name, identifiers in duplicate_provenance.items() if identifiers
    }
    if duplicate_provenance:
        print(
            "Audit not run: duplicate provenance or hierarchy IDs make relationships ambiguous: "
            + "; ".join(f"{name}: {', '.join(identifiers)}" for name, identifiers in duplicate_provenance.items()),
            file=sys.stderr,
        )
        return 2
    source_by_question: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in source_rows:
        if truthy(row.get("verified")):
            source_by_question[row["question_id"]].append(row)

    generated_test_tos: dict[str, set[str]] = defaultdict(set)
    generated_item_details: dict[str, dict[str, Any]] = {}
    generated_item_issues: dict[str, set[str]] = defaultdict(set)
    generated_test_candidates: dict[str, list[tuple[str, dict[str, str]]]] = defaultdict(list)
    generated_test_context: dict[str, set[str]] = defaultdict(set)
    question_id_set = {row["question_id"] for row in questions if row.get("question_id")}
    reference_diagnostics = build_reference_diagnostics(
        generated_tests, question_id_set
    )
    for diagnostic in reference_diagnostics:
        question_id = diagnostic["question_id_text"]
        if question_id in question_id_set and (
            diagnostic["resolution_status"] != "RESOLVED_REFERENCE"
            or diagnostic["duplicate_status"]
        ):
            generated_item_issues[question_id].add(
                f'{diagnostic["provenance_kind"]} provenance diagnostic: '
                f'{diagnostic["resolution_status"]}'
                + (f' ({diagnostic["duplicate_status"]})' if diagnostic["duplicate_status"] else "")
            )
    for test in generated_tests:
        linked_tos = test.get("tos_id", "")
        items = parse_json(test.get("items"))
        if not isinstance(items, list):
            continue
        references_by_question: Counter[str] = Counter()
        for item in items:
            if isinstance(item, dict):
                linked_question_ids = {
                    item[key] for key in ("id", "question_id", "questionId")
                    if isinstance(item.get(key), str) and item[key]
                }
            else:
                linked_question_ids = set()
            for linked_question_id in linked_question_ids:
                references_by_question[linked_question_id] += 1
                if linked_question_id in question_id_set:
                    generated_test_context[linked_question_id].add(
                        test.get("generated_test_id", "")
                    )
                if linked_tos:
                    generated_test_tos[linked_question_id].add(linked_tos)
                    if isinstance(item, dict):
                        generated_item_details.setdefault(linked_question_id, item)
                    candidate, issue = evidence_from_tos(
                        tos_by_id.get(linked_tos), subjects_by_code
                    )
                    if candidate:
                        generated_test_candidates[linked_question_id].append(
                            (f"generated test {test.get('generated_test_id')} TOS (usage only)", candidate)
                        )
                    else:
                        generated_item_issues[linked_question_id].add(
                            f"generated test {test.get('generated_test_id')} TOS candidate unresolved: {issue}"
                        )
        for linked_question_id, count in references_by_question.items():
            if count > 1:
                generated_item_issues[linked_question_id].add(
                    f"generated test {test.get('generated_test_id')} links the same question from multiple items"
                )
    id_counts = Counter(row["question_id"] for row in questions)
    if any(not row["question_id"] for row in questions):
        print("Audit not run: questions.csv contains a row without a question_id.", file=sys.stderr)
        return 2
    invalid_ids = sorted({
        row["question_id"] for row in questions
        if not is_valid_question_id(row["question_id"])
    })
    if invalid_ids:
        print(
            "Audit not run: questions.csv contains malformed question IDs: "
            + ", ".join(invalid_ids),
            file=sys.stderr,
        )
        return 2
    duplicate_ids = sorted(question_id for question_id, count in id_counts.items() if count > 1)
    if duplicate_ids:
        print(
            "Audit not run: questions.csv contains duplicate question IDs: "
            + ", ".join(duplicate_ids),
            file=sys.stderr,
        )
        return 2
    tos_reference_diagnostics = build_tos_reference_diagnostics(questions, tos_rows)
    tos_reference_counts = Counter(
        row["tos_reference_status"] for row in tos_reference_diagnostics
    )
    report_rows: list[dict[str, Any]] = []
    missing_provenance = 0
    conflicting_records = 0
    missing_subject_references = 0
    missing_academic_subject_ids = 0
    invalid_academic_subject_ids = 0
    invalid_current_codes = 0

    for row in questions:
        question_id = row["question_id"]
        raw_metadata = row.get("metadata")
        parsed_metadata = parse_json(raw_metadata)
        metadata_issue = (
            "question metadata is malformed or is not a JSON object"
            if raw_metadata and (not isinstance(parsed_metadata, dict))
            else ""
        )
        metadata = parsed_metadata or {}
        if not isinstance(metadata, dict):
            metadata = {}
        metadata_subject_id = metadata.get("academic_subject_id")
        metadata_evidence, metadata_issues = evidence_from_metadata(metadata, subjects_by_code)
        if not metadata_subject_id:
            missing_academic_subject_ids += 1
        elif any("academic_subject_id" in issue for issue in metadata_issues):
            invalid_academic_subject_ids += 1
        tos_id = row.get("tos_id", "")
        tos_record = tos_by_id.get(tos_id) if tos_id else None
        tos_subject, tos_issue = evidence_from_tos(tos_record, subjects_by_code)
        candidate_tos_ids = set()
        if tos_id:
            candidate_tos_ids.add(tos_id)
        candidate_tos_ids.update(generated_test_tos.get(question_id, set()))
        if not tos_id or not tos_record:
            missing_subject_references += 1
            if tos_id and not tos_record:
                source_issues_for_tos = f"tos_id {tos_id!r} does not match an exported TOS record"
            else:
                source_issues_for_tos = ""
        else:
            source_issues_for_tos = ""

        verified_source_evidence: list[tuple[str, dict[str, str]]] = []
        verified_source_references: list[str] = []
        source_issues: list[str] = [issue for issue in (source_issues_for_tos, metadata_issue) if issue]
        for source in source_by_question.get(question_id, []):
            candidate = subject_by_id.get(source["academic_subject_id"])
            if candidate and not truthy(candidate["deleted"]):
                verified_source_evidence.append((source["evidence_source"], candidate))
                if source.get("reference"):
                    verified_source_references.append(source["reference"])
            else:
                source_issues.append("verified source record references an unknown or inactive academic_subject_id")

        source_issues.extend(sorted(generated_item_issues.get(question_id, set())))

        evidence: list[tuple[str, dict[str, str]]] = []
        source_issues.extend(metadata_issues)
        unverified_candidates = list(generated_test_candidates.get(question_id, []))
        unverified_candidates.extend(
            (f"question metadata ({source}; unverified candidate)", subject)
            for source, subject in metadata_evidence
        )
        ai_log_refs: list[str] = []
        for log in logs_by_question.get(question_id, []):
            raw_log_metadata = log.get("metadata")
            log_metadata = parse_json(raw_log_metadata)
            if not isinstance(log_metadata, dict):
                if raw_log_metadata:
                    source_issues.append(
                        f"AI generation log {log.get('generation_log_id')} metadata is malformed or is not an object"
                    )
                ai_log_refs.append(log.get("generation_log_id", ""))
                continue
            log_evidence, log_issues = evidence_from_metadata(log_metadata, subjects_by_code)
            if log.get("generation_log_id"):
                ai_log_refs.append(log["generation_log_id"])
            unverified_candidates.extend(
                (f"AI generation log {log.get('generation_log_id')} (unverified candidate)", subject)
                for _, subject in log_evidence
            )
            for issue in log_issues:
                # Logs are candidate provenance only until their metadata semantics
                # are independently verified; retain anomalies for manual review.
                source_issues.append(f"AI generation log {log.get('generation_log_id')}: {issue}")
            log_tos_id = log.get("tos_id", "")
            if log_tos_id:
                candidate_tos_ids.add(log_tos_id)
                log_tos_subject, log_tos_issue = evidence_from_tos(
                    tos_by_id.get(log_tos_id), subjects_by_code
                )
                if log_tos_subject:
                    unverified_candidates.append((
                        f"AI generation log {log.get('generation_log_id')} TOS {log_tos_id} (unverified candidate)",
                        log_tos_subject,
                    ))
                else:
                    source_issues.append(
                        f"AI generation log {log.get('generation_log_id')} TOS unresolved: {log_tos_issue}"
                    )
        if tos_subject:
            unverified_candidates.append((
                f"questions.tos_id {tos_id} -> tos_entries (unverified candidate)",
                tos_subject,
            ))
        elif tos_id and tos_record:
            source_issues.append(f"TOS subject unresolved: {tos_issue}")
        evidence.extend(verified_source_evidence)

        reliable_subject_ids = {item["id"] for _, item in evidence}
        candidate_subject_ids = {item["id"] for _, item in unverified_candidates}
        if len(candidate_subject_ids) > 1:
            source_issues.append("usage or AI provenance contains conflicting unverified subject candidates")
        elif candidate_subject_ids and reliable_subject_ids and not candidate_subject_ids.issubset(reliable_subject_ids):
            source_issues.append("unverified usage/AI candidate conflicts with independently supported provenance")

        evidence_ids = {item["id"] for _, item in evidence}
        evidence_sources = sorted({source for source, _ in evidence})
        proposed = evidence[0][1] if len(evidence_ids) == 1 and evidence else None
        current_assignment_findings: list[str] = []
        out_of_scope = (
            not is_blank_subject_code(row.get("current_subject_code"))
            and norm(row.get("current_subject_code")) not in {norm(code) for code in SUSPECT_CODES}
        )
        current_registry_match, current_registry_issue = resolve_subject(
            row.get("current_subject_code"),
            [row.get("current_subject_description")],
            subjects_by_code,
        ) if out_of_scope else (None, "")
        current_registry_verified = bool(
            current_registry_match
            and norm(row.get("current_subject_description")) == norm(current_registry_match["description"])
            and current_registry_match["category"]
            and current_registry_match["specialization"]
        )
        if out_of_scope:
            if current_registry_verified:
                classification = "OUT_OF_SCOPE_NONANOMALY"
                reason = "record is outside anomaly-code scope and its current code/description match one active canonical subject"
            else:
                classification = "NEEDS_REVIEW"
                reason = (
                    "record is outside anomaly-code scope, but its current subject assignment is not verified "
                    f"against one active canonical subject: {current_registry_issue}"
                )
            proposed = None
        elif len(evidence_ids) > 1:
            classification = "NEEDS_REVIEW"
            reason = "independent provenance sources identify conflicting registered subjects"
        elif source_issues:
            classification = "NEEDS_REVIEW"
            reason = "available provenance contains incomplete, invalid, or conflicting subject evidence"
        elif proposed:
            current_fields = (
                ("current subject code", row.get("current_subject_code"), proposed["code"]),
                ("current subject description", row.get("current_subject_description"), proposed["description"]),
                ("current subject", row.get("current_subject"), f'{proposed["code"]} - {proposed["description"]}'),
                ("current category", row.get("current_category"), proposed["category"]),
                ("current specialization", row.get("current_specialization"), proposed["specialization"]),
            )
            mismatches = [label for label, current, canonical in current_fields
                          if norm(current) and norm(current) != norm(canonical)]
            missing_current = [label for label, current, _ in current_fields if not norm(current)]
            classification = "CONFIRMED_RECOVERABLE"
            reason = "reliable provenance identifies exactly one registered academic subject"
            if mismatches:
                current_assignment_findings.append(
                    "stored suspect assignment differs from the evidence-supported canonical assignment in: "
                    + ", ".join(mismatches)
                )
            if missing_current:
                current_assignment_findings.append(
                    "stored assignment fields are missing: " + ", ".join(missing_current)
                )
            if not proposed["category"] or not proposed["specialization"]:
                classification = "NEEDS_REVIEW"
                reason = "registered subject evidence exists, but its canonical category or specialization is unavailable"
                current_assignment_findings.append(
                    "academic subject hierarchy is incomplete; category and specialization cannot be verified"
                )
        elif (
            unverified_candidates
            or candidate_tos_ids
            or generated_test_context.get(question_id)
            or logs_by_question.get(question_id)
        ):
            classification = "NEEDS_REVIEW"
            reason = (
                "available TOS, generated-test, metadata, or AI-log context is a candidate only; "
                "subject ownership is not independently verified"
            )
        else:
            classification = "UNRESOLVED_ANOMALY"
            reason = "no reliable evidence links this question to one registered academic subject"
            if not evidence and not source_issues:
                source_issues.append("no canonical subject ID, resolvable TOS, generated-test link, or verified source record")

        if has_blank_subject_assignment(row):
            classification = "ANOMALY_BLANK_CODE"
            reason = (
                "subject code and subject description are both NULL, empty, or whitespace-only; "
                "this is a data-integrity anomaly"
                + (f"; underlying provenance assessment: {reason}" if reason else "")
            )

        explicit_metadata_subject = metadata.get("subject_code") or metadata.get("subject_no")
        if (
            not tos_id
            and not metadata_subject_id
            and not explicit_metadata_subject
            and not source_by_question.get(question_id)
            and not generated_test_tos.get(question_id)
            and not logs_by_question.get(question_id)
        ):
            missing_provenance += 1
        if classification == "NEEDS_REVIEW" or source_issues or current_assignment_findings:
            conflicting_records += 1
        if (
            not is_blank_subject_code(row.get("current_subject_code"))
            and norm(row.get("current_subject_code")) not in subjects_by_code
        ):
            invalid_current_codes += 1

        report_rows.append({
            "question_id": question_id,
            "current_subject_code": row.get("current_subject_code", ""),
            "current_subject": row.get("current_subject", ""),
            "current_subject_description": row.get("current_subject_description", ""),
            "topic": row.get("topic", ""),
            "current_category": row.get("current_category", ""),
            "current_specialization": row.get("current_specialization", ""),
            "current_tos_id": tos_id,
            "candidate_tos_ids": "; ".join(sorted(candidate_tos_ids)),
            "candidate_generated_test_ids": "; ".join(sorted(
                filter(None, generated_test_context.get(question_id, set()))
            )),
            "metadata_academic_subject_id": metadata_subject_id or "",
            "proposed_subject_code": (
                proposed["code"] if proposed and classification == "CONFIRMED_RECOVERABLE" else ""
            ),
            "proposed_subject_description": (
                proposed["description"] if proposed and classification == "CONFIRMED_RECOVERABLE" else ""
            ),
            "proposed_category": (
                proposed["category"] if proposed and classification == "CONFIRMED_RECOVERABLE" else ""
            ),
            "proposed_specialization": (
                proposed["specialization"] if proposed and classification == "CONFIRMED_RECOVERABLE" else ""
            ),
            "current_registry_verified": current_registry_verified,
            "audit_classification": classification,
            "evidence_source": "; ".join(evidence_sources),
            "evidence_reference": "; ".join(sorted(set(
                verified_source_references
                + [
                    source["reference"]
                    for source in source_by_question.get(question_id, [])
                    if source.get("reference")
                ]
            ))),
            "unverified_subject_suggestions": "; ".join(sorted({
                f'{source}: {subject["code"]} - {subject["description"]}'
                for source, subject in unverified_candidates
            })),
            "ai_generation_log_ids": "; ".join(sorted(set(filter(None, ai_log_refs)))),
            "confidence_level": "high" if classification == "CONFIRMED_RECOVERABLE" else "low",
            "reason": reason
            + (("; " + "; ".join(source_issues)) if source_issues else "")
            + (("; " + "; ".join(current_assignment_findings)) if current_assignment_findings else ""),
            "manual_review_notes": (
                "Confirm against the original examination/import source and the linked TOS; resolve every conflicting subject field before any separate correction approval."
                if classification == "NEEDS_REVIEW"
                else "Locate an original TOS, source examination, import record, or other independently verifiable provenance that identifies one registered academic subject."
            ) if classification != "CONFIRMED_RECOVERABLE" else "",
            "question_text": row.get("question_text", ""),
            "choices": parse_json(row.get("choices")) or row.get("choices", ""),
            "correct_answer": row.get("correct_answer", ""),
            "bloom_level": row.get("bloom_level", ""),
            "difficulty": row.get("difficulty", ""),
            "question_points": row.get("question_points", ""),
            "generated_item_points": generated_item_details.get(question_id, {}).get("points", ""),
            "created_by": row.get("created_by", ""),
            "created_at": row.get("created_at", ""),
            "updated_at": row.get("updated_at", ""),
            "duplicate_question_id_in_export": id_counts[question_id] > 1,
        })

    counts = Counter(row["audit_classification"] for row in report_rows)
    if sum(counts.values()) != len(questions):
        print("Audit stopped: classification totals do not account for every exported row.", file=sys.stderr)
        return 2
    proposed_summary: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    for row in report_rows:
        if row["proposed_subject_code"]:
            key = (row["proposed_subject_code"], row["proposed_subject_description"])
            proposed_summary[key][row["audit_classification"]] += 1

    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "question_subject_audit.csv"
    ambiguous_path = output_dir / "ambiguous_questions.csv"
    confirmed_path = output_dir / "confirmed_questions.csv"
    needs_review_path = output_dir / "needs_review_questions.csv"
    unresolved_path = output_dir / "unresolved_questions.csv"
    blank_anomalies_path = output_dir / "blank_code_anomalies.csv"
    diagnostics_path = output_dir / "provenance_reference_diagnostics.csv"
    tos_diagnostics_path = output_dir / "tos_reference_diagnostics.csv"
    summary_path = output_dir / "question_subject_audit_summary.json"
    columns = list(report_rows[0].keys()) if report_rows else [
        "question_id", "current_subject_code", "current_subject", "current_subject_description", "topic",
        "current_category", "current_specialization", "current_tos_id",
        "candidate_tos_ids", "candidate_generated_test_ids",
        "metadata_academic_subject_id",
        "proposed_subject_code", "proposed_subject_description", "proposed_category",
        "proposed_specialization", "audit_classification", "evidence_source",
        "current_registry_verified", "evidence_reference", "unverified_subject_suggestions", "ai_generation_log_ids",
        "confidence_level", "reason", "manual_review_notes", "question_text",
        "choices", "correct_answer", "bloom_level", "difficulty",
        "question_points", "generated_item_points", "created_by",
        "created_at", "updated_at", "duplicate_question_id_in_export",
    ]
    for path, selected_rows in (
        (csv_path, report_rows),
        (ambiguous_path, [row for row in report_rows if row["audit_classification"] != "CONFIRMED_RECOVERABLE"]),
        (confirmed_path, [row for row in report_rows if row["audit_classification"] == "CONFIRMED_RECOVERABLE"]),
        (needs_review_path, [row for row in report_rows if row["audit_classification"] == "NEEDS_REVIEW"]),
        (unresolved_path, [row for row in report_rows if row["audit_classification"] == "UNRESOLVED_ANOMALY"]),
        (blank_anomalies_path, [
            row for row in report_rows if row["audit_classification"] == "ANOMALY_BLANK_CODE"
        ]),
    ):
        with path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
            writer.writeheader()
            for item in selected_rows:
                writer.writerow({
                    **item,
                    "choices": json.dumps(item["choices"], ensure_ascii=False)
                    if isinstance(item["choices"], (dict, list)) else item["choices"],
                })
    diagnostic_columns = [
        "provenance_kind", "parent_record_id", "reference_position",
        "question_id_text", "resolution_status", "duplicate_status", "raw_payload",
    ]
    with diagnostics_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=diagnostic_columns)
        writer.writeheader()
        writer.writerows(reference_diagnostics)
    with tos_diagnostics_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(
            stream,
            fieldnames=[
                "question_id", "tos_id", "tos_reference_status",
                "matching_tos_entry_count",
            ],
        )
        writer.writeheader()
        writer.writerows(tos_reference_diagnostics)

    summary = {
        "audit_scope": "questions whose trimmed subject_code is 528, 499, 596, or blank",
        "affected_record_count_verified_from_export": len(report_rows),
        "source_count_reconciliation": summary_counts,
        "unique_question_ids": len(id_counts),
        "classification_counts": {name: counts.get(name, 0) for name in sorted(CLASSIFICATIONS)},
        "duplicate_question_ids": duplicate_ids,
        "duplicate_academic_subject_ids": duplicate_subject_ids,
        "duplicate_tos_ids_in_export": duplicate_tos_ids,
        "duplicate_generated_test_ids_in_export": duplicate_test_ids,
        "duplicate_test_version_ids_in_export": duplicate_version_ids,
        "duplicate_ai_generation_log_ids": duplicate_log_ids,
        "duplicate_academic_specialization_ids": duplicate_specialization_ids,
        "duplicate_academic_category_ids": duplicate_category_ids,
        "missing_or_unresolvable_tos_references": missing_subject_references,
        "tos_reference_diagnostic_counts": dict(tos_reference_counts),
        "missing_academic_subject_ids_in_metadata": missing_academic_subject_ids,
        "invalid_academic_subject_ids_in_metadata": invalid_academic_subject_ids,
        "records_without_any_provenance_reference": missing_provenance,
        "records_with_conflicting_or_incomplete_evidence": conflicting_records,
        "current_subject_codes_not_in_registered_subject_export": invalid_current_codes,
        "current_suspect_code_counts": {
            code: sum(1 for row in report_rows if norm(row["current_subject_code"]) == norm(code))
            for code in sorted(SUSPECT_CODES)
        },
        "blank_subject_code_count": sum(
            1 for row in report_rows if is_blank_subject_code(row["current_subject_code"])
        ),
        "provenance_reference_diagnostic_counts": dict(Counter(
            row["resolution_status"] for row in reference_diagnostics
        )),
        "duplicate_provenance_reference_count": sum(
            1 for row in reference_diagnostics if row["duplicate_status"]
        ),
        "data_integrity_findings": [
            finding for finding, present in [
                (f"Duplicate question IDs in export: {len(duplicate_ids)}", bool(duplicate_ids)),
                (f"Duplicate TOS IDs in export: {len(duplicate_tos_ids)}", bool(duplicate_tos_ids)),
                (f"Duplicate AI generation log IDs in export: {len(duplicate_log_ids)}", bool(duplicate_log_ids)),
                (
                    "Blank subject-code records: "
                    f"{sum(1 for row in report_rows if is_blank_subject_code(row['current_subject_code']))}",
                    any(is_blank_subject_code(row["current_subject_code"]) for row in report_rows),
                ),
                (f"Missing academic_subject_id metadata: {missing_academic_subject_ids}", missing_academic_subject_ids > 0),
                (f"Invalid academic_subject_id metadata: {invalid_academic_subject_ids}", invalid_academic_subject_ids > 0),
                (f"Missing or unresolvable TOS references: {missing_subject_references}", missing_subject_references > 0),
                (
                    "Dangling non-NULL TOS references: "
                    f"{tos_reference_counts['DANGLING_TOS_REFERENCE']}",
                    tos_reference_counts["DANGLING_TOS_REFERENCE"] > 0,
                ),
                (f"Current subject codes absent from active academic_subjects: {invalid_current_codes}", invalid_current_codes > 0),
                (f"Questions with conflicting or incomplete evidence: {conflicting_records}", conflicting_records > 0),
            ] if present
        ],
        "proposed_registered_subjects": [
            {
                "subject_code": code,
                "subject_description": description,
                "confirmed": value.get("CONFIRMED_RECOVERABLE", 0),
                "needs_review": value.get("NEEDS_REVIEW", 0),
                "unresolved": value.get("UNRESOLVED_ANOMALY", 0),
            }
            for (code, description), value in sorted(proposed_summary.items())
        ],
        "report_files": [
            csv_path.name,
            ambiguous_path.name,
            confirmed_path.name,
            needs_review_path.name,
            unresolved_path.name,
            blank_anomalies_path.name,
            diagnostics_path.name,
            tos_diagnostics_path.name,
            summary_path.name,
        ],
        "write_policy": "This script reads CSV exports only and writes separate report files; it never connects to or modifies a database.",
    }
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
