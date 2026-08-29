"""Validate the two independent 60-row held-out relevance workbooks.

The default mode requires complete integer labels 0/1/2. ``--expect-blank`` is
reserved for validating freshly generated reviewer packets before distribution.
Only Python's standard library is used so the validator adds no dependency.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
EVALUATION_DIR = AI_SERVICE_DIR / "data" / "evaluation"
DEFAULT_REVIEW_A = EVALUATION_DIR / "reviewer_a_heldout_60.xlsx"
DEFAULT_REVIEW_B = EVALUATION_DIR / "reviewer_b_heldout_60.xlsx"
SPLIT_PATH = EVALUATION_DIR / "frozen_profile_split_seed42.csv"
PROFILES_PATH = EVALUATION_DIR / "kandy_preference_profiles_v1.csv"
PLACES_PATH = AI_SERVICE_DIR / "data" / "verified" / "kandy_runtime_verified_v1.csv"

EXPECTED_ROWS = 60
ALLOWED_LABELS = {"0", "1", "2"}
FIELDS = (
    "judgement_id", "profile_id", "user_interests", "place_id", "poi_name",
    "verified_poi_tags", "source_name", "source_url", "relevance_label", "reviewer_notes",
)
IDENTITY_FIELDS = FIELDS[:8]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


class HeldoutReviewValidationError(ValueError):
    """A fail-closed reviewer-packet validation error."""


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference.upper())
    if not letters:
        raise HeldoutReviewValidationError(f"Invalid cell reference: {reference}")
    value = 0
    for letter in letters.group(0):
        value = value * 26 + ord(letter) - ord("A") + 1
    return value - 1


def shared_strings(archive: ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.findall(".//m:t", NS)) for item in root.findall("m:si", NS)]


def worksheet_path(archive: ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationship_id = None
    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        if sheet.attrib.get("name") == sheet_name:
            relationship_id = sheet.attrib.get(f"{{{DOC_REL}}}id")
            break
    if relationship_id is None:
        raise HeldoutReviewValidationError(f"Workbook lacks required sheet {sheet_name!r}.")
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in relationships.findall("r:Relationship", REL_NS):
        if relationship.attrib.get("Id") == relationship_id:
            target = relationship.attrib["Target"].replace("\\", "/")
            if target.startswith("/"):
                return target.lstrip("/")
            return f"xl/{target}" if not target.startswith("xl/") else target
    raise HeldoutReviewValidationError(f"Cannot resolve sheet {sheet_name!r}.")


def cell_text(cell: ET.Element, strings: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS)).strip()
    value = cell.find("m:v", NS)
    if value is None or value.text is None:
        return ""
    if cell_type == "s":
        return strings[int(value.text)].strip()
    return value.text.strip()


def read_judgements(path: Path) -> tuple[tuple[str, ...], list[dict[str, str]]]:
    if not path.exists():
        raise HeldoutReviewValidationError(f"Workbook does not exist: {path}")
    try:
        with ZipFile(path) as archive:
            strings = shared_strings(archive)
            root = ET.fromstring(archive.read(worksheet_path(archive, "Judgements")))
    except (KeyError, ET.ParseError, OSError) as error:
        raise HeldoutReviewValidationError(f"Cannot read {path}: {error}") from error

    rows: dict[int, list[str]] = {}
    for row in root.findall("m:sheetData/m:row", NS):
        row_number = int(row.attrib["r"])
        values = [""] * len(FIELDS)
        for cell in row.findall("m:c", NS):
            index = column_index(cell.attrib["r"])
            if index < len(FIELDS):
                values[index] = cell_text(cell, strings)
        rows[row_number] = values
    header = tuple(rows.get(5, []))
    data = [dict(zip(FIELDS, rows.get(row_number, [""] * len(FIELDS)))) for row_number in range(6, 66)]
    return header, data


def canonical_rows() -> tuple[dict[str, tuple[str, ...]], set[str]]:
    split = read_csv(SPLIT_PATH)
    profiles = {row["profile_id"]: row for row in read_csv(PROFILES_PATH)}
    places = read_csv(PLACES_PATH)
    training_ids = {row["profile_id"] for row in split if row["split"] == "training"}
    heldout_ids = [row["profile_id"] for row in split if row["split"] == "heldout"]
    expected = {}
    for profile_id in heldout_ids:
        profile = profiles[profile_id]
        for place in places:
            identifier = f"{profile_id}::{place['Place_ID']}"
            expected[identifier] = (
                profile_id, profile["user_interests"], place["Place_ID"], place["Name"],
                place["Tags"], place["Source_Name"], place["Source_URL"],
            )
    return expected, training_ids


def validate_one(
    path: Path, reviewer: str, expected: dict[str, tuple[str, ...]], training_ids: set[str],
    expect_blank: bool,
) -> list[dict[str, str]]:
    header, rows = read_judgements(path)
    if header != FIELDS:
        raise HeldoutReviewValidationError(
            f"Reviewer {reviewer} header is invalid. Expected {FIELDS}; found {header}."
        )
    if len(rows) != EXPECTED_ROWS:
        raise HeldoutReviewValidationError(f"Reviewer {reviewer} must contain exactly 60 rows.")
    ids = [row["judgement_id"] for row in rows]
    duplicates = [identifier for identifier, count in Counter(ids).items() if count > 1]
    if duplicates:
        raise HeldoutReviewValidationError(f"Reviewer {reviewer} has duplicate IDs: {duplicates[:5]}")
    if set(ids) != set(expected):
        raise HeldoutReviewValidationError(f"Reviewer {reviewer} judgement set differs from the frozen held-out set.")
    if any(row["profile_id"] in training_ids for row in rows):
        raise HeldoutReviewValidationError(f"Reviewer {reviewer} contains a training profile.")
    for row in rows:
        actual = tuple(row[field] for field in IDENTITY_FIELDS[1:])
        if actual != expected[row["judgement_id"]]:
            raise HeldoutReviewValidationError(
                f"Reviewer {reviewer} changed canonical evidence for {row['judgement_id']}."
            )

    labels = [row["relevance_label"] for row in rows]
    if expect_blank:
        if any(labels):
            raise HeldoutReviewValidationError(f"Reviewer {reviewer} blank template contains labels.")
    else:
        blanks = [row["judgement_id"] for row in rows if not row["relevance_label"]]
        if blanks:
            raise HeldoutReviewValidationError(
                f"Reviewer {reviewer} has {len(blanks)} blank labels; examples: {blanks[:5]}."
            )
        invalid = [
            (row["judgement_id"], row["relevance_label"])
            for row in rows if row["relevance_label"] not in ALLOWED_LABELS
        ]
        if invalid:
            raise HeldoutReviewValidationError(
                f"Reviewer {reviewer} has non-integer or invalid labels: {invalid[:5]}."
            )
    return rows


def validate_pair(path_a: Path, path_b: Path, expect_blank: bool = False) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    expected, training_ids = canonical_rows()
    if len(expected) != EXPECTED_ROWS:
        raise HeldoutReviewValidationError(f"Frozen canonical set must contain 60 rows; found {len(expected)}.")
    rows_a = validate_one(path_a, "A", expected, training_ids, expect_blank)
    rows_b = validate_one(path_b, "B", expected, training_ids, expect_blank)
    by_id_b = {row["judgement_id"]: row for row in rows_b}
    for row_a in rows_a:
        row_b = by_id_b[row_a["judgement_id"]]
        if any(row_a[field] != row_b[field] for field in IDENTITY_FIELDS):
            raise HeldoutReviewValidationError(
                f"Reviewer packet identities differ for {row_a['judgement_id']}."
            )
    return rows_a, rows_b


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-a", type=Path, default=DEFAULT_REVIEW_A)
    parser.add_argument("--review-b", type=Path, default=DEFAULT_REVIEW_B)
    parser.add_argument(
        "--expect-blank", action="store_true",
        help="Validate freshly generated packets and require every label to remain blank.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        rows_a, rows_b = validate_pair(args.review_a, args.review_b, args.expect_blank)
    except HeldoutReviewValidationError as error:
        print(f"VALIDATION BLOCKED: {error}")
        return 2
    mode = "blank-template" if args.expect_blank else "completed-review"
    print(f"Validation mode: {mode}")
    print(f"Reviewer A rows: {len(rows_a)}")
    print(f"Reviewer B rows: {len(rows_b)}")
    print("Identical judgement sets: yes")
    print("Duplicate judgement IDs: 0")
    print("Held-out profiles in training: 0")
    if args.expect_blank:
        print("Blank relevance labels: 60 per workbook (required before review)")
        print("Model predictions or weak-label suggestion columns: absent")
    else:
        print(f"Reviewer A class distribution: {dict(sorted(Counter(row['relevance_label'] for row in rows_a).items()))}")
        print(f"Reviewer B class distribution: {dict(sorted(Counter(row['relevance_label'] for row in rows_b).items()))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
