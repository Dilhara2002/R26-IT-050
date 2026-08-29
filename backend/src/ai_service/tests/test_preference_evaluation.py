import csv
from pathlib import Path
import sys
import tempfile
import unittest


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = AI_SERVICE_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import build_relevance_templates as builder
import evaluate_preference_recommender as evaluator
import validate_relevance_reviews as validator


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


class TemplateTests(unittest.TestCase):
    def test_profiles_and_places_build_exact_exhaustive_blind_grid(self):
        profiles = builder.read_csv(builder.PROFILES_PATH)
        places = builder.read_csv(builder.PLACES_PATH)
        rows = builder.build_rows(profiles, places)

        self.assertEqual(len(profiles), 15)
        self.assertEqual(len(places), 20)
        self.assertEqual(len(rows), 300)
        self.assertEqual(len({row["judgement_id"] for row in rows}), 300)
        self.assertTrue(all(row["relevance_label"] == "" for row in rows))
        self.assertTrue(all(row["reviewer_notes"] == "" for row in rows))
        forbidden = {
            "Tags",
            "Similarity_Score",
            "Proximity_Score",
            "Composite_Score",
            "model_rank",
        }
        self.assertTrue(forbidden.isdisjoint(rows[0]))

    def test_profile_combinations_are_unique_when_interest_order_is_ignored(self):
        profiles = builder.read_csv(builder.PROFILES_PATH)
        normalized = {
            tuple(sorted(profile["user_interests"].split("|"))) for profile in profiles
        }
        self.assertEqual(len(normalized), 15)

    def test_committed_reviewer_templates_are_identical_and_blank(self):
        header_a, rows_a = validator.read_csv_with_header(builder.DEFAULT_REVIEW_A)
        header_b, rows_b = validator.read_csv_with_header(builder.DEFAULT_REVIEW_B)
        self.assertEqual(header_a, validator.TEMPLATE_FIELDS)
        self.assertEqual(header_a, header_b)
        self.assertEqual(rows_a, rows_b)
        self.assertEqual(len(rows_a), 300)
        self.assertFalse(any(row["relevance_label"] for row in rows_a))


