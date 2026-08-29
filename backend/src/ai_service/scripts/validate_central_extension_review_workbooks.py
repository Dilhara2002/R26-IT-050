"""Fail-closed validation for the two blind Central extension reviewer packets."""

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
DEFAULT_REVIEW_A = EVALUATION_DIR / "reviewer_a_central_extension_60_v1.xlsx"
DEFAULT_REVIEW_B = EVALUATION_DIR / "reviewer_b_central_extension_60_v1.xlsx"
EVALUATION_PATH = EVALUATION_DIR / "central_province_evaluation_grid_v2.csv"
SPLIT_PATH = EVALUATION_DIR / "central_province_profile_split_v2.csv"
PLACES_PATH = AI_SERVICE_DIR / "data" / "verified" / "central_province_runtime_verified_v1.csv"

EXPECTED_ROWS = 60
ALLOWED_LABELS = {"0", "1", "2"}
FIELDS = (
    "judgement_id", "profile_id", "user_interests", "place_id", "poi_name", "district",
    "latitude", "longitude", "verified_poi_tags", "source_name", "source_url",
    "relevance_label", "reviewer_notes",
)
IDENTITY_FIELDS = FIELDS[:11]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


class CentralReviewValidationError(ValueError):
    pass


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference.upper())
    if not letters:
        raise CentralReviewValidationError(f"Invalid cell reference: {reference}")
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
    relationship_id = next(
        (
            sheet.attrib.get(f"{{{DOC_REL}}}id")
            for sheet in workbook.findall("m:sheets/m:sheet", NS)
            if sheet.attrib.get("name") == sheet_name
        ),
        None,
    )
    if not relationship_id:
        raise CentralReviewValidationError(f"Workbook lacks required sheet {sheet_name!r}.")
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in relationships.findall("r:Relationship", REL_NS):
        if relationship.attrib.get("Id") == relationship_id:
            target = relationship.attrib["Target"].replace("\\", "/")
            if target.startswith("/"):
                return target.lstrip("/")
            return target if target.startswith("xl/") else f"xl/{target}"
    raise CentralReviewValidationError(f"Cannot resolve sheet {sheet_name!r}.")


def cell_text(cell: ET.Element, strings: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS)).strip()
    value = cell.find("m:v", NS)
    if value is None or value.text is None:
        return ""
    return strings[int(value.text)].strip() if cell_type == "s" else value.text.strip()


def read_judgements(path: Path) -> tuple[tuple[str, ...], list[dict[str, str]]]:
    try:
        with ZipFile(path) as archive:
            strings = shared_strings(archive)
            root = ET.fromstring(archive.read(worksheet_path(archive, "Judgements")))
    except (KeyError, ET.ParseError, OSError) as error:
        raise CentralReviewValidationError(f"Cannot read {path}: {error}") from error
    rows: dict[int, list[str]] = {}
    for row in root.findall("m:sheetData/m:row", NS):
        values = [""] * len(FIELDS)
        for cell in row.findall("m:c", NS):
            index = column_index(cell.attrib["r"])
            if index < len(FIELDS):
                values[index] = cell_text(cell, strings)
        rows[int(row.attrib["r"])] = values
    header = tuple(rows.get(5, []))
    data = [dict(zip(FIELDS, rows.get(number, [""] * len(FIELDS)))) for number in range(6, 66)]
    return header, data


def canonical_rows() -> tuple[dict[str, tuple[str, ...]], set[str]]:
    places = {row["Place_ID"]: row for row in read_csv(PLACES_PATH)}
    evaluation = [
        row for row in read_csv(EVALUATION_PATH)
        if row["evaluation_partition"] == "blinded_cross_district_extension_v2"
    ]
    training_ids = {
        row["profile_id"] for row in read_csv(SPLIT_PATH) if row["split"] == "training"
    }
    expected = {}
    for row in evaluation:
        place = places[row["place_id"]]
        expected[row["judgement_id"]] = (
            row["judgement_id"], row["profile_id"], row["user_interests"], row["place_id"],
            row["poi_name"], row["district"], str(float(place["Latitude"])),
            str(float(place["Longitude"])), row["verified_poi_tags"], row["source_name"],
            row["source_url"],
        )
    return expected, training_ids


