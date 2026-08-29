import json
import sys
from pathlib import Path
import unittest
from unittest import mock

import joblib
import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.base import clone


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import app as flask_app
import model
from relevance_features import EXCLUDED_LEAKAGE_FIELDS, RelevancePairFeatures, make_pair_frame
from scripts.train_relevance_model import candidate_specs


ARTIFACT = AI_SERVICE_DIR / "models" / "user_poi_relevance_v1.joblib"
METADATA = ARTIFACT.with_suffix(".metadata.json")
TRAINING = AI_SERVICE_DIR / "data" / "evaluation" / "rule_derived_weak_training_labels_v1.csv"


class RelevanceModelTests(unittest.TestCase):
    def setUp(self):
        self.original_pipeline = model.RELEVANCE_PIPELINE
        self.original_metadata = model.RELEVANCE_METADATA
        self.original_mode = model.PROFILING_MODE
        self.original_reason = model.RELEVANCE_FALLBACK_REASON

    def tearDown(self):
        model.RELEVANCE_PIPELINE = self.original_pipeline
        model.RELEVANCE_METADATA = self.original_metadata
        model.PROFILING_MODE = self.original_mode
        model.RELEVANCE_FALLBACK_REASON = self.original_reason

    def test_feature_contract_is_deterministic_and_ignores_extra_leakage_columns(self):
        base = make_pair_frame(["Nature", "History"], ["History|Culture"])
        leaked = base.assign(
            profile_id="P99",
            judgement_id="P99::poi",
            overlap_set="History",
            interest_coverage=1.0,
            final_adjudicated_label=2,
        )
        transformer = RelevancePairFeatures().fit(base)
        self.assertEqual(
            transformer.transform(base).tolist(),
            transformer.transform(leaked).tolist(),
        )
        self.assertTrue(
            set(EXCLUDED_LEAKAGE_FIELDS).isdisjoint(
                transformer.get_feature_names_out().tolist()
            )
        )

    def test_frozen_artifact_loads_and_predicts_all_classes_contract(self):
        pipeline = joblib.load(ARTIFACT)
        self.assertEqual(list(map(int, pipeline.classes_)), [0, 1, 2])
        rows = make_pair_frame(
            ["Nature", "History"],
            ["Religion", "Nature", "Nature|History"],
        )
        first = pipeline.predict(rows).tolist()
        second = pipeline.predict(rows).tolist()
        self.assertEqual(first, second)
        self.assertEqual(pipeline.predict_proba(rows).shape, (3, 3))

    def test_preprocessing_fit_count_excludes_the_heldout_rows(self):
        pipeline = joblib.load(ARTIFACT)
        metadata = json.loads(METADATA.read_text(encoding="utf-8"))
        self.assertEqual(pipeline.named_steps["features"].seen_row_count_, 240)
        self.assertTrue(
            set(metadata["training_profile_ids"]).isdisjoint(
                metadata["heldout_profile_ids"]
            )
        )

    def test_selected_training_is_repeatable_with_fixed_seed(self):
        frame = pd.read_csv(TRAINING)
        X = frame[["user_interests", "verified_poi_tags"]]
        y = frame["weak_label"].astype(int)
        template = candidate_specs()["Linear SVM"]["pipeline"].set_params(
            classifier__C=1.0,
            classifier__class_weight=None,
        )
        first = clone(template).fit(X, y)
        second = clone(template).fit(X, y)
        self.assertEqual(first.predict(X).tolist(), second.predict(X).tolist())
        self.assertEqual(first.predict_proba(X).tolist(), second.predict_proba(X).tolist())

    def test_grouped_split_has_no_profile_overlap(self):
        frame = pd.read_csv(TRAINING)
        splitter = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=42)
        for train_index, validation_index in splitter.split(
            frame, frame["weak_label"], groups=frame["profile_id"]
        ):
            train_profiles = set(frame.iloc[train_index]["profile_id"])
            validation_profiles = set(frame.iloc[validation_index]["profile_id"])
            self.assertTrue(train_profiles.isdisjoint(validation_profiles))

    def test_verified_artifact_activates_without_runtime_training(self):
        self.assertTrue(model.load_relevance_artifact(ARTIFACT))
        metadata = model.get_relevance_engine_metadata()
        expected = json.loads(METADATA.read_text(encoding="utf-8"))
        self.assertEqual(metadata["profiling_mode"], "trained_relevance_model")
        self.assertEqual(metadata["artifact_sha256"], expected["artifact_sha256"])
        self.assertFalse(metadata["runtime_training_performed"])

    def test_missing_artifact_enables_truthful_content_fallback(self):
        missing = ARTIFACT.with_name("does-not-exist.joblib")
        self.assertFalse(model.load_relevance_artifact(missing))
        metadata = model.get_relevance_engine_metadata()
        self.assertEqual(metadata["profiling_mode"], "content_based_fallback")
        self.assertIn("fallback_reason", metadata)
        filtered = model.filter_locations(["Nature"], 7.2906, 80.6337, 15)
        self.assertIsNotNone(filtered)
        self.assertTrue(filtered["Predicted_Relevance_Class"].isna().all())

    def test_api_exposes_additive_model_and_stop_evidence(self):
        self.assertTrue(model.load_relevance_artifact(ARTIFACT))
        with mock.patch.object(flask_app, "GEMINI_API_KEY", None):
            response = flask_app.app.test_client().post(
                "/api/optimize-itinerary",
                json={
                    "preferences": ["Nature"],
                    "max_time_minutes": 180,
                    "current_lat": 7.2906,
                    "current_lon": 80.6337,
                },
            )
        payload = response.get_json()
        self.assertEqual(response.status_code, 200, payload)
        data = payload["data"]
        self.assertEqual(data["profiling_mode"], "trained_relevance_model")
        self.assertEqual(data["dataset_version"], "central_province_runtime_verified_v1")
        self.assertEqual(data["covered_districts"], ["Kandy", "Matale", "Nuwara Eliya"])
        self.assertEqual(data["catalogue_poi_count"], 40)
        self.assertFalse(data["relevance_engine"]["runtime_training_performed"])
        self.assertTrue(data["optimized_stops"])
        for stop in data["optimized_stops"]:
            self.assertIn(stop["predicted_relevance_class"], (1, 2))
            self.assertIn("relevance_classification_score", stop)
            self.assertIn("not a user-satisfaction probability", stop["explanation"])


if __name__ == "__main__":
    unittest.main()
