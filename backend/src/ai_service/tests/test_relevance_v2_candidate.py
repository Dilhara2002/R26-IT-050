import json
from pathlib import Path
import sys
import unittest
from unittest import mock

import joblib
import numpy as np
import pandas as pd


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = AI_SERVICE_DIR / "scripts"
for path in (AI_SERVICE_DIR, SCRIPTS_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import model
from relevance_features_v2 import (
    EXCLUDED_LEAKAGE_FIELDS,
    FEATURE_NAMES,
    RelevancePairFeaturesV2,
    make_pair_frame,
)
import train_relevance_model_v2_candidate as trainer


ARTIFACT = AI_SERVICE_DIR / "models" / "user_poi_relevance_v2_candidate.joblib"
METADATA = ARTIFACT.with_suffix(".metadata.json")
METRICS = AI_SERVICE_DIR / "data" / "evaluation" / "user_poi_relevance_v2_weak_cv_metrics.json"
V1_ARTIFACT = AI_SERVICE_DIR / "models" / "user_poi_relevance_v1.joblib"


class V2TrainingIsolationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frame, cls.split, cls.training_ids, cls.excluded_ids = trainer.load_training_data()

    def test_exact_680_rows_from_17_training_profiles(self):
        self.assertEqual(len(self.frame), 680)
        self.assertEqual(self.frame["profile_id"].nunique(), 17)
        self.assertEqual(self.frame.groupby("profile_id").size().unique().tolist(), [40])
        self.assertEqual(len(self.training_ids), 17)
        self.assertEqual(len(self.excluded_ids), 3)
        self.assertTrue(set(self.training_ids).isdisjoint(self.excluded_ids))

    def test_every_grouped_fold_has_strict_profile_separation(self):
        for train_indices, validation_indices in trainer.grouped_splits(self.frame):
            train_profiles = set(self.frame.iloc[train_indices]["profile_id"])
            validation_profiles = set(self.frame.iloc[validation_indices]["profile_id"])
            self.assertTrue(train_profiles.isdisjoint(validation_profiles))

    def test_training_loader_never_reads_evaluation_grid_or_workbooks(self):
        original = pd.read_csv
        paths = []

        def recording_read_csv(path, *args, **kwargs):
            paths.append(Path(path).name)
            return original(path, *args, **kwargs)

        with mock.patch.object(trainer.pd, "read_csv", side_effect=recording_read_csv):
            trainer.load_training_data()
        self.assertEqual(
            paths,
            ["rule_derived_weak_training_labels_v2.csv", "central_province_profile_split_v2.csv"],
        )
        self.assertFalse(any("evaluation_grid" in name or name.endswith(".xlsx") for name in paths))

    def test_features_are_deterministic_and_exclude_leakage_fields(self):
        base = make_pair_frame(["Nature|City"], ["Nature|Culture"])
        leaked = base.assign(
            weak_label=2,
            profile_id="P99",
            place_id="forbidden",
            district="Kandy",
            reviewer_a_label=0,
            source_url="https://example.invalid",
        )
        transformer = RelevancePairFeaturesV2().fit(base)
        first = transformer.transform(base)
        second = transformer.transform(leaked)
        np.testing.assert_array_equal(first, second)
        self.assertEqual(first.shape, (1, 72))
        self.assertEqual(len(FEATURE_NAMES), 72)
        self.assertTrue(set(EXCLUDED_LEAKAGE_FIELDS).isdisjoint(FEATURE_NAMES))

    def test_grouped_cv_is_repeatable_for_fixed_seed(self):
        X = self.frame.loc[:, trainer.REQUIRED_INPUT_COLUMNS]
        y = self.frame["weak_label"].astype(int)
        splits = trainer.grouped_splits(self.frame)
        template = trainer.candidate_specs()["Linear SVM"]["pipeline"]
        params = {"classifier__C": 0.1, "classifier__class_weight": None}
        first = trainer.evaluate_configuration(template, params, X, y, splits)
        second = trainer.evaluate_configuration(template, params, X, y, splits)
        np.testing.assert_array_equal(first["oof_predictions"], second["oof_predictions"])
        self.assertEqual(
            trainer.json_safe(first["cv"]),
            trainer.json_safe(second["cv"]),
        )


class V2FrozenCandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.metadata = json.loads(METADATA.read_text(encoding="utf-8"))
        cls.metrics = json.loads(METRICS.read_text(encoding="utf-8"))
        cls.pipeline = joblib.load(ARTIFACT)

    def test_rf_and_svm_were_both_compared_fairly(self):
        self.assertIn("Random Forest", self.metrics["models"])
        self.assertIn("Linear SVM", self.metrics["models"])
        self.assertTrue(self.metrics["models"]["Random Forest"]["deployment_eligible"])
        self.assertTrue(self.metrics["models"]["Linear SVM"]["deployment_eligible"])
        self.assertGreater(self.metrics["models"]["Random Forest"]["grid_size"], 1)
        self.assertGreater(self.metrics["models"]["Linear SVM"]["grid_size"], 1)

    def test_candidate_loads_predicts_valid_classes_and_scores(self):
        rows = make_pair_frame(
            ["Nature", "History|Culture", "Adventure"],
            ["Religion", "History", "Adventure|Nature"],
        )
        predictions = self.pipeline.predict(rows)
        scores = self.pipeline.decision_function(rows)
        self.assertTrue(set(map(int, predictions)).issubset({0, 1, 2}))
        self.assertEqual(scores.shape, (3, 3))
        self.assertTrue(np.isfinite(scores).all())
        self.assertEqual(list(map(int, self.pipeline.classes_)), [0, 1, 2])

    def test_candidate_fit_count_and_metadata_are_frozen(self):
        self.assertEqual(self.pipeline.named_steps["features"].seen_row_count_, 680)
        self.assertEqual(self.metadata["training_row_count"], 680)
        self.assertEqual(len(self.metadata["training_profile_ids"]), 17)
        self.assertEqual(len(self.metadata["excluded_evaluation_profile_ids"]), 3)
        self.assertFalse(self.metadata["evaluation_data_accessed"])
        self.assertFalse(self.metadata["runtime_activated"])

    def test_v1_runtime_artifact_remains_active_and_unchanged(self):
        self.assertEqual(model.RELEVANCE_MODEL_PATH.resolve(), V1_ARTIFACT.resolve())
        self.assertEqual(
            trainer.sha256(V1_ARTIFACT),
            "5a2d19d94b4867b17d037a58b941aafd779f68b2cd175d34d76a457c404a6910",
        )
        self.assertNotEqual(ARTIFACT.resolve(), V1_ARTIFACT.resolve())


if __name__ == "__main__":
    unittest.main()
