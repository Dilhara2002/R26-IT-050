"""Build the frozen Central Province v2 relevance data without model training.

The script preserves the 15 v1 profiles and the three frozen held-out IDs,
adds five deterministic training-only profiles, emits weak supervision only
for training profiles, and reserves new cross-district held-out pairs for
independent human review with blank label cells.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter
import math
from pathlib import Path


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
EVALUATION_DIR = AI_SERVICE_DIR / "data" / "evaluation"
V1_PROFILES_PATH = EVALUATION_DIR / "kandy_preference_profiles_v1.csv"
V1_SPLIT_PATH = EVALUATION_DIR / "frozen_profile_split_seed42.csv"
PLACES_PATH = AI_SERVICE_DIR / "data" / "verified" / "central_province_runtime_verified_v1.csv"
HUMAN_REFERENCE_PATH = EVALUATION_DIR / "final_human_reviewed_heldout_60.csv"
PROFILES_OUT = EVALUATION_DIR / "central_province_preference_profiles_v2.csv"
SPLIT_OUT = EVALUATION_DIR / "central_province_profile_split_v2.csv"
WEAK_OUT = EVALUATION_DIR / "rule_derived_weak_training_labels_v2.csv"
EVALUATION_OUT = EVALUATION_DIR / "central_province_evaluation_grid_v2.csv"
EXAMPLES_OUT = EVALUATION_DIR / "central_province_relevance_examples_v2.csv"

SUPPORTED_INTERESTS = {
    "adventure", "city", "culture", "history", "nature", "religion", "wildlife"
}
EXPECTED_DISTRICTS = {"Kandy": 20, "Matale": 10, "Nuwara Eliya": 10}
HELDOUT_IDS = ("P06", "P08", "P13")
NEW_PROFILES = (
    ("P16", "Religion|Wildlife"),
    ("P17", "Adventure|City"),
    ("P18", "History|Religion"),
    ("P19", "Nature|Wildlife|City"),
    ("P20", "Culture|Religion|Adventure"),
)
RULE_VERSION = "verified_tag_interest_coverage_v1"

PROFILE_FIELDS = ("profile_id", "user_interests")
SPLIT_FIELDS = ("profile_id", "user_interests", "interest_count", "split", "seed", "split_basis")
WEAK_FIELDS = (
    "judgement_id", "profile_id", "user_interests", "place_id", "poi_name", "district",
    "verified_poi_tags", "overlap_set", "interest_coverage", "weak_label", "label_provenance",
    "rule_version", "source_name", "source_url",
)
EVALUATION_FIELDS = (
    "judgement_id", "profile_id", "user_interests", "place_id", "poi_name", "district",
    "verified_poi_tags", "source_name", "source_url", "evaluation_partition",
    "reviewer_a_label", "reviewer_b_label", "final_relevance_label", "label_provenance",
    "adjudication_note",
)
EXAMPLE_FIELDS = (
    "judgement_id", "profile_id", "user_interests", "place_id", "poi_name", "district",
    "verified_poi_tags", "source_name", "source_url", "split", "example_partition",
    "weak_label", "reviewer_a_label", "reviewer_b_label", "final_relevance_label",
    "label_provenance", "rule_version", "adjudication_note",
)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fields: tuple[str, ...], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def normalized_tokens(value: str) -> tuple[str, ...]:
    return tuple(sorted({part.strip().lower() for part in value.split("|") if part.strip()}))


def validate_places(places: list[dict[str, str]]) -> None:
    if len(places) != 40:
        raise ValueError(f"Expected exactly 40 verified POIs; found {len(places)}.")
    counts = Counter(row["District"].strip() for row in places)
    if dict(counts) != EXPECTED_DISTRICTS:
        raise ValueError(f"District counts differ from {EXPECTED_DISTRICTS}: {dict(counts)}")
    ids = [row["Place_ID"].strip() for row in places]
    names = [row["Name"].strip().casefold() for row in places]
    if len(set(ids)) != 40 or len(set(names)) != 40:
        raise ValueError("Central catalogue contains duplicate IDs or canonical names.")
    coordinates: list[tuple[str, float, float]] = []
    for row in places:
        if row["Legacy_Place_ID"].strip() == "79":
            raise ValueError("Retired legacy POI 79 is forbidden.")
        if row["Verification_Status"].strip() != "source_trace_verified":
            raise ValueError(f"POI {row['Place_ID']} is not source-trace verified.")
        tags = set(normalized_tokens(row["Tags"]))
        if not tags or not tags.issubset(SUPPORTED_INTERESTS):
            raise ValueError(f"POI {row['Place_ID']} uses unsupported tags: {tags}")
        required = (
            "Place_ID", "Name", "Latitude", "Longitude", "District", "Duration_Minutes",
            "Duration_Basis", "Source_Name", "Source_URL", "Source_License", "Verification_Note",
        )
        if any(not row[field].strip() for field in required):
            raise ValueError(f"POI {row['Place_ID']} has missing runtime evidence.")
        latitude, longitude = float(row["Latitude"]), float(row["Longitude"])
        duration = float(row["Duration_Minutes"])
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180 and duration > 0):
            raise ValueError(f"POI {row['Place_ID']} has invalid coordinate or duration data.")
        coordinates.append((row["Place_ID"], latitude, longitude))
    for index, (first_id, first_lat, first_lon) in enumerate(coordinates):
        for second_id, second_lat, second_lon in coordinates[index + 1:]:
            lat1, lat2 = math.radians(first_lat), math.radians(second_lat)
            dlat = lat2 - lat1
            dlon = math.radians(second_lon - first_lon)
            value = (
                math.sin(dlat / 2) ** 2
                + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
            )
            distance_km = 6371.0 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))
            if distance_km < 0.05:
                raise ValueError(
                    f"Near-identical coordinates are forbidden: {first_id}, {second_id}."
                )


def build_profiles(v1_profiles: list[dict[str, str]]) -> list[dict[str, str]]:
    if len(v1_profiles) != 15:
        raise ValueError("The immutable v1 profile source must contain exactly 15 profiles.")
    expected_ids = [f"P{index:02d}" for index in range(1, 16)]
    if [row["profile_id"] for row in v1_profiles] != expected_ids:
        raise ValueError("The v1 profile IDs or order changed.")
    profiles = [dict(row) for row in v1_profiles]
    profiles.extend({"profile_id": profile_id, "user_interests": interests} for profile_id, interests in NEW_PROFILES)
    if len(profiles) != 20 or len({row["profile_id"] for row in profiles}) != 20:
        raise AssertionError("Version 2 must contain exactly 20 unique profiles.")
    for row in profiles:
        tokens = set(normalized_tokens(row["user_interests"]))
        if not tokens or not tokens.issubset(SUPPORTED_INTERESTS):
            raise ValueError(f"Profile {row['profile_id']} has unsupported interests.")
    coverage = Counter(token for row in profiles for token in normalized_tokens(row["user_interests"]))
    if max(coverage.values()) - min(coverage.values()) > 1:
        raise ValueError(f"Interest coverage is not balanced: {dict(coverage)}")
    return profiles


def build_split(profiles: list[dict[str, str]], v1_split: list[dict[str, str]]) -> list[dict[str, str]]:
    original_heldout = tuple(row["profile_id"] for row in v1_split if row["split"] == "heldout")
    if original_heldout != HELDOUT_IDS:
        raise ValueError(f"Frozen held-out IDs changed: {original_heldout}")
    rows = []
    for profile in profiles:
        heldout = profile["profile_id"] in HELDOUT_IDS
        rows.append({
            "profile_id": profile["profile_id"],
            "user_interests": profile["user_interests"],
            "interest_count": str(len(normalized_tokens(profile["user_interests"]))),
            "split": "heldout" if heldout else "training",
            "seed": "42",
            "split_basis": "preserved_v1_frozen_heldout" if heldout else "deterministic_training_membership_v2",
        })
    if Counter(row["split"] for row in rows) != {"training": 17, "heldout": 3}:
        raise AssertionError("Version 2 split must be 17 training and 3 held-out profiles.")
    return rows


def weak_label(interests: set[str], tags: set[str]) -> tuple[int, set[str]]:
    overlap = interests & tags
    return (0 if not overlap else 2 if overlap == interests else 1), overlap


def build_weak_rows(profiles: list[dict[str, str]], places: list[dict[str, str]]) -> list[dict[str, str]]:
    rows = []
    for profile in profiles:
        if profile["profile_id"] in HELDOUT_IDS:
            continue
        interests = set(normalized_tokens(profile["user_interests"]))
        for place in places:
            tags = set(normalized_tokens(place["Tags"]))
            label, overlap = weak_label(interests, tags)
            rows.append({
                "judgement_id": f"{profile['profile_id']}::{place['Place_ID']}",
                "profile_id": profile["profile_id"],
                "user_interests": "|".join(sorted(interests)),
                "place_id": place["Place_ID"],
                "poi_name": place["Name"],
                "district": place["District"],
                "verified_poi_tags": "|".join(sorted(tags)),
                "overlap_set": "|".join(sorted(overlap)),
                "interest_coverage": f"{len(overlap) / len(interests):.6f}",
                "weak_label": str(label),
                "label_provenance": "rule_derived_weak_supervision_not_human",
                "rule_version": RULE_VERSION,
                "source_name": place["Source_Name"],
                "source_url": place["Source_URL"],
            })
    if len(rows) != 680 or len({row["judgement_id"] for row in rows}) != 680:
        raise AssertionError("Training construction must produce 680 unique weak-labelled rows.")
    return rows


def build_evaluation_rows(
    profiles: list[dict[str, str]], places: list[dict[str, str]], human_reference: list[dict[str, str]]
) -> list[dict[str, str]]:
    profile_by_id = {row["profile_id"]: row for row in profiles}
    place_by_id = {row["Place_ID"]: row for row in places}
    reference_by_id = {row["judgement_id"]: row for row in human_reference}
    if len(reference_by_id) != 60:
        raise ValueError("The frozen Kandy human reference must contain 60 unique judgements.")
    rows = []
    for profile_id in HELDOUT_IDS:
        profile = profile_by_id[profile_id]
        for place in places:
            judgement_id = f"{profile_id}::{place['Place_ID']}"
            reference = reference_by_id.get(judgement_id)
            if place["District"] == "Kandy":
                if reference is None:
                    raise ValueError(f"Missing frozen human reference for {judgement_id}.")
                reviewer_a = reference["reviewer_a_label"]
                reviewer_b = reference["reviewer_b_label"]
                final_label = reference["final_relevance_label"]
                provenance = f"development_reference_{reference['decision_type']}"
                note = reference["adjudication_note"]
                partition = "development_reference_kandy_v1"
            else:
                reviewer_a = reviewer_b = final_label = ""
                provenance = "pending_blind_independent_human_review"
                note = ""
                partition = "blinded_cross_district_extension_v2"
            rows.append({
                "judgement_id": judgement_id,
                "profile_id": profile_id,
                "user_interests": profile["user_interests"],
                "place_id": place["Place_ID"],
                "poi_name": place["Name"],
                "district": place["District"],
                "verified_poi_tags": place["Tags"],
                "source_name": place["Source_Name"],
                "source_url": place["Source_URL"],
                "evaluation_partition": partition,
                "reviewer_a_label": reviewer_a,
                "reviewer_b_label": reviewer_b,
                "final_relevance_label": final_label,
                "label_provenance": provenance,
                "adjudication_note": note,
            })
    if len(rows) != 120 or len({row["judgement_id"] for row in rows}) != 120:
        raise AssertionError("Evaluation construction must produce 120 unique rows.")
    new_rows = [row for row in rows if row["evaluation_partition"].startswith("blinded_")]
    if len(new_rows) != 60 or any(
        row[field] for row in new_rows
        for field in ("reviewer_a_label", "reviewer_b_label", "final_relevance_label")
    ):
        raise AssertionError("Exactly 60 new cross-district evaluation rows must remain blank.")
    return rows


def build_examples(weak_rows: list[dict[str, str]], evaluation_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    rows = []
    for row in weak_rows:
        rows.append({
            **{field: row.get(field, "") for field in EXAMPLE_FIELDS},
            "split": "training",
            "example_partition": "rule_derived_weak_training_v2",
            "reviewer_a_label": "",
            "reviewer_b_label": "",
            "final_relevance_label": "",
            "adjudication_note": "",
        })
    for row in evaluation_rows:
        rows.append({
            **{field: row.get(field, "") for field in EXAMPLE_FIELDS},
            "split": "heldout",
            "example_partition": row["evaluation_partition"],
            "weak_label": "",
            "rule_version": "",
        })
    if len(rows) != 800 or len({row["judgement_id"] for row in rows}) != 800:
        raise AssertionError("Combined v2 manifest must contain exactly 800 unique profile-POI examples.")
    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profiles-v1", type=Path, default=V1_PROFILES_PATH)
    parser.add_argument("--split-v1", type=Path, default=V1_SPLIT_PATH)
    parser.add_argument("--places", type=Path, default=PLACES_PATH)
    parser.add_argument("--human-reference", type=Path, default=HUMAN_REFERENCE_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    places = read_csv(args.places)
    validate_places(places)
    profiles = build_profiles(read_csv(args.profiles_v1))
    split = build_split(profiles, read_csv(args.split_v1))
    weak_rows = build_weak_rows(profiles, places)
    evaluation_rows = build_evaluation_rows(profiles, places, read_csv(args.human_reference))
    examples = build_examples(weak_rows, evaluation_rows)
    write_csv(PROFILES_OUT, PROFILE_FIELDS, profiles)
    write_csv(SPLIT_OUT, SPLIT_FIELDS, split)
    write_csv(WEAK_OUT, WEAK_FIELDS, weak_rows)
    write_csv(EVALUATION_OUT, EVALUATION_FIELDS, evaluation_rows)
    write_csv(EXAMPLES_OUT, EXAMPLE_FIELDS, examples)
    print(f"Verified POIs: {dict(Counter(row['District'] for row in places))}")
    print("Profiles: 20 (17 training, 3 preserved held-out)")
    print(f"Weak-supervision training rows: {len(weak_rows)}")
    print("Evaluation rows: 120 (60 preserved human labels, 60 blank extension rows)")
    print(f"Combined profile-POI examples: {len(examples)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
