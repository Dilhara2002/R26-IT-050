"""Prepare the leakage-safe Phase 1 relevance data for the itinerary component.

This module validates the committed Kandy preference profiles and verified POIs,
freezes a seed-42 profile-group split, and creates rule-derived weak labels for
training profiles only. It never reads reviewer files or model outputs.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path
import random


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
EVALUATION_DIR = AI_SERVICE_DIR / "data" / "evaluation"
PROFILES_PATH = EVALUATION_DIR / "kandy_preference_profiles_v1.csv"
PLACES_PATH = AI_SERVICE_DIR / "data" / "verified" / "kandy_runtime_verified_v1.csv"
DEFAULT_SPLIT_OUT = EVALUATION_DIR / "frozen_profile_split_seed42.csv"
DEFAULT_WEAK_LABELS_OUT = EVALUATION_DIR / "rule_derived_weak_training_labels_v1.csv"

EXPECTED_PROFILE_COUNT = 15
EXPECTED_POI_COUNT = 20
EXPECTED_TRAINING_PROFILES = 12
EXPECTED_HELDOUT_PROFILES = 3
EXPECTED_TRAINING_ROWS = 240
SEED = 42
RULE_VERSION = "verified_tag_interest_coverage_v1"
SUPPORTED_INTERESTS = {
    "nature", "history", "culture", "religion", "wildlife", "adventure", "city"
}

SPLIT_FIELDS = ("profile_id", "user_interests", "interest_count", "split", "seed")
WEAK_LABEL_FIELDS = (
    "judgement_id", "profile_id", "user_interests", "place_id", "poi_name",
    "verified_poi_tags", "overlap_set", "interest_coverage", "weak_label",
    "rule_version", "source_name", "source_url",
)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def normalized_set(value: str) -> set[str]:
    return {part.strip().lower() for part in value.split("|") if part.strip()}


def validate_sources(
    profiles: list[dict[str, str]], places: list[dict[str, str]]
) -> dict[str, int]:
    if len(profiles) != EXPECTED_PROFILE_COUNT:
        raise ValueError(f"Expected 15 committed profiles; found {len(profiles)}.")
    if len(places) != EXPECTED_POI_COUNT:
        raise ValueError(f"Expected 20 verified Kandy POIs; found {len(places)}.")

    profile_ids = [row.get("profile_id", "").strip() for row in profiles]
    if any(not value for value in profile_ids) or len(set(profile_ids)) != len(profile_ids):
        raise ValueError("Profile IDs must be nonblank and unique.")
    for row in profiles:
        interests = normalized_set(row.get("user_interests", ""))
        if not interests or not interests.issubset(SUPPORTED_INTERESTS):
            raise ValueError(f"Profile {row.get('profile_id', '<missing>')} has invalid interests.")

    place_ids = [row.get("Place_ID", "").strip() for row in places]
    if any(not value for value in place_ids) or len(set(place_ids)) != len(place_ids):
        raise ValueError("POI IDs must be nonblank and unique.")
    coordinates: list[tuple[str, str]] = []
    for row in places:
        place_id = row.get("Place_ID", "").strip()
        if row.get("Legacy_Place_ID", "").strip() == "79":
            raise ValueError("Retired legacy POI 79 must not enter Phase 1 data.")
        if row.get("District", "").strip().lower() != "kandy":
            raise ValueError(f"POI {place_id} is outside the verified Kandy catalogue.")
        if row.get("Verification_Status", "").strip() != "source_trace_verified":
            raise ValueError(f"POI {place_id} is not source-trace verified.")
        if not normalized_set(row.get("Tags", "")):
            raise ValueError(f"POI {place_id} has no verified tags.")
        required = ("Name", "Latitude", "Longitude", "Source_Name", "Source_URL")
        if any(not row.get(field, "").strip() for field in required):
            raise ValueError(f"POI {place_id} has missing identity, coordinate, or source data.")
        coordinates.append((row["Latitude"].strip(), row["Longitude"].strip()))
    if len(set(coordinates)) != len(coordinates):
        raise ValueError("Verified POIs contain duplicate coordinates.")

    return {
        "profiles": len(profiles),
        "pois": len(places),
        "legacy_79": 0,
        "duplicate_profile_ids": 0,
        "duplicate_poi_ids": 0,
        "duplicate_coordinates": 0,
        "missing_interest_records": 0,
        "missing_tag_records": 0,
        "unverified_pois": 0,
    }


def frozen_split(profiles: list[dict[str, str]]) -> tuple[list[str], list[str]]:
    """Select one sorted candidate from each 1/2/3-interest stratum with Random(42)."""
    rng = random.Random(SEED)
    heldout: list[str] = []
    for interest_count in (1, 2, 3):
        candidates = sorted(
            (
                row for row in profiles
                if len(normalized_set(row["user_interests"])) == interest_count
            ),
            key=lambda row: row["profile_id"],
        )
        if not candidates:
            raise ValueError(f"No {interest_count}-interest profile exists for stratification.")
        heldout.append(rng.choice(candidates)["profile_id"])
    training = [row["profile_id"] for row in profiles if row["profile_id"] not in heldout]
    if len(training) != EXPECTED_TRAINING_PROFILES or len(heldout) != EXPECTED_HELDOUT_PROFILES:
        raise AssertionError("Frozen split did not produce 12 training and 3 held-out profiles.")
    return training, heldout


def build_split_rows(
    profiles: list[dict[str, str]], training_ids: list[str], heldout_ids: list[str]
) -> list[dict[str, str]]:
    training = set(training_ids)
    heldout = set(heldout_ids)
    return [
        {
            "profile_id": row["profile_id"],
            "user_interests": row["user_interests"],
            "interest_count": str(len(normalized_set(row["user_interests"]))),
            "split": "training" if row["profile_id"] in training else "heldout",
            "seed": str(SEED),
        }
        for row in profiles
        if row["profile_id"] in training | heldout
    ]


def build_weak_label_rows(
    profiles: list[dict[str, str]], places: list[dict[str, str]], training_ids: list[str]
) -> list[dict[str, str]]:
    training = set(training_ids)
    rows: list[dict[str, str]] = []
    for profile in profiles:
        if profile["profile_id"] not in training:
            continue
        interests = normalized_set(profile["user_interests"])
        for place in places:
            tags = normalized_set(place["Tags"])
            overlap = interests & tags
            if not overlap:
                label = 0
            elif overlap == interests:
                label = 2
            else:
                label = 1
            rows.append(
                {
                    "judgement_id": f"{profile['profile_id']}::{place['Place_ID']}",
                    "profile_id": profile["profile_id"],
                    "user_interests": "|".join(sorted(interests)),
                    "place_id": place["Place_ID"],
                    "poi_name": place["Name"],
                    "verified_poi_tags": "|".join(sorted(tags)),
                    "overlap_set": "|".join(sorted(overlap)),
                    "interest_coverage": f"{len(overlap) / len(interests):.6f}",
                    "weak_label": str(label),
                    "rule_version": RULE_VERSION,
                    "source_name": place["Source_Name"],
                    "source_url": place["Source_URL"],
                }
            )
    if len(rows) != EXPECTED_TRAINING_ROWS:
        raise AssertionError(f"Expected 240 weak-labelled rows; produced {len(rows)}.")
    if len({row["judgement_id"] for row in rows}) != len(rows):
        raise AssertionError("Weak-label rows contain duplicate judgement IDs.")
    return rows


def write_csv(path: Path, fields: tuple[str, ...], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profiles", type=Path, default=PROFILES_PATH)
    parser.add_argument("--places", type=Path, default=PLACES_PATH)
    parser.add_argument("--split-out", type=Path, default=DEFAULT_SPLIT_OUT)
    parser.add_argument("--weak-labels-out", type=Path, default=DEFAULT_WEAK_LABELS_OUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    profiles = read_csv(args.profiles)
    places = read_csv(args.places)
    checks = validate_sources(profiles, places)
    training_ids, heldout_ids = frozen_split(profiles)
    split_rows = build_split_rows(profiles, training_ids, heldout_ids)
    weak_rows = build_weak_label_rows(profiles, places, training_ids)
    distribution = Counter(int(row["weak_label"]) for row in weak_rows)
    if len(distribution) < 2:
        raise ValueError("Fewer than two usable weak-label classes; Phase 1 is blocked.")
    write_csv(args.split_out, SPLIT_FIELDS, split_rows)
    write_csv(args.weak_labels_out, WEAK_LABEL_FIELDS, weak_rows)

    print(f"Source validation: {checks}")
    print(f"Training profiles ({len(training_ids)}): {','.join(training_ids)}")
    print(f"Held-out profiles ({len(heldout_ids)}): {','.join(heldout_ids)}")
    print(f"Training rows: {len(weak_rows)}; held-out rows reserved: {len(heldout_ids) * len(places)}")
    print(f"Rule-derived weak training label distribution: {dict(sorted(distribution.items()))}")
    print(f"Frozen split: {args.split_out.resolve()}")
    print(f"Weak labels: {args.weak_labels_out.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
