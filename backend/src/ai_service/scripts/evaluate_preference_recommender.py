"""Evaluate Kandy preference ranking only from human-adjudicated judgements.

Ranking and pointwise metrics are distinct. Pointwise thresholds are tuned only
on training profile groups within each outer fold, then applied to held-out
profiles. This script reports comparisons but never selects or deploys a method.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import random
import statistics
import sys
import time


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = AI_SERVICE_DIR / "data"
PROFILES_PATH = DATA_DIR / "evaluation" / "kandy_preference_profiles_v1.csv"
PLACES_PATH = DATA_DIR / "verified" / "kandy_runtime_verified_v1.csv"
EXPECTED_PROFILES = 15
EXPECTED_PLACES = 20
EXPECTED_ROWS = 300
TOP_K = 5
FOLD_COUNT = 5
RANDOM_SEED = 42
KANDY_START_LATITUDE = 7.2906
KANDY_START_LONGITUDE = 80.6337
CURRENT_PROXIMITY_WEIGHT = 0.70
CURRENT_SIMILARITY_WEIGHT = 0.30
ALLOWED_LABELS = {"0", "1", "2"}
VALIDATED_FIELDS = (
    "judgement_id",
    "profile_id",
    "user_interests",
    "place_id",
    "poi_name",
    "source_name",
    "source_url",
    "reviewer_a_label",
    "reviewer_b_label",
    "final_relevance_label",
    "label_source",
)


class EvaluationBlockedError(ValueError):
    """A controlled fail-closed condition that prevents metric reporting."""


def read_csv(path: Path) -> tuple[tuple[str, ...], list[dict[str, str]]]:
    if not path.exists():
        raise EvaluationBlockedError(f"Required file does not exist: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        header = tuple(reader.fieldnames or ())
        rows = []
        for row_number, row in enumerate(reader, start=2):
            if None in row:
                raise EvaluationBlockedError(
                    f"Malformed CSV row {row_number} in {path}: unexpected extra values."
                )
            rows.append({key: (value or "").strip() for key, value in row.items()})
    return header, rows


def validate_adjudicated_rows(
    path: Path,
    profiles_path: Path = PROFILES_PATH,
    places_path: Path = PLACES_PATH,
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    header, rows = read_csv(path)
    if header != VALIDATED_FIELDS:
        raise EvaluationBlockedError(
            "Input is not validator-produced adjudicated data; expected columns "
            f"{VALIDATED_FIELDS}, found {header}."
        )
    if len(rows) != EXPECTED_ROWS:
        raise EvaluationBlockedError(
            f"Adjudicated input must contain exactly {EXPECTED_ROWS} rows; found {len(rows)}."
        )
    identifiers = [row["judgement_id"] for row in rows]
    if len(set(identifiers)) != EXPECTED_ROWS or any(not value for value in identifiers):
        raise EvaluationBlockedError("Judgement IDs must be exactly 300 nonblank unique values.")
    for row in rows:
        for field in ("reviewer_a_label", "reviewer_b_label", "final_relevance_label"):
            if not row[field]:
                raise EvaluationBlockedError(
                    f"Blank {field} for {row['judgement_id']}; blanks are never treated as zero."
                )
            if row[field] not in ALLOWED_LABELS:
                raise EvaluationBlockedError(
                    f"Invalid {field} for {row['judgement_id']}: {row[field]!r}."
                )
        reviewers_agree = row["reviewer_a_label"] == row["reviewer_b_label"]
        expected_source = "reviewer_consensus" if reviewers_agree else "human_adjudication"
        if row["label_source"] != expected_source:
            raise EvaluationBlockedError(
                f"Invalid label_source for {row['judgement_id']}; expected {expected_source}."
            )
        if reviewers_agree and row["final_relevance_label"] != row["reviewer_a_label"]:
            raise EvaluationBlockedError(
                f"Consensus label was altered for {row['judgement_id']}."
            )

    _, profiles = read_csv(profiles_path)
    _, places = read_csv(places_path)
    if len(profiles) != EXPECTED_PROFILES or len(places) != EXPECTED_PLACES:
        raise EvaluationBlockedError("Expected exactly 15 profiles and 20 verified POIs.")
    expected = {
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
    if set(identifiers) != set(expected):
        missing = sorted(set(expected) - set(identifiers))
        extra = sorted(set(identifiers) - set(expected))
        raise EvaluationBlockedError(
            f"Judgement coverage differs from the exhaustive 15x20 grid. "
            f"Missing: {missing[:5]}; extra: {extra[:5]}."
        )
    evidence_fields = (
        "profile_id",
        "user_interests",
        "place_id",
        "poi_name",
        "source_name",
        "source_url",
    )
    for row in rows:
        expected_values = expected[row["judgement_id"]]
        if tuple(row[field] for field in evidence_fields) != expected_values:
            raise EvaluationBlockedError(
                f"Profile/POI evidence changed for {row['judgement_id']}."
            )
    return rows, profiles, places


def split_tags(value: str) -> set[str]:
    return {part.strip().lower() for part in value.split("|") if part.strip()}


def binary_cosine(query: set[str], document: set[str]) -> float:
    if not query or not document:
        return 0.0
    return len(query & document) / math.sqrt(len(query) * len(document))


def jaccard_similarity(query: set[str], document: set[str]) -> float:
    union = query | document
    return len(query & document) / len(union) if union else 0.0


def make_idf(place_tags: list[set[str]]) -> dict[str, float]:
    document_count = len(place_tags)
    document_frequency = Counter(tag for tags in place_tags for tag in tags)
    vocabulary = set(document_frequency)
    return {
        tag: math.log((document_count + 1) / (document_frequency[tag] + 1)) + 1.0
        for tag in vocabulary
    }


def tfidf_cosine(query: set[str], document: set[str], idf: dict[str, float]) -> float:
    query_weights = {tag: idf.get(tag, 0.0) for tag in query if tag in idf}
    document_weights = {tag: idf[tag] for tag in document if tag in idf}
    numerator = sum(query_weights.get(tag, 0.0) * weight for tag, weight in document_weights.items())
    query_norm = math.sqrt(sum(weight * weight for weight in query_weights.values()))
    document_norm = math.sqrt(sum(weight * weight for weight in document_weights.values()))
    return numerator / (query_norm * document_norm) if query_norm and document_norm else 0.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(
        math.radians, (lat1, lon1, lat2, lon2)
    )
    delta_lat = lat2_rad - lat1_rad
    delta_lon = lon2_rad - lon1_rad
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def score_methods(
    profiles: list[dict[str, str]], places: list[dict[str, str]]
) -> dict[str, dict[str, dict[str, float]]]:
    tags_by_place = {place["Place_ID"]: split_tags(place["Tags"]) for place in places}
    idf = make_idf(list(tags_by_place.values()))
    distances = {
        place["Place_ID"]: haversine_km(
            KANDY_START_LATITUDE,
            KANDY_START_LONGITUDE,
            float(place["Latitude"]),
            float(place["Longitude"]),
        )
        for place in places
    }
    safe_max_distance = max(max(distances.values()), 0.1)
    proximity = {
        identifier: 1.0 - distance / safe_max_distance
        for identifier, distance in distances.items()
    }
    methods: dict[str, dict[str, dict[str, float]]] = {
        "binary_tag_cosine": {},
        "jaccard_tag_overlap": {},
        "tfidf_cosine": {},
        "proximity_only_baseline": {},
        "current_70_proximity_30_similarity": {},
    }
    for profile in profiles:
        profile_id = profile["profile_id"]
        query = split_tags(profile["user_interests"])
        cosine_scores = {
            place_id: binary_cosine(query, tags) for place_id, tags in tags_by_place.items()
        }
        methods["binary_tag_cosine"][profile_id] = cosine_scores
        methods["jaccard_tag_overlap"][profile_id] = {
            place_id: jaccard_similarity(query, tags)
            for place_id, tags in tags_by_place.items()
        }
        methods["tfidf_cosine"][profile_id] = {
            place_id: tfidf_cosine(query, tags, idf)
            for place_id, tags in tags_by_place.items()
        }
        methods["proximity_only_baseline"][profile_id] = dict(proximity)
        methods["current_70_proximity_30_similarity"][profile_id] = {
            place_id: CURRENT_PROXIMITY_WEIGHT * proximity[place_id]
            + CURRENT_SIMILARITY_WEIGHT * cosine_scores[place_id]
            for place_id in tags_by_place
        }
    return methods


def rank_scores(scores: dict[str, float]) -> list[tuple[str, float]]:
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


def ranking_metrics(ranked_labels: list[int], k: int = TOP_K) -> dict[str, float]:
    top_labels = ranked_labels[:k]
    binary_top = [int(label > 0) for label in top_labels]
    total_relevant = sum(label > 0 for label in ranked_labels)
    precision = sum(binary_top) / k
    recall = sum(binary_top) / total_relevant if total_relevant else 0.0
    hit_rate = float(any(binary_top))
    dcg = sum((2**label - 1) / math.log2(rank + 2) for rank, label in enumerate(top_labels))
    ideal = sorted(ranked_labels, reverse=True)[:k]
    idcg = sum((2**label - 1) / math.log2(rank + 2) for rank, label in enumerate(ideal))
    return {
        "precision_at_5": precision,
        "recall_at_5": recall,
        "hit_rate_at_5": hit_rate,
        "ndcg_at_5": dcg / idcg if idcg else 0.0,
    }


def safe_divide(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def pointwise_metrics(labels: list[int], predictions: list[int]) -> dict[str, object]:
    tn = sum(label == 0 and prediction == 0 for label, prediction in zip(labels, predictions))
    fp = sum(label == 0 and prediction == 1 for label, prediction in zip(labels, predictions))
    fn = sum(label == 1 and prediction == 0 for label, prediction in zip(labels, predictions))
    tp = sum(label == 1 and prediction == 1 for label, prediction in zip(labels, predictions))
    accuracy = safe_divide(tp + tn, len(labels))
    true_positive_rate = safe_divide(tp, tp + fn)
    true_negative_rate = safe_divide(tn, tn + fp)
    f1_relevant = safe_divide(2 * tp, 2 * tp + fp + fn)
    f1_irrelevant = safe_divide(2 * tn, 2 * tn + fp + fn)
    return {
        "accuracy": accuracy,
        "balanced_accuracy": (true_positive_rate + true_negative_rate) / 2,
        "macro_f1": (f1_relevant + f1_irrelevant) / 2,
        "confusion_matrix": [[tn, fp], [fn, tp]],
    }


def threshold_candidates(scores: list[float]) -> list[float]:
    unique = sorted(set(scores))
    if not unique:
        return [0.0]
    epsilon = 1e-12
    return [unique[0] - epsilon, *unique, unique[-1] + epsilon]


def tune_threshold(labels: list[int], scores: list[float]) -> tuple[float, dict[str, object]]:
    best_threshold = 0.0
    best_metrics: dict[str, object] | None = None
    best_key: tuple[float, float, float, float] | None = None
    for threshold in threshold_candidates(scores):
        predictions = [int(score >= threshold) for score in scores]
        metrics = pointwise_metrics(labels, predictions)
        key = (
            float(metrics["balanced_accuracy"]),
            float(metrics["macro_f1"]),
            float(metrics["accuracy"]),
            -threshold,
        )
        if best_key is None or key > best_key:
            best_key = key
            best_threshold = threshold
            best_metrics = metrics
    assert best_metrics is not None
    return best_threshold, best_metrics


def mean_and_variability(values: list[float]) -> dict[str, float]:
    return {
        "mean": statistics.fmean(values),
        "population_standard_deviation": statistics.pstdev(values) if len(values) > 1 else 0.0,
    }


def grouped_profile_folds(profile_ids: list[str]) -> list[list[str]]:
    shuffled = sorted(profile_ids)
    random.Random(RANDOM_SEED).shuffle(shuffled)
    return [shuffled[index::FOLD_COUNT] for index in range(FOLD_COUNT)]


def agreement_statistics(rows: list[dict[str, str]]) -> dict[str, float]:
    total = len(rows)
    matches = sum(row["reviewer_a_label"] == row["reviewer_b_label"] for row in rows)
    counts_a = Counter(row["reviewer_a_label"] for row in rows)
    counts_b = Counter(row["reviewer_b_label"] for row in rows)
    observed = matches / total
    expected = sum((counts_a[label] / total) * (counts_b[label] / total) for label in ALLOWED_LABELS)
    kappa = 1.0 if observed == expected == 1.0 else (observed - expected) / (1 - expected)
    return {"exact_agreement_percent": observed * 100.0, "cohens_kappa": kappa}


def evaluate(
    rows: list[dict[str, str]],
    profiles: list[dict[str, str]],
    places: list[dict[str, str]],
) -> dict[str, object]:
    started = time.perf_counter()
    labels = {
        (row["profile_id"], row["place_id"]): int(row["final_relevance_label"])
        for row in rows
    }
    scores_by_method = score_methods(profiles, places)
    profile_ids = [profile["profile_id"] for profile in profiles]
    place_ids = [place["Place_ID"] for place in places]
    folds = grouped_profile_folds(profile_ids)
    method_results: dict[str, object] = {}

    for method_name, profile_scores in scores_by_method.items():
        per_profile: dict[str, dict[str, float]] = {}
        ranking_table: dict[str, list[dict[str, object]]] = {}
        for profile_id in profile_ids:
            ranked = rank_scores(profile_scores[profile_id])
            ranked_labels = [labels[(profile_id, place_id)] for place_id, _ in ranked]
            per_profile[profile_id] = ranking_metrics(ranked_labels)
            ranking_table[profile_id] = [
                {
                    "rank": rank,
                    "place_id": place_id,
                    "score": score,
                    "adjudicated_relevance": labels[(profile_id, place_id)],
                }
                for rank, (place_id, score) in enumerate(ranked, start=1)
            ]

        ranking_macro = {
            metric: mean_and_variability([values[metric] for values in per_profile.values()])
            for metric in ("precision_at_5", "recall_at_5", "hit_rate_at_5", "ndcg_at_5")
        }

        fold_results: list[dict[str, object]] = []
        out_of_fold_labels: list[int] = []
        out_of_fold_predictions: list[int] = []
        for fold_index, held_out_profiles in enumerate(folds, start=1):
            training_profiles = [profile for profile in profile_ids if profile not in held_out_profiles]
            train_labels = [
                int(labels[(profile, place_id)] > 0)
                for profile in training_profiles
                for place_id in place_ids
            ]
            train_scores = [
                profile_scores[profile][place_id]
                for profile in training_profiles
                for place_id in place_ids
            ]
            threshold, tuning_metrics = tune_threshold(train_labels, train_scores)
            held_labels = [
                int(labels[(profile, place_id)] > 0)
                for profile in held_out_profiles
                for place_id in place_ids
            ]
            held_scores = [
                profile_scores[profile][place_id]
                for profile in held_out_profiles
                for place_id in place_ids
            ]
            held_predictions = [int(score >= threshold) for score in held_scores]
            held_metrics = pointwise_metrics(held_labels, held_predictions)
            out_of_fold_labels.extend(held_labels)
            out_of_fold_predictions.extend(held_predictions)
            fold_results.append(
                {
                    "fold": fold_index,
                    "training_profiles": training_profiles,
                    "held_out_profiles": held_out_profiles,
                    "tuned_threshold": threshold,
                    "tuning_profile_metrics": tuning_metrics,
                    "held_out_profile_metrics": held_metrics,
                    "generalization_gaps_tuning_minus_held_out": {
                        metric: float(tuning_metrics[metric]) - float(held_metrics[metric])
                        for metric in ("accuracy", "balanced_accuracy", "macro_f1")
                    },
                }
            )

        pointwise_oof = pointwise_metrics(out_of_fold_labels, out_of_fold_predictions)
        per_profile_pointwise: dict[str, dict[str, object]] = {}
        for fold in fold_results:
            threshold = float(fold["tuned_threshold"])
            for profile_id in fold["held_out_profiles"]:
                profile_labels = [
                    int(labels[(profile_id, place_id)] > 0) for place_id in place_ids
                ]
                profile_predictions = [
                    int(profile_scores[profile_id][place_id] >= threshold)
                    for place_id in place_ids
                ]
                per_profile_pointwise[profile_id] = pointwise_metrics(
                    profile_labels, profile_predictions
                )
        fold_variability = {
            metric: mean_and_variability(
                [float(fold["held_out_profile_metrics"][metric]) for fold in fold_results]
            )
            for metric in ("accuracy", "balanced_accuracy", "macro_f1")
        }
        method_results[method_name] = {
            "method_role": (
                "geographic baseline, not a preference model"
                if method_name == "proximity_only_baseline"
                else "preference recommender comparison"
            ),
            "per_profile_ranking_metrics": per_profile,
            "ranking_macro_means_and_variability": ranking_macro,
            "ranking_tables": ranking_table,
            "profile_grouped_pointwise_folds": fold_results,
            "per_profile_out_of_fold_pointwise_metrics": per_profile_pointwise,
            "out_of_fold_pointwise_metrics": pointwise_oof,
            "held_out_fold_means_and_variability": fold_variability,
        }

    class_counts = Counter(row["final_relevance_label"] for row in rows)
    binary_counts = Counter("relevant" if int(row["final_relevance_label"]) > 0 else "irrelevant" for row in rows)
    return {
        "evaluation_status": "completed_from_validated_human_adjudication",
        "candidate_scope": "20 source-traced Kandy POIs for every profile",
        "ranking_metric_note": "Ranking metrics are not ordinary classifier accuracy.",
        "pointwise_label_rule": "Human labels 1 and 2 are relevant; label 0 is irrelevant.",
        "fixed_start_coordinate": {
            "description": "Kandy city reference coordinate used by the existing runtime default",
            "latitude": KANDY_START_LATITUDE,
            "longitude": KANDY_START_LONGITUDE,
        },
        "fold_strategy": {
            "type": "5-fold outer split grouped by profile_id",
            "random_seed": RANDOM_SEED,
            "threshold_tuning": "training profiles only; evaluated on held-out profiles",
            "weight_tuning": "none; current composite remains fixed at 0.70 proximity / 0.30 similarity",
            "folds": folds,
        },
        "reviewer_agreement": agreement_statistics(rows),
        "class_distribution": {
            "graded_labels": dict(sorted(class_counts.items())),
            "binary_labels": dict(sorted(binary_counts.items())),
        },
        "methods": method_results,
        "execution_time_seconds": time.perf_counter() - started,
        "deployment_action": "none",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare five Kandy recommender methods using only complete validator-produced "
            "human-adjudicated judgements. Prints JSON; never changes runtime weights."
        )
    )
    parser.add_argument(
        "--judgements",
        type=Path,
        required=True,
        help="Validated adjudicated CSV produced by validate_relevance_reviews.py.",
    )
    parser.add_argument("--profiles", type=Path, default=PROFILES_PATH)
    parser.add_argument("--places", type=Path, default=PLACES_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        rows, profiles, places = validate_adjudicated_rows(
            args.judgements, args.profiles, args.places
        )
        print(json.dumps(evaluate(rows, profiles, places), indent=2, sort_keys=True))
        return 0
    except EvaluationBlockedError as error:
        print(f"EVALUATION BLOCKED: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
