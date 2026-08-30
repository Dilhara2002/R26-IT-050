"""Leakage-safe deterministic features for the frozen v2 relevance candidate."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin


CATEGORIES = (
    "adventure",
    "city",
    "culture",
    "history",
    "nature",
    "religion",
    "wildlife",
)
REQUIRED_INPUT_COLUMNS = ("user_interests", "verified_poi_tags")
EXCLUDED_LEAKAGE_FIELDS = (
    "weak_label",
    "reviewer_a_label",
    "reviewer_b_label",
    "final_relevance_label",
    "label_provenance",
    "adjudication_note",
    "judgement_id",
    "profile_id",
    "place_id",
    "poi_name",
    "district",
    "source_name",
    "source_url",
    "overlap_set",
    "interest_coverage",
    "rule_version",
)


def _tokens(value: object) -> frozenset[str]:
    if not isinstance(value, str):
        raise ValueError("Interest and tag values must be strings.")
    tokens = frozenset(part.strip().lower() for part in value.split("|") if part.strip())
    if not tokens or not tokens.issubset(CATEGORIES):
        raise ValueError(f"Unsupported or empty category set: {sorted(tokens)}")
    return tokens


def feature_names() -> tuple[str, ...]:
    names = [*(f"interest_{name}" for name in CATEGORIES)]
    names.extend(f"tag_{name}" for name in CATEGORIES)
    names.extend(
        f"interaction_interest_{interest}__tag_{tag}"
        for interest in CATEGORIES
        for tag in CATEGORIES
    )
    names.extend(
        (
            "interest_count",
            "tag_count",
            "overlap_count",
            "user_interest_coverage_ratio",
            "poi_tag_coverage_ratio",
            "has_any_overlap",
            "all_user_interests_covered",
            "all_poi_tags_covered",
            "has_multiple_overlaps",
        )
    )
    return tuple(names)


FEATURE_NAMES = feature_names()


class RelevancePairFeaturesV2(BaseEstimator, TransformerMixin):
    """Convert interest/tag pairs into a fixed numeric feature contract."""

    def fit(self, frame: pd.DataFrame, y=None):
        self._validate_frame(frame)
        self.seen_row_count_ = len(frame)
        self.feature_names_in_ = np.asarray(REQUIRED_INPUT_COLUMNS, dtype=object)
        return self

    def transform(self, frame: pd.DataFrame) -> np.ndarray:
        self._validate_frame(frame)
        output: list[list[float]] = []
        for row in frame.loc[:, REQUIRED_INPUT_COLUMNS].itertuples(index=False, name=None):
            interests = _tokens(row[0])
            tags = _tokens(row[1])
            overlap = interests & tags
            values: list[float] = [float(name in interests) for name in CATEGORIES]
            values.extend(float(name in tags) for name in CATEGORIES)
            values.extend(
                float(interest in interests and tag in tags)
                for interest in CATEGORIES
                for tag in CATEGORIES
            )
            interest_count = len(interests)
            tag_count = len(tags)
            overlap_count = len(overlap)
            values.extend(
                (
                    float(interest_count),
                    float(tag_count),
                    float(overlap_count),
                    overlap_count / interest_count,
                    overlap_count / tag_count,
                    float(overlap_count > 0),
                    float(overlap_count == interest_count),
                    float(overlap_count == tag_count),
                    float(overlap_count >= 2),
                )
            )
            output.append(values)
        return np.asarray(output, dtype=np.float64)

    def get_feature_names_out(self, input_features=None) -> np.ndarray:
        return np.asarray(FEATURE_NAMES, dtype=object)

    @staticmethod
    def _validate_frame(frame: pd.DataFrame) -> None:
        if not isinstance(frame, pd.DataFrame):
            raise TypeError("RelevancePairFeaturesV2 requires a pandas DataFrame.")
        missing = set(REQUIRED_INPUT_COLUMNS) - set(frame.columns)
        if missing:
            raise ValueError(f"Missing prediction inputs: {sorted(missing)}")


def make_pair_frame(user_interests, poi_tags) -> pd.DataFrame:
    """Build prediction inputs without accepting IDs, provenance, or labels."""
    interests = [user_interests] if isinstance(user_interests, str) else list(user_interests)
    tags = [poi_tags] if isinstance(poi_tags, str) else list(poi_tags)
    if len(interests) == 1 and len(tags) > 1:
        interests *= len(tags)
    if len(interests) != len(tags):
        raise ValueError("Interest and POI-tag inputs must have compatible lengths.")
    return pd.DataFrame({"user_interests": interests, "verified_poi_tags": tags})
