import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import pandas as pd
import requests


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
        self.assertEqual(result["rows"], 40)

    def test_initialization_preserves_missing_ratings(self):
        places = self.original_places.copy()
        places["Rating"] = places["Rating"].astype(object)
        places.loc[0, "Rating"] = None
        places.loc[1, "Rating"] = "not observed"
        places.loc[2, "Rating"] = 4.2
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

    def test_additional_travel_reduces_fitness_when_other_evidence_is_equal(self):
        places = make_ga_places(count=2, duration=20)
        places.loc[:, "Composite_Score"] = 0.8
        places.loc[0, ["Latitude", "Longitude"]] = [7.2907, 80.6337]
        places.loc[1, ["Latitude", "Longitude"]] = [7.3906, 80.6337]
        near_fitness, _ = model._route_fitness([0], places, 180, 7.2906, 80.6337, 1)
        far_fitness, _ = model._route_fitness([1], places, 180, 7.2906, 80.6337, 1)
        self.assertGreater(near_fitness, far_fitness)

    def test_route_distance_and_time_use_consecutive_legs(self):
        places = make_ga_places(count=2, duration=0)
        places.loc[0, ["Latitude", "Longitude"]] = [7.3006, 80.6337]
        places.loc[1, ["Latitude", "Longitude"]] = [7.3106, 80.6337]
        distance = model.route_travel_distance_km([0, 1], places, 7.2906, 80.6337)
        expected = model.calculate_haversine_distance(7.2906, 80.6337, 7.3006, 80.6337)
        expected += model.calculate_haversine_distance(7.3006, 80.6337, 7.3106, 80.6337)
        repeated_start = model.calculate_haversine_distance(7.2906, 80.6337, 7.3006, 80.6337)
        repeated_start += model.calculate_haversine_distance(7.2906, 80.6337, 7.3106, 80.6337)
        self.assertAlmostEqual(distance, expected, places=9)
        self.assertLess(distance, repeated_start)

    def test_kandy_exact_open_path_reorders_town_peradeniya_town(self):
        names = ["Kandy Lake", "Royal Botanic Gardens, Peradeniya", "Arthur's Seat"]
        places = model.PLACES_DF.set_index("Name").loc[names].reset_index()
        observed = [0, 1, 2]
        ordered = model.minimum_open_path_order(observed, places, 7.2906, 80.6410)
        before = model.route_travel_distance_km(observed, places, 7.2906, 80.6410)
        after = model.route_travel_distance_km(ordered, places, 7.2906, 80.6410)
        self.assertEqual([places.iloc[index]["Name"] for index in ordered], [
            "Kandy Lake", "Arthur's Seat", "Royal Botanic Gardens, Peradeniya"
        ])
        self.assertLess(after, before)

    def test_replacement_uses_minimum_insertion_and_keeps_locked_order(self):
        places = make_ga_places(count=3, duration=10)
        places["Place_ID"] = places["Place_ID"].astype(object)
        places.loc[:, "Place_ID"] = ["accepted-a", "replacement", "accepted-b"]
        places.loc[:, "Latitude"] = [7.3006, 7.3106, 7.3206]
        order = model.minimum_replacement_insertion_order(
            [2, 1, 0], places, 7.2906, 80.6337, ["accepted-a", "accepted-b"]
        )
        self.assertEqual(order, [0, 1, 2])

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
        self.assertIsNone(summary)

    def test_unusable_gemini_keys_make_no_external_request(self):
        unusable_keys = [
            None,
            "",
            "   \t",
            "YOUR_API_KEY",
            "YOUR_GEMINI_API_KEY",
            "CHANGE_ME",
            "replace-with-your-api-key",
            "your Gemini API key here",
            "PASTE_API_KEY",
            "<placeholder>",
        ]
        with mock.patch.object(model.requests, "post") as post, self.assertLogs(
            model.LOGGER, level="WARNING"
        ) as captured:
            for api_key in unusable_keys:
                with self.subTest(api_key=api_key):
                    summary = model.generate_itinerary_summary(
                        ["Kandy Lake (60 mins)"],
                        ["Nature"],
                        api_key,
                        core_summary="Deterministic evidence summary.",
                    )
                    self.assertIsNone(summary)
            post.assert_not_called()
        self.assertTrue(all("category=missing_key" in line for line in captured.output))

    def test_gemini_network_failures_return_deterministic_xai(self):
        failures = [
            requests.ConnectTimeout("connect timed out"),
            requests.ReadTimeout("read timed out"),
            requests.ConnectionError("connection failed"),
        ]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__), mock.patch.object(
                model.requests, "post", side_effect=failure
            ) as post:
                summary = model.generate_itinerary_summary(
                    ["Kandy Lake (60 mins)"],
                    ["Nature"],
                    "AIza-valid-looking-test-key",
                    core_summary="Deterministic evidence summary.",
                )
                self.assertIsNone(summary)
                self.assertEqual(post.call_args.kwargs["timeout"], (2, 10))

    def test_gemini_http_fallback_statuses_return_no_guide(self):
        for status in [401, 403, 404, 429, 500, 503]:
            response = mock.Mock(status_code=status)
            response.raise_for_status.side_effect = requests.HTTPError(str(status))
            with self.subTest(status=status), mock.patch.object(
                model.requests, "post", return_value=response
            ):
                summary = model.generate_itinerary_summary(
                    ["Kandy Lake (60 mins)"],
                    ["Nature"],
                    "AIza-valid-looking-test-key",
                    core_summary="Deterministic evidence summary.",
                )
                self.assertIsNone(summary)

    def test_gemini_interactions_request_and_successful_final_model_output(self):
        response = mock.Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "outputs": [
                {
                    "type": "model_output",
                    "content": [{"type": "text", "text": "Friendly guide text."}],
                }
            ]
        }
        with mock.patch.dict(os.environ, {"GEMINI_MODEL": "gemini-test-model"}), mock.patch.object(
            model.requests, "post", return_value=response
        ) as post, mock.patch.object(
            model.time, "perf_counter", side_effect=[10.0, 10.123]
        ), self.assertLogs(model.LOGGER, level="INFO") as captured:
            summary = model.generate_itinerary_summary(
                ["Kandy Lake (60 mins)"],
                ["Nature"],
                "AIza-valid-looking-test-key",
                core_summary="Deterministic evidence summary.",
            )
        self.assertEqual(summary, "Friendly guide text.")
        self.assertEqual(post.call_args.args, (model.GEMINI_INTERACTIONS_URL,))
        self.assertEqual(
            post.call_args.kwargs["headers"],
            {
                "x-goog-api-key": "AIza-valid-looking-test-key",
                "Content-Type": "application/json",
            },
        )
        request_body = post.call_args.kwargs["json"]
        self.assertEqual(set(request_body), {"model", "input", "store"})
        self.assertEqual(request_body["model"], "gemini-test-model")
        self.assertFalse(request_body["store"])
        self.assertIn("Paraphrase", request_body["input"])
        self.assertIn("Deterministic evidence summary.", request_body["input"])
        success_log = "\n".join(captured.output)
        self.assertIn("request success", success_log)
        self.assertIn("model=gemini-test-model", success_log)
        self.assertIn("elapsed_ms=123", success_log)
        self.assertIn("output_chars=20", success_log)
        self.assertNotIn("AIza-valid-looking-test-key", success_log)
        self.assertNotIn("Deterministic evidence summary.", success_log)
        self.assertNotIn("Friendly guide text.", success_log)

    def test_gemini_defaults_model_and_selects_final_valid_model_output(self):
        response = mock.Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "outputs": [
                {"type": "tool_output", "content": [{"type": "text", "text": "ignore"}]},
                {
                    "type": "model_output",
                    "content": [{"type": "text", "text": "Earlier model text."}],
                },
                {
                    "type": "model_output",
                    "content": [
                        {"type": "text", "text": "Final model"},
                        {"type": "output_text", "text": "text."},
                    ],
                },
            ]
        }
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(
            model.requests, "post", return_value=response
        ) as post:
            summary = model.generate_itinerary_summary(
                ["Kandy Lake (60 mins)"],
                ["Nature"],
                "AIza-valid-looking-test-key",
                core_summary="Deterministic evidence summary.",
            )
        self.assertEqual(summary, "Final model\ntext.")
        self.assertEqual(model.DEFAULT_GEMINI_MODEL, "gemini-3.5-flash-lite")
        self.assertEqual(
            post.call_args.kwargs["json"]["model"], model.DEFAULT_GEMINI_MODEL
        )

    def test_gemini_timeout_and_http_diagnostics_are_sanitized(self):
        secret = "unit-test-secret-value"
        prompt_marker = "PRIVATE DETERMINISTIC EVIDENCE"
        with mock.patch.object(
            model.requests, "post", side_effect=requests.ReadTimeout("private timeout detail")
        ), mock.patch.object(
            model.time, "perf_counter", side_effect=[20.0, 20.5]
        ), self.assertLogs(model.LOGGER, level="WARNING") as timeout_logs:
            summary = model.generate_itinerary_summary(
                ["Private place"], ["Nature"], secret, core_summary=prompt_marker
            )
        self.assertIsNone(summary)
        timeout_log = "\n".join(timeout_logs.output)
        self.assertIn("category=timeout", timeout_log)
        self.assertIn("model=gemini-3.5-flash-lite", timeout_log)
        self.assertIn("elapsed_ms=500", timeout_log)
        self.assertNotIn(secret, timeout_log)
        self.assertNotIn(prompt_marker, timeout_log)
        self.assertNotIn("private timeout detail", timeout_log)

        response = mock.Mock(status_code=429)
        response.raise_for_status.side_effect = requests.HTTPError("private response detail")
        with mock.patch.object(
            model.requests, "post", return_value=response
        ), mock.patch.object(
            model.time, "perf_counter", side_effect=[30.0, 30.25]
        ), self.assertLogs(model.LOGGER, level="WARNING") as http_logs:
            summary = model.generate_itinerary_summary(
                ["Private place"], ["Nature"], secret, core_summary=prompt_marker
            )
        self.assertIsNone(summary)
        http_log = "\n".join(http_logs.output)
        self.assertIn("category=http_status", http_log)
        self.assertIn("model=gemini-3.5-flash-lite", http_log)
        self.assertIn("elapsed_ms=250", http_log)
        self.assertIn("http_status=429", http_log)
        self.assertNotIn(secret, http_log)
        self.assertNotIn(prompt_marker, http_log)
        self.assertNotIn("private response detail", http_log)

    def test_malformed_gemini_responses_return_deterministic_xai(self):
        malformed_responses = [
            ValueError("invalid JSON"),
            {},
            {"outputs": []},
            {"outputs": [{"type": "model_output", "content": [{}]}]},
            {
                "outputs": [
                    {"type": "model_output", "content": [{"type": "text", "text": "   "}]}
                ]
            },
            {
                "outputs": [
                    {
                        "type": "model_output",
                        "content": [{"type": "image", "text": "not text content"}],
                    }
                ]
            },
            {
                "outputs": [
                    {
                        "type": "model_output",
                        "content": [
                            {"type": "text", "text": "x" * (model.MAX_GEMINI_GUIDE_CHARS + 1)}
                        ],
                    }
                ]
            },
        ]
        for malformed in malformed_responses:
            response = mock.Mock()
            response.raise_for_status.return_value = None
            if isinstance(malformed, Exception):
                response.json.side_effect = malformed
            else:
                response.json.return_value = malformed
            with self.subTest(malformed=malformed), mock.patch.object(
                model.requests, "post", return_value=response
            ):
                summary = model.generate_itinerary_summary(
                    ["Kandy Lake (60 mins)"],
                    ["Nature"],
                    "AIza-valid-looking-test-key",
                    core_summary="Deterministic evidence summary.",
                )
                self.assertIsNone(summary)

    def test_gemini_secret_is_not_logged_or_returned(self):
        import app as flask_app

        secret = "AIza-super-secret-test-value"
        response = mock.Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "outputs": [
                {
                    "type": "model_output",
                    "content": [{"type": "text", "text": "Safe guide text."}],
                }
            ]
        }
        with mock.patch.object(flask_app, "GEMINI_API_KEY", secret), mock.patch.object(
            model.requests, "post", return_value=response
        ), self.assertLogs(model.LOGGER, level="INFO") as captured:
            endpoint_response = flask_app.app.test_client().post(
                "/api/optimize-itinerary",
                json={
                    "preferences": ["Nature"],
                    "max_time_minutes": 120,
                    "current_lat": 7.2906,
                    "current_lon": 80.6337,
                },
            )
        payload = endpoint_response.get_json()
        self.assertEqual(endpoint_response.status_code, 200, payload)
        self.assertEqual(payload["data"]["guide_explanation"], "Safe guide text.")
        self.assertNotIn(secret, json.dumps(payload))
        diagnostic = "\n".join(captured.output)
        self.assertNotIn(secret, diagnostic)
        self.assertNotIn("Safe guide text.", diagnostic)
        self.assertNotIn(payload["data"]["deterministic_explanation"]["summary"], diagnostic)

    def test_endpoint_retains_deterministic_xai_for_all_gemini_fallbacks(self):
        import app as flask_app

        http_response = mock.Mock(status_code=503)
        http_response.raise_for_status.side_effect = requests.HTTPError("private body")
        malformed_json = mock.Mock()
        malformed_json.raise_for_status.return_value = None
        malformed_json.json.side_effect = ValueError("private JSON detail")
        empty_output = mock.Mock()
        empty_output.raise_for_status.return_value = None
        empty_output.json.return_value = {
            "outputs": [
                {"type": "model_output", "content": [{"type": "text", "text": "  "}]}
            ]
        }
        non_text_output = mock.Mock()
        non_text_output.raise_for_status.return_value = None
        non_text_output.json.return_value = {
            "outputs": [
                {"type": "model_output", "content": [{"type": "image", "data": "ignored"}]}
            ]
        }
        failures = [
            requests.ReadTimeout("private timeout detail"),
            http_response,
            malformed_json,
            empty_output,
            non_text_output,
        ]
        for failure in failures:
            if isinstance(failure, Exception):
                post_patch = mock.patch.object(model.requests, "post", side_effect=failure)
            else:
                post_patch = mock.patch.object(model.requests, "post", return_value=failure)
            with self.subTest(failure=type(failure).__name__), mock.patch.object(
                flask_app, "GEMINI_API_KEY", "unit-test-valid-key"
            ), post_patch, self.assertLogs(model.LOGGER, level="WARNING"):
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
            self.assertEqual(response.status_code, 200, payload)
            self.assertIsNone(payload["data"]["guide_explanation"])
            self.assertIsNone(payload["data"]["ai_paraphrase"])
            self.assertEqual(
                payload["data"]["deterministic_explanation"],
                payload["data"]["route_explanation"],
            )

    def test_endpoint_blank_key_uses_non_empty_truthful_fallback_without_http(self):
        import app as flask_app

        with mock.patch.object(flask_app, "GEMINI_API_KEY", "   "), mock.patch.object(
            model.requests, "post"
        ) as post:
            response = flask_app.app.test_client().post(
                "/api/optimize-itinerary",
                json={
                    "preferences": ["Nature", "Adventure"],
                    "max_time_minutes": 360,
                    "current_lat": 7.2906,
                    "current_lon": 80.6337,
                },
            )
        payload = response.get_json()
        self.assertEqual(response.status_code, 200, payload)
        post.assert_not_called()
        self.assertIsNone(payload["data"]["ai_paraphrase"])
        self.assertIsNone(payload["data"]["guide_explanation"])
        self.assertEqual(
            payload["data"]["deterministic_explanation"],
            payload["data"]["route_explanation"],
        )


if __name__ == "__main__":
    unittest.main()
