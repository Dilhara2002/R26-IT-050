"""Read-only structural and data-quality checks for POI CSV datasets."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable


SRI_LANKA_LATITUDE_BOUNDS = (5.8, 10.0)
SRI_LANKA_LONGITUDE_BOUNDS = (79.5, 82.0)


def normalize_name(value: str) -> str:
    """Normalize case, Unicode, punctuation, and whitespace for duplicate checks."""
    normalized = unicodedata.normalize("NFKD", value).casefold()
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = "".join(
        char if char.isalnum() or char.isspace() else " " for char in normalized
    )
    return " ".join(normalized.split())


def find_column(fieldnames: Iterable[str], *candidates: str) -> str | None:
    lookup = {name.casefold(): name for name in fieldnames}
    for candidate in candidates:
        if candidate.casefold() in lookup:
            return lookup[candidate.casefold()]
    return None


def print_distribution(title: str, values: Iterable[str]) -> None:
    counts = Counter(value.strip() for value in values if value is not None and value.strip())
    print(f"{title}: {sum(counts.values())} populated value(s), {len(counts)} unique")
    for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        print(f"  {value}: {count}")


def print_group_examples(title: str, groups: dict[object, list[int]], limit: int = 20) -> None:
    duplicate_groups = [(key, lines) for key, lines in groups.items() if len(lines) > 1]
    affected_rows = sum(len(lines) for _, lines in duplicate_groups)
    print(f"{title}: {len(duplicate_groups)} group(s), {affected_rows} row(s) affected")
    for key, lines in duplicate_groups[:limit]:
        print(f"  {key!r}: CSV lines {', '.join(str(line) for line in lines)}")
    if len(duplicate_groups) > limit:
        print(f"  ... {len(duplicate_groups) - limit} additional group(s) omitted")


def validate_csv(csv_path: Path) -> int:
    structural_errors: list[str] = []

    try:
        raw_bytes = csv_path.read_bytes()
    except OSError as error:
        print(f"STRUCTURAL ERROR: unable to read {csv_path}: {error}", file=sys.stderr)
        return 2

    print(f"Path: {csv_path.resolve()}")
    print(f"Size (bytes): {len(raw_bytes)}")
    print(f"SHA-256: {hashlib.sha256(raw_bytes).hexdigest()}")

    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        print(f"STRUCTURAL ERROR: input is not valid UTF-8: {error}", file=sys.stderr)
        return 2

    try:
        parsed_rows = list(csv.reader(io.StringIO(text, newline=""), strict=True))
    except csv.Error as error:
        print(f"STRUCTURAL ERROR: malformed CSV: {error}", file=sys.stderr)
        return 2

    if not parsed_rows:
        print("STRUCTURAL ERROR: CSV is empty", file=sys.stderr)
        return 2

    fieldnames = parsed_rows[0]
    if not fieldnames or all(not name.strip() for name in fieldnames):
        structural_errors.append("header row is empty")
    if any(not name.strip() for name in fieldnames):
        structural_errors.append("one or more column names are blank")
    normalized_headers = [name.strip().casefold() for name in fieldnames]
    if len(normalized_headers) != len(set(normalized_headers)):
        structural_errors.append("duplicate column names are present")

    expected_width = len(fieldnames)
    malformed_lines: list[tuple[int, int]] = []
    for line_number, row in enumerate(parsed_rows[1:], start=2):
        if len(row) != expected_width:
            malformed_lines.append((line_number, len(row)))
    if malformed_lines:
        structural_errors.append(
            f"{len(malformed_lines)} data row(s) do not contain {expected_width} field(s)"
        )

    valid_rows = [row for row in parsed_rows[1:] if len(row) == expected_width]
    records = [dict(zip(fieldnames, row)) for row in valid_rows]

    print(f"Rows (excluding header): {len(parsed_rows) - 1}")
    print(f"Columns: {expected_width}")
    print(f"Column names: {', '.join(fieldnames)}")

    if malformed_lines:
        for line_number, actual_width in malformed_lines[:20]:
            print(
                f"  malformed CSV line {line_number}: expected {expected_width}, got {actual_width}"
            )

    print("Missing/blank values by column:")
    for column in fieldnames:
        missing = sum(not record[column].strip() for record in records)
        print(f"  {column}: {missing}")

    row_counts = Counter(tuple(row) for row in valid_rows)
    exact_duplicate_groups = [count for count in row_counts.values() if count > 1]
    print(
        "Exact duplicate rows: "
        f"{sum(count - 1 for count in exact_duplicate_groups)} excess row(s) "
        f"across {len(exact_duplicate_groups)} group(s)"
    )

    name_column = find_column(fieldnames, "Name", "canonical_name")
    if name_column:
        name_groups: dict[str, list[int]] = defaultdict(list)
        for line_number, record in enumerate(records, start=2):
            normalized = normalize_name(record[name_column])
            if normalized:
                name_groups[normalized].append(line_number)
        print_group_examples("Normalized duplicate names", name_groups)
    else:
        print("Normalized duplicate names: not evaluated (no name column)")

    latitude_column = find_column(fieldnames, "Latitude")
    longitude_column = find_column(fieldnames, "Longitude")
    if latitude_column and longitude_column:
        coordinate_groups: dict[tuple[str, str], list[int]] = defaultdict(list)
        non_numeric_coordinates: list[int] = []
        outside_bounds: list[int] = []
        populated_coordinate_rows = 0

        for line_number, record in enumerate(records, start=2):
            latitude_text = record[latitude_column].strip()
            longitude_text = record[longitude_column].strip()
            if not latitude_text and not longitude_text:
                continue
            populated_coordinate_rows += 1
            try:
                latitude = float(latitude_text)
                longitude = float(longitude_text)
            except ValueError:
                coordinate_groups[(latitude_text, longitude_text)].append(line_number)
                non_numeric_coordinates.append(line_number)
                continue
            coordinate_groups[(latitude, longitude)].append(line_number)
            if not (
                SRI_LANKA_LATITUDE_BOUNDS[0]
                <= latitude
                <= SRI_LANKA_LATITUDE_BOUNDS[1]
                and SRI_LANKA_LONGITUDE_BOUNDS[0]
                <= longitude
                <= SRI_LANKA_LONGITUDE_BOUNDS[1]
            ):
                outside_bounds.append(line_number)

        print_group_examples("Duplicate coordinate pairs", coordinate_groups)
        print(f"Populated coordinate rows: {populated_coordinate_rows}")
        print(f"Non-numeric coordinate rows: {len(non_numeric_coordinates)}")
        print(
            "Rows outside configured Sri Lankan bounds "
            f"({SRI_LANKA_LATITUDE_BOUNDS[0]}-{SRI_LANKA_LATITUDE_BOUNDS[1]} N, "
            f"{SRI_LANKA_LONGITUDE_BOUNDS[0]}-{SRI_LANKA_LONGITUDE_BOUNDS[1]} E): "
            f"{len(outside_bounds)}"
        )
        if non_numeric_coordinates:
            print(f"  CSV lines: {', '.join(map(str, non_numeric_coordinates[:20]))}")
        if outside_bounds:
            print(f"  CSV lines: {', '.join(map(str, outside_bounds[:20]))}")
    else:
        print("Coordinate validation: not evaluated (latitude/longitude columns absent)")

    district_column = find_column(fieldnames, "District")
    if district_column:
        print_distribution("District distribution", (record[district_column] for record in records))

    category_column = find_column(fieldnames, "Tags", "categories")
    if category_column:
        categories = (
            category.strip()
            for record in records
            for category in record[category_column].split("|")
            if category.strip()
        )
        print_distribution("Category/tag distribution", categories)

    rating_column = find_column(fieldnames, "Rating", "rating_value")
    if rating_column:
        print_distribution("Rating distribution", (record[rating_column] for record in records))

    label_column = find_column(fieldnames, "label")
    if label_column:
        populated_labels = [record[label_column] for record in records if record[label_column].strip()]
        if populated_labels:
            print_distribution("Label distribution", populated_labels)
        else:
            print("Label distribution: no populated labels")

    if structural_errors:
        print("Structural validation: FAILED", file=sys.stderr)
        for error in structural_errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print("Structural validation: PASSED")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report CSV structure and POI data-quality findings without modifying the input."
    )
    parser.add_argument("csv_path", type=Path, help="Path to the CSV file to validate")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    return validate_csv(args.csv_path)


if __name__ == "__main__":
    raise SystemExit(main())
