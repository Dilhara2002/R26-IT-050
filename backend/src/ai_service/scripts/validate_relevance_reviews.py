"""Validate, compare, and explicitly adjudicate two relevance reviews.

This script never infers labels. It fails closed until both reviewers have filled
all 300 rows, and it requires a separate human adjudication for every disagreement.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path
import sys


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
EVALUATION_DIR = AI_SERVICE_DIR / "data" / "evaluation"
DEFAULT_REVIEW_A = EVALUATION_DIR / "kandy_relevance_review_a_v1.csv"
DEFAULT_REVIEW_B = EVALUATION_DIR / "kandy_relevance_review_b_v1.csv"
PROFILES_PATH = EVALUATION_DIR / "kandy_preference_profiles_v1.csv"
PLACES_PATH = AI_SERVICE_DIR / "data" / "verified" / "kandy_runtime_verified_v1.csv"
EXPECTED_ROWS = 300
ALLOWED_LABELS = {"0", "1", "2"}
TEMPLATE_FIELDS = (
    "judgement_id",
    "profile_id",
    "user_interests",
    "place_id",
    "poi_name",
    "source_name",
    "source_url",
    "relevance_label",
    "reviewer_notes",
)
IDENTITY_FIELDS = TEMPLATE_FIELDS[:7]
DISAGREEMENT_FIELDS = (
    *IDENTITY_FIELDS,
    "reviewer_a_label",
    "reviewer_b_label",
    "adjudicated_label",
    "adjudicator_notes",
)
VALIDATED_FIELDS = (
    *IDENTITY_FIELDS,
    "reviewer_a_label",
    "reviewer_b_label",
    "final_relevance_label",
    "label_source",
)


class ReviewValidationError(ValueError):
    """Controlled validation failure that must block evaluation."""


def read_csv_with_header(path: Path) -> tuple[tuple[str, ...], list[dict[str, str]]]:
    if not path.exists():
        raise ReviewValidationError(f"Review file does not exist: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        header = tuple(reader.fieldnames or ())
        rows = []
        for row_number, row in enumerate(reader, start=2):
            if None in row:
                raise ReviewValidationError(
                    f"Malformed CSV row {row_number} in {path}: unexpected extra values."
                )
            rows.append({key: (value or "").strip() for key, value in row.items()})
    return header, rows


def canonical_evidence() -> dict[str, tuple[str, ...]]:
    _, profiles = read_csv_with_header(PROFILES_PATH)
    _, places = read_csv_with_header(PLACES_PATH)
    if len(profiles) != 15 or len(places) != 20:
        raise ReviewValidationError("Canonical evaluation inputs must contain 15 profiles and 20 POIs.")
    return {
        f"{profile['profile_id']}::{place['Place_ID']}": (
            profile["profile_id"],
            profile["user_interests"],
            place["Place_ID"],
            place["Name"],
            place["Source_Name"],
            place["Source_URL"],
        )
        for profile in profiles
        for place in places
    }


def validate_review(path: Path, reviewer_name: str) -> list[dict[str, str]]:
    header, rows = read_csv_with_header(path)
    if header != TEMPLATE_FIELDS:
        raise ReviewValidationError(
            f"Reviewer {reviewer_name} has an invalid structure. "
            f"Expected columns {TEMPLATE_FIELDS}; found {header}."
        )
    if len(rows) != EXPECTED_ROWS:
        raise ReviewValidationError(
            f"Reviewer {reviewer_name} must contain exactly {EXPECTED_ROWS} rows; "
            f"found {len(rows)}."
        )

    ids = [row["judgement_id"] for row in rows]
    duplicates = sorted(identifier for identifier, count in Counter(ids).items() if count > 1)
    if duplicates:
        raise ReviewValidationError(
            f"Reviewer {reviewer_name} contains duplicate judgement IDs: {duplicates[:5]}"
        )
    if any(not identifier for identifier in ids):
        raise ReviewValidationError(f"Reviewer {reviewer_name} contains a blank judgement ID.")

    canonical = canonical_evidence()
    missing = sorted(set(canonical) - set(ids))
    extra = sorted(set(ids) - set(canonical))
    if missing or extra:
        raise ReviewValidationError(
            f"Reviewer {reviewer_name} differs from the canonical 15x20 judgement grid. "
            f"Missing: {missing[:5]}; extra: {extra[:5]}."
        )
    evidence_fields = IDENTITY_FIELDS[1:]
    for row in rows:
        if tuple(row[field] for field in evidence_fields) != canonical[row["judgement_id"]]:
            raise ReviewValidationError(
                f"Reviewer {reviewer_name} changed canonical evidence for "
                f"{row['judgement_id']}."
            )

    blank_ids = [row["judgement_id"] for row in rows if not row["relevance_label"]]
    if blank_ids:
        raise ReviewValidationError(
            f"Reviewer {reviewer_name} has {len(blank_ids)} blank relevance labels; "
            f"examples: {blank_ids[:5]}. Complete all labels before evaluation."
        )
    invalid = [
        (row["judgement_id"], row["relevance_label"])
        for row in rows
        if row["relevance_label"] not in ALLOWED_LABELS
    ]
    if invalid:
        raise ReviewValidationError(
            f"Reviewer {reviewer_name} has labels outside 0, 1, 2: {invalid[:5]}"
        )
    return rows


def align_reviews(
    rows_a: list[dict[str, str]], rows_b: list[dict[str, str]]
) -> list[tuple[dict[str, str], dict[str, str]]]:
    by_id_a = {row["judgement_id"]: row for row in rows_a}
    by_id_b = {row["judgement_id"]: row for row in rows_b}
    missing_from_b = sorted(set(by_id_a) - set(by_id_b))
    extra_in_b = sorted(set(by_id_b) - set(by_id_a))
    if missing_from_b or extra_in_b:
        raise ReviewValidationError(
            "Reviewer judgement IDs differ. "
            f"Missing from B: {missing_from_b[:5]}; extra in B: {extra_in_b[:5]}."
        )

    aligned: list[tuple[dict[str, str], dict[str, str]]] = []
    for row_a in rows_a:
        row_b = by_id_b[row_a["judgement_id"]]
        structural_differences = [
            field for field in IDENTITY_FIELDS if row_a[field] != row_b[field]
        ]
        if structural_differences:
            raise ReviewValidationError(
                f"Reviewer templates differ for {row_a['judgement_id']} in fields "
                f"{structural_differences}."
            )
        aligned.append((row_a, row_b))
    return aligned


def agreement_statistics(
    aligned: list[tuple[dict[str, str], dict[str, str]]]
) -> tuple[float, float]:
    total = len(aligned)
    observed_matches = sum(
        row_a["relevance_label"] == row_b["relevance_label"]
        for row_a, row_b in aligned
    )
    observed = observed_matches / total
    counts_a = Counter(row_a["relevance_label"] for row_a, _ in aligned)
    counts_b = Counter(row_b["relevance_label"] for _, row_b in aligned)
    expected = sum((counts_a[label] / total) * (counts_b[label] / total) for label in ALLOWED_LABELS)
    kappa = 1.0 if expected == 1.0 and observed == 1.0 else (observed - expected) / (1.0 - expected)
    return observed * 100.0, kappa


def disagreement_rows(
    aligned: list[tuple[dict[str, str], dict[str, str]]]
) -> list[dict[str, str]]:
    disagreements: list[dict[str, str]] = []
    for row_a, row_b in aligned:
        if row_a["relevance_label"] == row_b["relevance_label"]:
            continue
        disagreements.append(
            {
                **{field: row_a[field] for field in IDENTITY_FIELDS},
                "reviewer_a_label": row_a["relevance_label"],
                "reviewer_b_label": row_b["relevance_label"],
                "adjudicated_label": "",
                "adjudicator_notes": "",
            }
        )
    return disagreements


def write_csv(path: Path, fields: tuple[str, ...], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def load_adjudications(
    path: Path, expected_disagreements: list[dict[str, str]]
) -> dict[str, str]:
    header, rows = read_csv_with_header(path)
    if header != DISAGREEMENT_FIELDS:
        raise ReviewValidationError(
            f"Adjudication structure is invalid. Expected {DISAGREEMENT_FIELDS}; found {header}."
        )
    expected_by_id = {row["judgement_id"]: row for row in expected_disagreements}
    actual_by_id = {row["judgement_id"]: row for row in rows}
    if len(actual_by_id) != len(rows):
        raise ReviewValidationError("Adjudication file contains duplicate judgement IDs.")
    missing = sorted(set(expected_by_id) - set(actual_by_id))
    extra = sorted(set(actual_by_id) - set(expected_by_id))
    if missing or extra:
        raise ReviewValidationError(
            f"Adjudication IDs do not match disagreements. Missing: {missing[:5]}; "
            f"extra: {extra[:5]}."
        )
    for identifier, row in actual_by_id.items():
        expected = expected_by_id[identifier]
        structural_fields = (*IDENTITY_FIELDS, "reviewer_a_label", "reviewer_b_label")
        if any(row[field] != expected[field] for field in structural_fields):
            raise ReviewValidationError(f"Adjudication evidence changed for {identifier}.")
        if not row["adjudicated_label"]:
            raise ReviewValidationError(f"Adjudicated label is blank for {identifier}.")
        if row["adjudicated_label"] not in ALLOWED_LABELS:
            raise ReviewValidationError(
                f"Adjudicated label for {identifier} must be 0, 1, or 2."
            )
    return {
        identifier: row["adjudicated_label"] for identifier, row in actual_by_id.items()
    }


def build_validated_rows(
    aligned: list[tuple[dict[str, str], dict[str, str]]],
    adjudicated: dict[str, str],
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for row_a, row_b in aligned:
        identifier = row_a["judgement_id"]
        if row_a["relevance_label"] == row_b["relevance_label"]:
            final_label = row_a["relevance_label"]
            label_source = "reviewer_consensus"
        else:
            if identifier not in adjudicated:
                raise ReviewValidationError(
                    f"No adjudicated label supplied for disagreement {identifier}."
                )
            final_label = adjudicated[identifier]
            label_source = "human_adjudication"
        rows.append(
            {
                **{field: row_a[field] for field in IDENTITY_FIELDS},
                "reviewer_a_label": row_a["relevance_label"],
                "reviewer_b_label": row_b["relevance_label"],
                "final_relevance_label": final_label,
                "label_source": label_source,
            }
        )
    return rows


def parse_args() -> argparse.Namespace:
    instructions = """