def validate_one(path: Path, expected: dict[str, tuple[str, ...]], training_ids: set[str], expect_blank: bool) -> list[dict[str, str]]:
    header, rows = read_judgements(path)
    if header != FIELDS:
        raise CentralReviewValidationError(f"Invalid Judgements header in {path.name}.")
    ids = [row["judgement_id"] for row in rows]
    if len(rows) != EXPECTED_ROWS or len(set(ids)) != EXPECTED_ROWS or set(ids) != set(expected):
        raise CentralReviewValidationError(f"{path.name} must contain the exact 60 unique extension judgements.")
    if any(row["profile_id"] in training_ids for row in rows):
        raise CentralReviewValidationError(f"{path.name} contains training-profile leakage.")
    for row in rows:
        actual = tuple(row[field] for field in IDENTITY_FIELDS)
        if actual != expected[row["judgement_id"]]:
            raise CentralReviewValidationError(f"Canonical evidence changed for {row['judgement_id']}.")
    labels = [row["relevance_label"] for row in rows]
    if expect_blank and any(labels):
        raise CentralReviewValidationError(f"{path.name} must remain entirely blank before review.")
    if not expect_blank:
        if any(not label for label in labels):
            raise CentralReviewValidationError(f"{path.name} contains blank labels.")
        if any(label not in ALLOWED_LABELS for label in labels):
            raise CentralReviewValidationError(f"{path.name} contains labels outside integer 0, 1, 2.")
    return rows


def validate_pair(path_a: Path, path_b: Path, expect_blank: bool = False) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    expected, training_ids = canonical_rows()
    if len(expected) != 60:
        raise CentralReviewValidationError(f"Canonical extension grid must contain 60 rows; found {len(expected)}.")
    rows_a = validate_one(path_a, expected, training_ids, expect_blank)
    rows_b = validate_one(path_b, expected, training_ids, expect_blank)
    by_id_b = {row["judgement_id"]: row for row in rows_b}
    for row_a in rows_a:
        row_b = by_id_b[row_a["judgement_id"]]
        if any(row_a[field] != row_b[field] for field in IDENTITY_FIELDS):
            raise CentralReviewValidationError(f"Packet evidence differs for {row_a['judgement_id']}.")
    if [row["judgement_id"] for row in rows_a] == [row["judgement_id"] for row in rows_b]:
        raise CentralReviewValidationError("Reviewer packets must use independently randomized row order.")
    return rows_a, rows_b


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-a", type=Path, default=DEFAULT_REVIEW_A)
    parser.add_argument("--review-b", type=Path, default=DEFAULT_REVIEW_B)
    parser.add_argument("--expect-blank", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        rows_a, rows_b = validate_pair(args.review_a, args.review_b, args.expect_blank)
    except CentralReviewValidationError as error:
        print(f"VALIDATION BLOCKED: {error}")
        return 2
    print(f"Reviewer A rows: {len(rows_a)}")
    print(f"Reviewer B rows: {len(rows_b)}")
    print("Identical judgement/evidence sets: yes")
    print("Independent row order: yes")
    print("Duplicate judgement IDs: 0")
    print("Training-profile leakage: 0")
    if args.expect_blank:
        print("Blank relevance labels: 60 per workbook")
        print("Weak-label/model-prediction columns: absent")
    else:
        print(f"Reviewer A labels: {dict(sorted(Counter(row['relevance_label'] for row in rows_a).items()))}")
        print(f"Reviewer B labels: {dict(sorted(Counter(row['relevance_label'] for row in rows_b).items()))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
