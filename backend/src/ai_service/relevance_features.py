"""Shared leakage-safe user-interest/POI-tag feature construction.

The transformer is deliberately limited to information available before a
relevance decision: normalized user interests and verified POI tags. Stable
identifiers, labels, reviewer fields, row order, distance, and route state are
never accepted as model inputs.
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin


SUPPORTED_INTERESTS = (
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
    "adjudication_note",
    "decision_type",
    "final_adjudicated_label",
    "final_relevance_label",
    "interest_coverage",
    "judgement_id",
    "overlap_set",
    "place_id",
    "profile_id",
    "reviewer_a_label",
    "reviewer_b_label",
    "row_order",
    "weak_label",
)


def normalize_tokens(value) -> tuple[str, ...]:
    """Return stable lowercase tokens from pipe-delimited or iterable input."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ()
    raw_values: Iterable
    if isinstance(value, str):
        raw_values = value.split("|")
    elif isinstance(value, Iterable):
        raw_values = value
    else:
        raw_values = (value,)
    return tuple(
        sorted(
            {
                str(token).strip().lower()
                for token in raw_values
                if str(token).strip()
            }
        )
    )


def make_pair_frame(user_interests, poi_tags) -> pd.DataFrame:
    """Construct the exact two-column runtime/training input contract."""
    if isinstance(poi_tags, str):
        poi_tags = [poi_tags]
    tags = list(poi_tags)
    normalized_interests = "|".join(normalize_tokens(user_interests))
    return pd.DataFrame(
        {
            "user_interests": [normalized_interests] * len(tags),
            "verified_poi_tags": [
                "|".join(normalize_tokens(value)) for value in tags
            ],
        }
    )


class RelevancePairFeatures(BaseEstimator, TransformerMixin):
    """Convert raw interest/tag pairs into transparent interaction features.

    Per-category user flags, POI-tag flags, and their pairwise intersections are
    justified semantic inputs because relevance is specifically the relationship
    between declared interests and verified tags. The transformer intentionally
    omits the precomputed weak-label fields ``overlap_set`` and
    ``interest_coverage``; it exposes raw category interactions rather than the
    final rule output.
    """

    def fit(self, X, y=None):
        frame = self._validated_frame(X)
        self.n_features_in_ = len(REQUIRED_INPUT_COLUMNS)
        self.feature_names_in_ = np.asarray(REQUIRED_INPUT_COLUMNS, dtype=object)
        self.seen_row_count_ = len(frame)
        return self

    def transform(self, X):
        frame = self._validated_frame(X)
        rows = []
        for _, row in frame.iterrows():
            interests = set(normalize_tokens(row["user_interests"]))
            tags = set(normalize_tokens(row["verified_poi_tags"]))
            feature_row = []
            for category in SUPPORTED_INTERESTS:
                feature_row.append(float(category in interests))
            for category in SUPPORTED_INTERESTS:
                feature_row.append(float(category in tags))
            for category in SUPPORTED_INTERESTS:
                feature_row.append(float(category in interests and category in tags))
            feature_row.extend((float(len(interests)), float(len(tags))))
            rows.append(feature_row)
        return np.asarray(rows, dtype=np.float64)

    def get_feature_names_out(self, input_features=None):
        names = [f"user_has_{category}" for category in SUPPORTED_INTERESTS]
        names.extend(f"poi_has_{category}" for category in SUPPORTED_INTERESTS)
        names.extend(f"pair_matches_{category}" for category in SUPPORTED_INTERESTS)
        names.extend(("user_interest_count", "poi_tag_count"))
        return np.asarray(names, dtype=object)

    @staticmethod
    def _validated_frame(X) -> pd.DataFrame:
        if not isinstance(X, pd.DataFrame):
            X = pd.DataFrame(X, columns=REQUIRED_INPUT_COLUMNS)
        missing = set(REQUIRED_INPUT_COLUMNS) - set(X.columns)
        if missing:
            raise ValueError(f"Missing relevance input columns: {sorted(missing)}")
        return X.loc[:, REQUIRED_INPUT_COLUMNS].copy()