Independent reviewer instructions:
  * Fill every relevance_label with exactly 0, 1, or 2.
  * 0 = irrelevant to the requested interests.
  * 1 = partly relevant to the requested interests.
  * 2 = highly relevant to the requested interests.
  * Judge preference relevance, not geographic closeness.
  * The source URL may be consulted only to understand POI identity.
  * Work independently. Do not view POI Tags, model scores/ranks, or the other review.
  * reviewer_notes is optional; do not alter identity/source columns or row IDs.
"""
    parser = argparse.ArgumentParser(
        description="Validate two complete independent Kandy relevance reviews.",
        epilog=instructions,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--review-a", type=Path, default=DEFAULT_REVIEW_A)
    parser.add_argument("--review-b", type=Path, default=DEFAULT_REVIEW_B)
    parser.add_argument(
        "--disagreements-out",
        type=Path,
        help="Write a blank human-adjudication CSV after both reviews validate.",
    )
    parser.add_argument(
        "--adjudicated",
        type=Path,
        help="Completed adjudication CSV matching every disagreement.",
    )
    parser.add_argument(
        "--validated-out",
        type=Path,
        help="Write evaluator input only after consensus/adjudication is complete.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        rows_a = validate_review(args.review_a, "A")
        rows_b = validate_review(args.review_b, "B")
        aligned = align_reviews(rows_a, rows_b)
        agreement, kappa = agreement_statistics(aligned)
        disagreements = disagreement_rows(aligned)
        print(f"Validated reviewer A rows: {len(rows_a)}")
        print(f"Validated reviewer B rows: {len(rows_b)}")
        print(f"Exact agreement: {agreement:.2f}%")
        print(f"Cohen's kappa: {kappa:.6f}")
        print(f"Disagreements requiring human adjudication: {len(disagreements)}")

        if disagreements and args.disagreements_out:
            write_csv(args.disagreements_out, DISAGREEMENT_FIELDS, disagreements)
            print(f"Wrote adjudication template: {args.disagreements_out}")

        adjudicated: dict[str, str] = {}
        if disagreements:
            if args.adjudicated is None:
                raise ReviewValidationError(
                    "Evaluation remains blocked: supply a completed --adjudicated file "
                    "covering every disagreement."
                )
            adjudicated = load_adjudications(args.adjudicated, disagreements)

        validated_rows = build_validated_rows(aligned, adjudicated)
        if args.validated_out is None:
            raise ReviewValidationError(
                "Reviews are resolved, but no --validated-out path was supplied; "
                "no evaluator input was created."
            )
        write_csv(args.validated_out, VALIDATED_FIELDS, validated_rows)
        print(f"Wrote {len(validated_rows)} validated adjudicated judgements: {args.validated_out}")
        return 0
    except ReviewValidationError as error:
        print(f"VALIDATION BLOCKED: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
