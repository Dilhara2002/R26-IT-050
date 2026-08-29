import csv
import json
from pathlib import Path
import sys
import unittest
from unittest import mock
import xml.etree.ElementTree as ET

import joblib
import numpy as np


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = AI_SERVICE_DIR / "scripts"
for path in (AI_SERVICE_DIR, SCRIPTS_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import app as flask_app
import model
import evaluate_relevance_v2_single_reviewer as evaluator
import validate_central_extension_review_workbooks as packet_validator


WORKBOOK = Path(r"C:\Users\user\Downloads\reviewer_a_central_extension_60_completed.xlsx")
LABELS_CSV = evaluator.LABELS_OUT
RESULTS_CSV = evaluator.RESULTS_OUT
METRICS_JSON = evaluator.METRICS_OUT
CONFUSION_SVG = evaluator.CONFUSION_OUT
V1_ARTIFACT = AI_SERVICE_DIR / "models" / "user_poi_relevance_v1.joblib"
V2_ARTIFACT = evaluator.ARTIFACT_PATH


def read_csv(path):
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


class CompletedWorkbookValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows, cls.validation = evaluator.validate_completed_workbook(WORKBOOK)
        cls.exported = read_csv(LABELS_CSV)

    def test_completed_workbook_is_exact_canonical_single_reviewer_packet(self):
        self.assertEqual(self.validation["rows"], 60)
        self.assertEqual(self.validation["unique_judgement_ids"], 60)
        self.assertEqual(self.validation["profiles"], ["P06", "P08", "P13"])
        self.assertEqual(self.validation["unique_pois"], 20)
        self.assertEqual(
            self.validation["unique_pois_by_district"],
            {"Matale": 10, "Nuwara Eliya": 10},
        )
        self.assertEqual(self.validation["duplicate_profile_poi_pairs"], 0)
        self.assertEqual(self.validation["training_profile_leakage"], [])
        self.assertEqual(self.validation["human_label_distribution"], {"0": 16, "1": 6, "2": 38})

    def test_source_and_evidence_are_preserved_exactly(self):
        expected, _ = packet_validator.canonical_rows()
        exact_fields = (
            "judgement_id",
            "profile_id",
            "user_interests",
            "place_id",
            "poi_name",
            "district",
            "verified_poi_tags",
            "source_name",
            "source_url",
        )
        for row in self.exported:
            canonical = expected[row["judgement_id"]]
            for field in exact_fields:
                self.assertEqual(
                    row[field], canonical[packet_validator.IDENTITY_FIELDS.index(field)]
                )
            for field in ("latitude", "longitude"):
                self.assertAlmostEqual(
                    float(row[field]),
                    float(canonical[packet_validator.IDENTITY_FIELDS.index(field)]),
                    places=9,
                )

    def test_validated_csv_has_exact_single_reviewer_provenance(self):
        self.assertEqual(len(self.exported), 60)
        self.assertEqual({row["label_provenance"] for row in self.exported}, {"single_human_reviewer"})
        self.assertEqual(
            {row["reviewer_scope"] for row in self.exported},
            {"reviewer_a_only_no_agreement_or_adjudication"},
        )
        self.assertEqual(
            {row["source_workbook_sha256"] for row in self.exported},
            {"2bc4408f840087a152fecefb2a933ab1746177b72b599dc8f8c90a8668379a4a"},
        )


class FrozenEvaluationConsistencyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = json.loads(METRICS_JSON.read_text(encoding="utf-8"))
        cls.rows = read_csv(RESULTS_CSV)
        cls.actual = np.asarray([int(row["human_relevance_label"]) for row in cls.rows])
        cls.predicted = np.asarray([int(row["predicted_relevance_label"]) for row in cls.rows])

    def test_evaluation_profiles_were_excluded_from_candidate_fitting(self):
        metadata = json.loads(evaluator.METADATA_PATH.read_text(encoding="utf-8"))
        pipeline = joblib.load(V2_ARTIFACT)
        self.assertEqual(pipeline.named_steps["features"].seen_row_count_, 680)
        self.assertTrue(
            set(metadata["training_profile_ids"]).isdisjoint(
                self.result["scope"]["heldout_profiles"]
            )
        )
        self.assertEqual(metadata["excluded_evaluation_profile_ids"], ["P06", "P08", "P13"])

    def test_metrics_and_confusion_matrix_match_frozen_row_results(self):
        recalculated = evaluator.metric_bundle(self.actual, self.predicted)
        self.assertEqual(recalculated, self.result["metrics"])
        self.assertEqual(sum(sum(row) for row in recalculated["confusion_matrix"]), 60)
        self.assertEqual(recalculated["correct"], sum(row["correct"] == "True" for row in self.rows))

    def test_metric_and_bootstrap_functions_are_deterministic(self):
        self.assertEqual(
            evaluator.metric_bundle(self.actual, self.predicted),
            evaluator.metric_bundle(self.actual, self.predicted),
        )
        first = evaluator.bootstrap_intervals(self.actual, self.predicted, samples=100, seed=42)
        second = evaluator.bootstrap_intervals(self.actual, self.predicted, samples=100, seed=42)
        self.assertEqual(first, second)

    def test_activation_gate_is_mechanical_for_pass_and_fail(self):
        self.assertFalse(evaluator.activation_gate(self.result["metrics"])["passed"])
        perfect = evaluator.metric_bundle([0, 1, 2] * 20, [0, 1, 2] * 20)
        self.assertTrue(evaluator.activation_gate(perfect)["passed"])

    def test_artifact_and_workbook_hashes_are_frozen(self):
        self.assertEqual(evaluator.sha256(V2_ARTIFACT), evaluator.EXPECTED_ARTIFACT_SHA256)
        self.assertEqual(
            evaluator.sha256(WORKBOOK),
            "2bc4408f840087a152fecefb2a933ab1746177b72b599dc8f8c90a8668379a4a",
        )

    def test_confusion_svg_is_valid_xml(self):
        root = ET.parse(CONFUSION_SVG).getroot()
        self.assertTrue(root.tag.endswith("svg"))


class RuntimeGateTests(unittest.TestCase):
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

    def test_failed_gate_keeps_v1_runtime_active_for_rollback(self):
        result = json.loads(METRICS_JSON.read_text(encoding="utf-8"))
        self.assertFalse(result["activation_gate"]["passed"])
        self.assertEqual(model.RELEVANCE_MODEL_PATH.resolve(), V1_ARTIFACT.resolve())
        self.assertTrue(model.load_relevance_artifact())
        metadata = model.get_relevance_engine_metadata()
        self.assertEqual(metadata["model_version"], "v1")
        self.assertEqual(
            metadata["artifact_sha256"],
            "5a2d19d94b4867b17d037a58b941aafd779f68b2cd175d34d76a457c404a6910",
        )

    def test_api_contract_and_truthful_v1_metadata_remain_compatible(self):
        self.assertTrue(model.load_relevance_artifact())
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
        self.assertEqual(payload["data"]["relevance_engine"]["model_version"], "v1")
        self.assertFalse(payload["data"]["relevance_engine"]["runtime_training_performed"])
        self.assertEqual(payload["data"]["dataset_version"], "central_province_runtime_verified_v1")


if __name__ == "__main__":
    unittest.main()