class ReviewValidationTests(unittest.TestCase):
    def setUp(self):
        _, self.blank_rows = validator.read_csv_with_header(builder.DEFAULT_REVIEW_A)

    def make_complete_rows(self, offset=0):
        rows = [dict(row) for row in self.blank_rows]
        for index, row in enumerate(rows):
            row["relevance_label"] = str((index + offset) % 3)
        return rows

    def test_blank_labels_fail_closed(self):
        with self.assertRaisesRegex(validator.ReviewValidationError, "300 blank"):
            validator.validate_review(builder.DEFAULT_REVIEW_A, "A")

    def test_invalid_label_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "review.csv"
            rows = self.make_complete_rows()
            rows[0]["relevance_label"] = "3"
            write_csv(path, validator.TEMPLATE_FIELDS, rows)
            with self.assertRaisesRegex(validator.ReviewValidationError, "outside 0, 1, 2"):
                validator.validate_review(path, "A")

    def test_canonical_evidence_change_is_rejected_even_if_both_reviewers_match(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "review.csv"
            rows = self.make_complete_rows()
            rows[0]["source_url"] = "https://example.test/altered"
            write_csv(path, validator.TEMPLATE_FIELDS, rows)
            with self.assertRaisesRegex(validator.ReviewValidationError, "changed canonical evidence"):
                validator.validate_review(path, "A")

    def test_structural_difference_is_rejected(self):
        rows_a = self.make_complete_rows()
        rows_b = self.make_complete_rows()
        rows_b[0]["poi_name"] = "Changed identity"
        with self.assertRaisesRegex(validator.ReviewValidationError, "templates differ"):
            validator.align_reviews(rows_a, rows_b)

    def test_missing_and_extra_ids_are_rejected(self):
        rows_a = self.make_complete_rows()
        rows_b = self.make_complete_rows()
        rows_b[0]["judgement_id"] = "unexpected-id"
        with self.assertRaisesRegex(validator.ReviewValidationError, "judgement IDs differ"):
            validator.align_reviews(rows_a, rows_b)

    def test_agreement_and_kappa_for_exact_match(self):
        rows = self.make_complete_rows()
        agreement, kappa = validator.agreement_statistics(validator.align_reviews(rows, rows))
        self.assertEqual(agreement, 100.0)
        self.assertEqual(kappa, 1.0)

    def test_disagreement_requires_explicit_adjudicated_label(self):
        rows_a = self.make_complete_rows()
        rows_b = self.make_complete_rows()
        rows_b[0]["relevance_label"] = "2" if rows_a[0]["relevance_label"] != "2" else "1"
        aligned = validator.align_reviews(rows_a, rows_b)
        disagreements = validator.disagreement_rows(aligned)
        self.assertEqual(len(disagreements), 1)
        with self.assertRaisesRegex(validator.ReviewValidationError, "No adjudicated"):
            validator.build_validated_rows(aligned, {})
        resolved = validator.build_validated_rows(
            aligned, {disagreements[0]["judgement_id"]: "1"}
        )
        self.assertEqual(resolved[0]["label_source"], "human_adjudication")
        self.assertEqual(resolved[0]["final_relevance_label"], "1")


class MetricTests(unittest.TestCase):
    def test_similarity_functions_use_only_explicit_tags(self):
        query = {"nature", "wildlife"}
        document = {"nature", "adventure"}
        self.assertAlmostEqual(evaluator.binary_cosine(query, document), 0.5)
        self.assertAlmostEqual(evaluator.jaccard_similarity(query, document), 1 / 3)
        idf = evaluator.make_idf([query, document])
        self.assertGreater(evaluator.tfidf_cosine(query, document, idf), 0.0)

    def test_all_five_methods_score_same_exhaustive_candidates_deterministically(self):
        profiles = builder.read_csv(builder.PROFILES_PATH)
        places = builder.read_csv(builder.PLACES_PATH)
        first = evaluator.score_methods(profiles, places)
        second = evaluator.score_methods(profiles, places)
        self.assertEqual(first, second)
        self.assertEqual(
            set(first),
            {
                "binary_tag_cosine",
                "jaccard_tag_overlap",
                "tfidf_cosine",
                "proximity_only_baseline",
                "current_70_proximity_30_similarity",
            },
        )
        expected_place_ids = {place["Place_ID"] for place in places}
        for profiles_by_method in first.values():
            self.assertEqual(len(profiles_by_method), 15)
            self.assertTrue(
                all(set(scores) == expected_place_ids for scores in profiles_by_method.values())
            )

    def test_ranking_metrics_on_explicitly_synthetic_labels(self):
        metrics = evaluator.ranking_metrics([2, 0, 1, 0, 0, 0])
        self.assertAlmostEqual(metrics["precision_at_5"], 0.4)
        self.assertAlmostEqual(metrics["recall_at_5"], 1.0)
        self.assertEqual(metrics["hit_rate_at_5"], 1.0)
        self.assertGreater(metrics["ndcg_at_5"], 0.0)
        self.assertLessEqual(metrics["ndcg_at_5"], 1.0)

    def test_pointwise_metrics_and_confusion_matrix(self):
        metrics = evaluator.pointwise_metrics([0, 0, 1, 1], [0, 1, 0, 1])
        self.assertEqual(metrics["confusion_matrix"], [[1, 1], [1, 1]])
        self.assertEqual(metrics["accuracy"], 0.5)
        self.assertEqual(metrics["balanced_accuracy"], 0.5)
        self.assertEqual(metrics["macro_f1"], 0.5)

    def test_threshold_tuning_is_deterministic(self):
        labels = [0, 0, 1, 1]
        scores = [0.1, 0.2, 0.8, 0.9]
        first = evaluator.tune_threshold(labels, scores)
        second = evaluator.tune_threshold(labels, scores)
        self.assertEqual(first, second)
        self.assertEqual(first[1]["balanced_accuracy"], 1.0)

    def test_ranking_ties_break_by_stable_place_id(self):
        ranked = evaluator.rank_scores({"place-b": 0.5, "place-a": 0.5, "place-c": 0.7})
        self.assertEqual([place_id for place_id, _ in ranked], ["place-c", "place-a", "place-b"])

    def test_profile_group_folds_are_deterministic_and_leakage_safe(self):
        profile_ids = [f"P{index:02d}" for index in range(1, 16)]
        first = evaluator.grouped_profile_folds(profile_ids)
        second = evaluator.grouped_profile_folds(profile_ids)
        self.assertEqual(first, second)
        self.assertEqual(sorted(profile for fold in first for profile in fold), profile_ids)
        self.assertTrue(all(len(fold) == 3 for fold in first))
        self.assertEqual(sum(len(set(fold)) for fold in first), 15)

    def test_incomplete_reviewer_template_cannot_be_evaluated(self):
        with self.assertRaisesRegex(evaluator.EvaluationBlockedError, "validator-produced"):
            evaluator.validate_adjudicated_rows(builder.DEFAULT_REVIEW_A)

    def test_end_to_end_report_assembly_uses_only_tiny_synthetic_fixture(self):
        profiles = [
            {"profile_id": f"S{index}", "user_interests": "Nature"}
            for index in range(1, 6)
        ]
        places = [
            {
                "Place_ID": "synthetic-irrelevant",
                "Tags": "History",
                "Latitude": "7.2906",
                "Longitude": "80.6337",
            },
            {
                "Place_ID": "synthetic-relevant",
                "Tags": "Nature",
                "Latitude": "7.3000",
                "Longitude": "80.6400",
            },
        ]
        rows = []
        for profile in profiles:
            for place, label in zip(places, ("0", "2")):
                rows.append(
                    {
                        "profile_id": profile["profile_id"],
                        "place_id": place["Place_ID"],
                        "reviewer_a_label": label,
                        "reviewer_b_label": label,
                        "final_relevance_label": label,
                    }
                )
        report = evaluator.evaluate(rows, profiles, places)
        self.assertEqual(report["evaluation_status"], "completed_from_validated_human_adjudication")
        self.assertEqual(len(report["methods"]), 5)
        self.assertEqual(report["reviewer_agreement"]["exact_agreement_percent"], 100.0)
        self.assertEqual(report["deployment_action"], "none")


if __name__ == "__main__":
    unittest.main()
