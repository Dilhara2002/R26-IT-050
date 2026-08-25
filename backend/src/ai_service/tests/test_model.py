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
            "Place_ID": [f"test-{index}" for index in range(count)],
            "Legacy_Place_ID": [str(9000 + index) for index in range(count)],
            "Name": [f"Place {index}" for index in range(count)],
            "Latitude": [7.2906 + (index * 0.001) for index in range(count)],
            "Longitude": [80.6337 for _ in range(count)],
            "Tags": tag_cycle[:count],
            "Duration_Minutes": [30 + (index * 5) for index in range(count)],
            "Rating": ratings,
            "District": ["Kandy" for _ in range(count)],
            "Duration_Basis": ["research_estimate" for _ in range(count)],
            "Source_Name": ["Test Source" for _ in range(count)],
            "Source_URL": [f"https://example.test/{index}" for index in range(count)],
            "Source_License": ["Test License" for _ in range(count)],
            "Verification_Status": [model.VERIFIED_STATUS for _ in range(count)],
            "Verification_Note": ["Test-only verified fixture" for _ in range(count)],
        }
    )


def make_ga_places(count=6, duration=20):
    return pd.DataFrame(
        {
            "Place_ID": [1000 + index for index in range(count)],
            "Name": [f"GA Place {index}" for index in range(count)],
            "Latitude": [7.2906 + (index * 0.001) for index in range(count)],
            "Longitude": [80.6337 for _ in range(count)],
            "Tags": ["Nature|Culture" for _ in range(count)],
            "Duration_Minutes": [duration for _ in range(count)],
            "Similarity_Score": [0.5 + (index * 0.02) for index in range(count)],
            "Proximity_Score": [0.9 - (index * 0.02) for index in range(count)],
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
        self.assertEqual(result["rows"], 20)

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

    def test_pothgulgala_legacy_id_79_is_quarantined(self):
        result = model.filter_locations(["Nature", "Adventure"], 7.2906, 80.6337, 30)
        self.assertIsNotNone(result)
        self.assertNotIn("79", result["Legacy_Place_ID"].astype(str).tolist())
        self.assertNotIn("Pothgulgala", result["Name"].tolist())

    def test_runtime_results_are_verified_overlay_records_inside_radius(self):
        radius_km = 15
        result = model.filter_locations(["History", "Nature"], 7.2906, 80.6337, radius_km)
        verified_ids = set(model.PLACES_DF["Place_ID"].astype(str))
        self.assertTrue(set(result["Place_ID"].astype(str)).issubset(verified_ids))
        self.assertTrue(result["Verification_Status"].eq(model.VERIFIED_STATUS).all())
        self.assertTrue((result["Distance_From_Start"] <= radius_km).all())

    def test_filter_rejects_duplicate_ids_and_near_identical_coordinates(self):
        places = make_places([4.5, 4.5, 4.5, 4.5])
        places["Tags"] = ["Nature"] * len(places)
        places.loc[1, "Place_ID"] = places.loc[0, "Place_ID"]
        places.loc[2, ["Latitude", "Longitude"]] = [7.29061, 80.6337]
        self.install_places(places)
        result = model.filter_locations(["Nature"], 7.2906, 80.6337, 10)
        self.assertEqual(len(result), 2)
        self.assertEqual(len(set(result["Place_ID"])), 2)

    def test_crossover_produces_valid_route(self):
        child = model.crossover_routes(
            [0, 1, 2, 99], [2, 3, 4, 4], list(range(5)), random.Random(7)
        )
        self.assertTrue(child)
        self.assertLessEqual(len(child), model.MAX_ROUTE_STOPS)
        self.assertEqual(len(child), len(set(child)))
        self.assertTrue(set(child).issubset(set(range(5))))

    def test_mutation_produces_valid_route(self):
        mutated = model.mutate_route(
            [0, 1, 1, 99], list(range(5)), random.Random(3)
        )
        self.assertTrue(mutated)
        self.assertLessEqual(len(mutated), model.MAX_ROUTE_STOPS)
        self.assertEqual(len(mutated), len(set(mutated)))
        self.assertTrue(set(mutated).issubset(set(range(5))))

    def test_ga_has_unique_locations_and_adaptive_capacity(self):
        result, _, _ = model.run_genetic_algorithm(
            make_ga_places(count=10, duration=30),
            360,
            7.2906,
            80.6337,
            random_seed=12,
        )
        self.assertGreater(len(result), 4)
        self.assertLessEqual(len(result), 8)
        self.assertEqual(len(result), len(set(result)))

    def test_time_budgets_use_adaptive_capacity_and_consistent_accounting(self):
        places = make_ga_places(count=10, duration=45)
        results = []
        for budget in (120, 240, 360, 480):
            result = model.run_genetic_algorithm_details(
                places,
                budget,
                7.2906,
                80.6337,
                random_seed=17,
                user_preferences=["Nature"],
            )
            results.append(result)
            self.assertGreaterEqual(len(result["optimized_route"]), 1)
            self.assertLessEqual(len(result["optimized_route"]), 8)
            self.assertEqual(
                len(result["optimized_route"]),
                len(set(result["optimized_route"])),
            )
            self.assertLessEqual(result["planned_time_minutes"], budget)
            self.assertEqual(
                result["planned_time_minutes"],
                result["visit_time_minutes"] + result["travel_time_minutes"],
            )
            self.assertEqual(
                result["remaining_time_minutes"],
                budget - result["planned_time_minutes"],
            )
            self.assertAlmostEqual(
                result["time_utilization_percent"],
                result["planned_time_minutes"] / budget * 100,
                delta=0.6,
            )
            hours, minutes = result["estimated_time_required"].replace("m", "").split("h ")
            self.assertEqual(int(hours) * 60 + int(minutes), result["planned_time_minutes"])

        stop_counts = [len(result["optimized_route"]) for result in results]
        planned_times = [result["planned_time_minutes"] for result in results]
        self.assertEqual(stop_counts, sorted(stop_counts))
        self.assertEqual(planned_times, sorted(planned_times))
        self.assertGreater(stop_counts[-1], stop_counts[0])

    def test_irrelevant_stops_are_not_added_only_to_fill_budget(self):
        places = make_ga_places(count=8, duration=45)
        places.loc[:3, ["Similarity_Score", "Composite_Score"]] = [0.9, 0.9]
        places.loc[4:, ["Similarity_Score", "Composite_Score"]] = [0.0, 0.0]
        result = model.run_genetic_algorithm_details(
            places, 480, 7.2906, 80.6337, random_seed=21
        )
        selected_names = {stop["name"] for stop in result["optimized_stops"]}
        self.assertTrue(selected_names)
        self.assertTrue(
            selected_names.issubset({f"GA Place {index}" for index in range(4)})
        )

    def test_three_stops_are_allowed_when_they_fit_truthfully(self):
        places = make_ga_places(count=3, duration=55)
        result = model.run_genetic_algorithm_details(
            places, 180, 7.2906, 80.6337, random_seed=21, user_preferences=["Nature"]
        )
        self.assertEqual(len(result["optimized_stops"]), 3)
        self.assertLessEqual(result["planned_time_minutes"], 180)

    def test_optimized_stops_match_route_and_have_truthful_numeric_locations(self):
        places = make_ga_places(count=7, duration=35)
        # A duplicate identity/location must never be selected twice.
        places.loc[6, "Place_ID"] = places.loc[5, "Place_ID"]
        places.loc[6, ["Latitude", "Longitude"]] = places.loc[
            5, ["Latitude", "Longitude"]
        ]
        result = model.run_genetic_algorithm_details(
            places,
            300,
            7.2906,
            80.6337,
            random_seed=33,
            user_preferences=["Nature"],
        )
        stops = result["optimized_stops"]
        route_from_stops = [
            f"{stop['name']} ({stop['duration_minutes']} mins)" for stop in stops
        ]
        self.assertEqual(route_from_stops, result["optimized_route"])
        self.assertEqual(
            [stop["sequence"] for stop in stops], list(range(1, len(stops) + 1))
        )
        self.assertTrue(
            all(
                isinstance(stop["latitude"], float)
                and isinstance(stop["longitude"], float)
                for stop in stops
            )
        )
        self.assertEqual(len({stop["place_id"] for stop in stops}), len(stops))
        self.assertEqual(
            len({(stop["latitude"], stop["longitude"]) for stop in stops}),
            len(stops),
        )
        self.assertTrue(all(stop["matched_preferences"] == ["Nature"] for stop in stops))
        self.assertTrue(all(stop["explanation"].strip() for stop in stops))
        self.assertTrue(all("similarity" in stop["explanation"] for stop in stops))

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

    def test_very_short_time_does_not_return_an_over_budget_fallback(self):
        route, estimated_time, penalty = model.run_genetic_algorithm(
            make_ga_places(duration=30), 1, 7.2906, 80.6337, random_seed=1
        )
        self.assertEqual(route, [])
        self.assertEqual(estimated_time, "0h 0m")
        self.assertTrue(penalty)

    def test_flask_endpoint_preserves_response_contract_without_gemini(self):
        import app as flask_app

        with mock.patch.object(flask_app, "GEMINI_API_KEY", None):
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
        self.assertTrue(
            {
                "starting_location",
                "search_radius_km",
                "user_preferences",
                "max_time_allocated_mins",
                "estimated_time_required",
                "time_limit_exceeded",
                "optimized_route",
                "ai_summary",
                "data_scope",
                "verification_status",
                "route_explanation",
                "travel_estimation",
            }.issubset(payload["data"])
        )
        self.assertTrue(
            {
                "optimized_stops",
                "planned_time_minutes",
                "visit_time_minutes",
                "travel_time_minutes",
                "remaining_time_minutes",
                "time_utilization_percent",
            }.issubset(payload["data"])
        )
        self.assertIn("heuristic genetic algorithm", payload["data"]["ai_summary"])
        self.assertEqual(
            payload["data"]["ai_summary"],
            payload["data"]["route_explanation"]["summary"],
        )
        self.assertTrue(
            all(stop["explanation"] for stop in payload["data"]["optimized_stops"])
        )

    def test_insufficient_verified_candidates_returns_controlled_response(self):
        import app as flask_app

        response = flask_app.app.test_client().post(
            "/api/optimize-itinerary",
            json={
                "preferences": ["Beach"],
                "max_time_minutes": 120,
                "current_lat": 7.2906,
                "current_lon": 80.6337,
            },
        )
        payload = response.get_json()
        self.assertEqual(response.status_code, 404)
        self.assertEqual(payload["code"], "insufficient_verified_evidence")
        self.assertEqual(payload["data_scope"], model.DATA_SCOPE)

    def test_core_xai_does_not_require_gemini(self):
        summary = model.generate_itinerary_summary(
            ["Kandy Lake (60 mins)"],
            ["Nature"],
            "",
            core_summary="Deterministic evidence summary.",
        )
        self.assertEqual(summary, "Deterministic evidence summary.")


if __name__ == "__main__":
    unittest.main()
