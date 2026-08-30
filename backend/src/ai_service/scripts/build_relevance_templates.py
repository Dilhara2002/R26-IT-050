"""Build deterministic, blind reviewer templates for Kandy preference relevance.

The generated files intentionally omit POI tags and every model-derived score.
Existing nonblank reviewer files are never overwritten.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = AI_SERVICE_DIR / "data"
PROFILES_PATH = DATA_DIR / "evaluation" / "kandy_preference_profiles_v1.csv"
PLACES_PATH = DATA_DIR / "verified" / "kandy_runtime_verified_v1.csv"
DEFAULT_REVIEW_A = DATA_DIR / "evaluation" / "kandy_relevance_review_a_v1.csv"
DEFAULT_REVIEW_B = DATA_DIR / "evaluation" / "kandy_relevance_review_b_v1.csv"

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
SUPPORTED_INTERESTS = {
    "Nature",
    "History",
    "Culture",
    "Religion",
    "Wildlife",
    "Adventure",
    "City",
}
EXPECTED_PROFILES = 15
EXPECTED_PLACES = 20
EXPECTED_JUDGEMENTS = EXPECTED_PROFILES * EXPECTED_PLACES


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def validate_source_rows(
    profiles: list[dict[str, str]], places: list[dict[str, str]]
) -> None:
    if len(profiles) != EXPECTED_PROFILES:
        raise ValueError(f"Expected {EXPECTED_PROFILES} profiles; found {len(profiles)}.")
    if len(places) != EXPECTED_PLACES:
        raise ValueError(f"Expected {EXPECTED_PLACES} verified POIs; found {len(places)}.")

    profile_ids = [row.get("profile_id", "").strip() for row in profiles]
    if len(set(profile_ids)) != EXPECTED_PROFILES or any(not value for value in profile_ids):
        raise ValueError("Profile IDs must be nonblank and unique.")

    normalized_profiles: set[tuple[str, ...]] = set()
    for row in profiles:
        interests = tuple(part.strip() for part in row["user_interests"].split("|") if part.strip())
        if not interests or not set(interests).issubset(SUPPORTED_INTERESTS):
            raise ValueError(f"Unsupported or empty interests for {row['profile_id']}.")
        canonical = tuple(sorted(interests))
        if canonical in normalized_profiles:
            raise ValueError(f"Duplicate reordered profile detected: {row['profile_id']}.")
        normalized_profiles.add(canonical)

    place_ids = [row.get("Place_ID", "").strip() for row in places]
    if len(set(place_ids)) != EXPECTED_PLACES or any(not value for value in place_ids):
        raise ValueError("Verified POI IDs must be nonblank and unique.")
    for row in places:
        required = ("Name", "Source_Name", "Source_URL")
        if any(not row.get(field, "").strip() for field in required):
            raise ValueError(f"POI {row.get('Place_ID', '<missing>')} lacks reviewer evidence.")


def build_rows(
    profiles: list[dict[str, str]], places: list[dict[str, str]]
) -> list[dict[str, str]]:
    validate_source_rows(profiles, places)
    rows: list[dict[str, str]] = []
    for profile in profiles:
        for place in places:
            rows.append(
                {
                    "judgement_id": f"{profile['profile_id']}::{place['Place_ID']}",
                    "profile_id": profile["profile_id"],
                    "user_interests": profile["user_interests"],
                    "place_id": place["Place_ID"],
                    "poi_name": place["Name"],
                    "source_name": place["Source_Name"],
                    "source_url": place["Source_URL"],
                    "relevance_label": "",
                    "reviewer_notes": "",
                }
            )
    if len(rows) != EXPECTED_JUDGEMENTS:
        raise AssertionError("Template generation did not produce exactly 300 rows.")
    return rows


def write_template(path: Path, rows: list[dict[str, str]], force_blank: bool) -> None:
    if path.exists() and not force_blank:
        existing = read_csv(path)
        if any(
            row.get("relevance_label", "").strip()
            or row.get("reviewer_notes", "").strip()
            for row in existing
        ):
            raise FileExistsError(
                f"Refusing to overwrite reviewer work in {path}. Use a new output path."
            )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=TEMPLATE_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build two deterministic 300-row blind Kandy relevance templates."
    )
    parser.add_argument("--profiles", type=Path, default=PROFILES_PATH)
    parser.add_argument("--places", type=Path, default=PLACES_PATH)
    parser.add_argument("--review-a", type=Path, default=DEFAULT_REVIEW_A)
    parser.add_argument("--review-b", type=Path, default=DEFAULT_REVIEW_B)
    parser.add_argument(
        "--force-blank",
        action="store_true",
        help="Regenerate blank templates only when no human labels need preserving.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = build_rows(read_csv(args.profiles), read_csv(args.places))
    write_template(args.review_a, rows, args.force_blank)
    write_template(args.review_b, rows, args.force_blank)
    print(f"Created {len(rows)} blank judgements for reviewer A: {args.review_a}")
    print(f"Created {len(rows)} blank judgements for reviewer B: {args.review_b}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
