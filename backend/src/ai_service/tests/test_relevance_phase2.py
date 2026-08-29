import csv
from collections import Counter
from pathlib import Path
import sys
import unittest


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = AI_SERVICE_DIR / "scripts"
for path in (AI_SERVICE_DIR, SCRIPTS_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import model
import prepare_relevance_phase2 as phase2
import validate_central_extension_review_workbooks as reviewer_validator


REVIEW_A = phase2.EVALUATION_DIR / "reviewer_a_central_extension_60_v1.xlsx"
REVIEW_B = phase2.EVALUATION_DIR / "reviewer_b_central_extension_60_v1.xlsx"


def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


class CentralCatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.places = read_csv(phase2.PLACES_PATH)

    def test_catalogue_is_exactly_40_source_traced_central_province_pois(self):
        phase2.validate_places(self.places)
        self.assertEqual(len(self.places), 40)
        self.assertEqual(
            Counter(row["District"] for row in self.places),
            Counter(phase2.EXPECTED_DISTRICTS),
        )
        self.assertEqual(len({row["Place_ID"] for row in self.places}), 40)
        self.assertEqual(len({row["Name"].casefold() for row in self.places}), 40)
        self.assertTrue(all(row["Source_URL"].startswith("https://") for row in self.places))
        self.assertTrue(all(row["Verification_Status"] == "source_trace_verified" for row in self.places))
        self.assertFalse({"79", "Pothgulgala"} & {row["Legacy_Place_ID"] for row in self.places})

    def test_runtime_loads_the_exact_catalogue_without_training(self):
        self.assertEqual(model.DATASET_PATH.resolve(), phase2.PLACES_PATH.resolve())
        self.assertEqual(model.DATASET_VERSION, "central_province_runtime_verified_v1")
        self.assertEqual(model.DATA_SCOPE, "verified_central_province_v1")
        self.assertEqual(tuple(model.SUPPORTED_DISTRICTS), ("Kandy", "Matale", "Nuwara Eliya"))
        self.assertEqual(len(model.PLACES_DF), 40)
        self.assertFalse(model.get_relevance_engine_metadata()["runtime_training_performed"])

    def test_frozen_v1_svm_accepts_pairs_from_all_three_districts(self):
        self.assertTrue(model.load_relevance_artifact())
        for district in model.SUPPORTED_DISTRICTS:
            tags = model.PLACES_DF.loc[model.PLACES_DF["District"] == district, "Tags"].tolist()
            pairs = model.make_pair_frame(["Nature", "Culture"], tags)
            predictions = model.RELEVANCE_PIPELINE.predict(pairs)
            self.assertEqual(len(predictions), len(tags))
            self.assertTrue(set(map(int, predictions)).issubset({0, 1, 2}))


class CentralPhase2DatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profiles = read_csv(phase2.PROFILES_OUT)
        cls.split = read_csv(phase2.SPLIT_OUT)
        cls.weak = read_csv(phase2.WEAK_OUT)
        cls.evaluation = read_csv(phase2.EVALUATION_OUT)
        cls.examples = read_csv(phase2.EXAMPLES_OUT)

    def test_profiles_preserve_v1_and_add_five_training_profiles(self):
        v1 = read_csv(phase2.EVALUATION_DIR / "kandy_preference_profiles_v1.csv")
        self.assertEqual(self.profiles[:15], v1)
        self.assertEqual(len(self.profiles), 20)
        by_id = {row["profile_id"]: row["user_interests"] for row in self.profiles}
        self.assertEqual(
            {key: by_id[key] for key in ("P16", "P17", "P18", "P19", "P20")},
            dict(phase2.NEW_PROFILES),
        )
        self.assertEqual(Counter(row["interest_count"] for row in self.split), Counter({"1": 7, "2": 8, "3": 5}))
        self.assertEqual([row["profile_id"] for row in self.split if row["split"] == "heldout"], list(phase2.HELDOUT_IDS))
        self.assertTrue(all(row["split"] == "training" for row in self.split if row["profile_id"] >= "P16"))

    def test_exact_680_weak_120_evaluation_and_800_combined_rows(self):
        self.assertEqual(len(self.weak), 680)
        self.assertEqual(len(self.evaluation), 120)
        self.assertEqual(len(self.examples), 800)
        self.assertFalse({row["judgement_id"] for row in self.weak} & {row["judgement_id"] for row in self.evaluation})
        self.assertEqual(
            Counter(row["split"] for row in self.examples),
            Counter({"training": 680, "heldout": 120}),
        )

    def test_old_human_labels_are_exact_and_new_extension_is_blank(self):
        reference = read_csv(phase2.HUMAN_REFERENCE_PATH)
        old = [row for row in self.evaluation if row["evaluation_partition"] == "development_reference_kandy_v1"]
        new = [row for row in self.evaluation if row["evaluation_partition"] == "blinded_cross_district_extension_v2"]
        self.assertEqual(len(old), 60)
        self.assertEqual(len(new), 60)
        reference_labels = {row["judgement_id"]: row["final_relevance_label"] for row in reference}
        self.assertEqual(
            {row["judgement_id"]: row["final_relevance_label"] for row in old},
            reference_labels,
        )
        self.assertTrue(
            all(
                row[field] == ""
                for row in new
                for field in ("reviewer_a_label", "reviewer_b_label", "final_relevance_label")
            )
        )
        self.assertEqual({row["district"] for row in new}, {"Matale", "Nuwara Eliya"})


class CentralReviewWorkbookTests(unittest.TestCase):
    def test_packets_are_independently_ordered_equivalent_blank_extensions(self):
        rows_a, rows_b = reviewer_validator.validate_pair(REVIEW_A, REVIEW_B, expect_blank=True)
        self.assertEqual(len(rows_a), 60)
        self.assertEqual(len(rows_b), 60)
        self.assertNotEqual(
            [row["judgement_id"] for row in rows_a],
            [row["judgement_id"] for row in rows_b],
        )
        self.assertEqual(
            {row["judgement_id"] for row in rows_a},
            {row["judgement_id"] for row in rows_b},
        )
        self.assertTrue(all(row["relevance_label"] == "" for row in rows_a + rows_b))


if __name__ == "__main__":
    unittest.main()
