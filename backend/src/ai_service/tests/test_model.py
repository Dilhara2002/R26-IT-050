import json
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import pandas as pd


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import model


def make_places(ratings=None):
    ratings = ratings if ratings is not None else [4.5, 4.4, 4.3, 3.0]
    count = len(ratings)
    tag_cycle = ["Nature", "Nature|Culture", "Culture", "Nature", "Nature"]
    return pd.DataFrame(
        {
            "Name": [f"Place {index}" for index in range(count)],
            "Latitude": [7.2906 + (index * 0.001) for index in range(count)],
            "Longitude": [80.6337 for _ in range(count)],
            "Tags": tag_cycle[:count],
            "Duration_Minutes": [30 + (index * 5) for index in range(count)],
            "Rating": ratings,
        }
    )


def make_ga_places(count=6, duration=20):
    return pd.DataFrame(
        {
            "Name": [f"GA Place {index}" for index in range(count)],
            "Latitude": [7.2906 + (index * 0.0002) for index in range(count)],
            "Longitude": [80.6337 for _ in range(count)],
            "Duration_Minutes": [duration for _ in range(count)],
            "Similarity_Score": [0.5 + (index * 0.02) for index in range(count)],
            "Composite_Score": [0.6 + (index * 0.03) for index in range(count)],
        }
    )


class ModelTestCase(unittest.TestCase):
    def setUp(self):
        self.original_places = model.PLACES_DF
        self.original_tags = model.TAGS_ENCODED

    def tearDown(self):
        model.PLACES_DF = self.original_places
        model.TAGS_ENCODED = self.original_tags

    def install_places(self, places):
        model.PLACES_DF = places.copy()
        model.TAGS_ENCODED = (
            places["Tags"].fillna("General").str.get_dummies(sep="|")
        )

    def test_initialization_is_independent_of_current_working_directory(self):
        script = (
            "import json,sys; "
            f"sys.path.insert(0, {str(AI_SERVICE_DIR)!r}); "
            "import model; "
            "print(json.dumps({'rows': len(model.PLACES_DF), "
            "'missing_preserved': int(model.PLACES_DF['Rating'].isna().sum())}))"
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            completed = subprocess.run(
                [sys.executable, "-B", "-c", script],
                cwd=temporary_directory,
                check=True,
                capture_output=True,
                text=True,
            )
        result = json.loads(completed.stdout.strip().splitlines()[-1])
        self.assertEqual(result["rows"], 1000)

    def test_initialization_preserves_missing_ratings(self):
        places = make_places([None, "not observed", 4.2])
        with mock.patch.object(model.pd, "read_csv", return_value=places):
            self.assertTrue(model.initialize_ai_engine())
        self.assertTrue(model.PLACES_DF.loc[0, "Rating"] != model.PLACES_DF.loc[0, "Rating"])
        self.assertTrue(model.PLACES_DF.loc[1, "Rating"] != model.PLACES_DF.loc[1, "Rating"])
        self.assertEqual(model.PLACES_DF.loc[2, "Rating"], 4.2)

    def test_missing_rating_is_not_automatically_rejected(self):
        places = make_places([None, 4.5, 4.4, 4.3, 3.0])
        places["Tags"] = ["Nature"] * len(places)
        self.install_places(places)
        result = model.filter_locations(["Nature"], 7.2906, 80.6337, 10)
        self.assertIn("Place 0", result["Name"].tolist())

    def test_low_observed_rating_is_screened_with_sufficient_alternatives(self):
        places = make_places([4.5, 4.4, 4.3, 3.0])
        places["Tags"] = ["Nature"] * len(places)
        self.install_places(places)
        result = model.filter_locations(["Nature"], 7.2906, 80.6337, 10)
        self.assertNotIn("Place 3", result["Name"].tolist())
        self.assertEqual(len(result), 3)

    def test_composite_score_is_exactly_70_proximity_30_similarity(self):
        places = make_places([4.5, 4.4, 4.3])
        self.install_places(places)
        result = model.filter_locations(["Nature"], 7.2906, 80.6337, 10)
        expected = (
            result["Proximity_Score"] * 0.70
            + result["Similarity_Score"] * 0.30
        )
        pd.testing.assert_series_equal(
            result["Composite_Score"], expected, check_names=False
        )

    def test_crossover_produces_valid_route(self):
        child = model.crossover_routes(
            [0, 1, 2, 99], [2, 3, 4, 4], list(range(5)), random.Random(7)
        )
        self.assertTrue(child)
        self.assertLessEqual(len(child), 4)
        self.assertEqual(len(child), len(set(child)))
        self.assertTrue(set(child).issubset(set(range(5))))

    def test_mutation_produces_valid_route(self):
        mutated = model.mutate_route(
            [0, 1, 1, 99], list(range(5)), random.Random(3)
        )
        self.assertTrue(mutated)
        self.assertLessEqual(len(mutated), 4)
        self.assertEqual(len(mutated), len(set(mutated)))
        self.assertTrue(set(mutated).issubset(set(range(5))))

    def test_ga_has_unique_locations_and_at_most_four_stops(self):
        result, _, _ = model.run_genetic_algorithm(
            make_ga_places(), 180, 7.2906, 80.6337, random_seed=12
        )
        self.assertLessEqual(len(result), 4)
        self.assertEqual(len(result), len(set(result)))

    def test_ga_is_deterministic_for_fixed_seed(self):
        places = make_ga_places()
        first = model.run_genetic_algorithm(
            places, 120, 7.2906, 80.6337, random_seed=99
        )
        second = model.run_genetic_algorithm(
            places, 120, 7.2906, 80.6337, random_seed=99
        )
        self.assertEqual(first, second)

    def test_feasible_ga_route_respects_maximum_time(self):
        places = make_ga_places(duration=15)
        route, _, penalty = model.run_genetic_algorithm(
            places, 65, 7.2906, 80.6337, random_seed=8
        )
        indices = [int(item.split("GA Place ")[1].split(" ")[0]) for item in route]
        route_time, _ = model.evaluate_route(
            indices, places, 7.2906, 80.6337
        )
        self.assertFalse(penalty)
        self.assertLessEqual(route_time, 65)

    def test_very_short_time_uses_graceful_penalty_fallback(self):
        route, estimated_time, penalty = model.run_genetic_algorithm(
            make_ga_places(duration=30), 1, 7.2906, 80.6337, random_seed=1
        )
        self.assertEqual(len(route), 1)
        self.assertNotEqual(estimated_time, "0h 0m")
        self.assertTrue(penalty)

    def test_flask_endpoint_preserves_response_contract_without_gemini(self):
        import app as flask_app

        with mock.patch.object(
            flask_app, "generate_itinerary_summary", return_value="Local summary"
        ):
            response = flask_app.app.test_client().post(
                "/api/optimize-itinerary",
                json={
                    "preferences": ["Nature"],
                    "max_time_minutes": 120,
                    "current_lat": 7.2906,
                    "current_lon": 80.6337,
                },
            )
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "success")
        self.assertEqual(
            set(payload["data"]),
            {
                "starting_location",
                "search_radius_km",
                "user_preferences",
                "max_time_allocated_mins",
                "estimated_time_required",
                "time_limit_exceeded",
                "optimized_route",
                "ai_summary",
            },
        )


if __name__ == "__main__":
    unittest.main()
